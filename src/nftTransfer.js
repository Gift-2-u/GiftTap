/**
 * Metaplex Core asset transfer (GiftLocksmith etc.) from game wallet.
 */
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { mplCore, transferV1, fetchAssetV1 } from '@metaplex-foundation/mpl-core';
import { keypairIdentity, publicKey } from '@metaplex-foundation/umi';
import bs58 from 'bs58';
import { keypairFromMnemonic } from './solanaWallet';
import { RPC_URL } from './rpc';
import { LOCKSMITH_COLLECTION } from './locksmith';

function umiFromSecret(secretPhraseOrBase58) {
  const raw = String(secretPhraseOrBase58 || '').trim();
  if (!raw) throw new Error('Unlock your game wallet first');
  let secretKey;
  if (raw.includes(' ')) {
    const kp = keypairFromMnemonic(raw);
    secretKey = kp.secretKey;
  } else {
    secretKey = bs58.decode(raw);
  }
  const umi = createUmi(RPC_URL || 'https://api.mainnet-beta.solana.com').use(mplCore());
  const keypair = umi.eddsa.createKeypairFromSecretKey(secretKey);
  umi.use(keypairIdentity(keypair));
  return { umi, owner: keypair.publicKey };
}

/**
 * Transfer a Core asset to `toWallet` (base58).
 * @returns {Promise<{ signature: string, asset: string, to: string }>}
 */
export async function transferCoreNft(secretPhraseOrBase58, assetId, toWallet) {
  const assetPk = String(assetId || '').trim();
  const to = String(toWallet || '').trim();
  if (assetPk.length < 32) throw new Error('Invalid NFT asset id');
  if (to.length < 32) throw new Error('Invalid destination wallet');

  const { umi, owner } = umiFromSecret(secretPhraseOrBase58);
  const asset = publicKey(assetPk);
  const newOwner = publicKey(to);

  let assetAccount;
  try {
    assetAccount = await fetchAssetV1(umi, asset);
  } catch (e) {
    throw new Error(`Could not load NFT on-chain. (${e?.message || e})`);
  }

  const ownerStr = String(assetAccount.owner || '');
  if (ownerStr !== String(owner)) {
    throw new Error('This game wallet does not own that NFT anymore');
  }

  // Collection is required for assets that belong to a collection
  let collectionPk = publicKey(LOCKSMITH_COLLECTION);
  try {
    const ua = assetAccount.updateAuthority;
    if (ua && (ua.type === 'Collection' || ua.__kind === 'Collection') && ua.address) {
      collectionPk = publicKey(String(ua.address));
    }
  } catch {
    /* use default Locksmith collection */
  }

  const builder = transferV1(umi, {
    asset,
    newOwner,
    collection: collectionPk,
  });

  const result = await builder.sendAndConfirm(umi);
  const signature =
    typeof result.signature === 'string'
      ? result.signature
      : bs58.encode(ResultToBytes(result.signature));

  return { signature, asset: assetPk, to };
}

function ResultToBytes(sig) {
  if (sig instanceof Uint8Array) return sig;
  if (Array.isArray(sig)) return new Uint8Array(sig);
  return new Uint8Array(sig);
}

export { LOCKSMITH_COLLECTION };

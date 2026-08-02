/**
 * Mint GiftLocksmith Wave 1 from Core Candy Machine (mainnet).
 * Pays 0.25 SOL via solPayment guard to treasury.
 */
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { mplCore } from '@metaplex-foundation/mpl-core';
import {
  mintV1,
  mplCandyMachine,
} from '@metaplex-foundation/mpl-core-candy-machine';
import { setComputeUnitLimit } from '@metaplex-foundation/mpl-toolbox';
import {
  generateSigner,
  keypairIdentity,
  publicKey,
  some,
  transactionBuilder,
} from '@metaplex-foundation/umi';
import bs58 from 'bs58';
import { keypairFromMnemonic } from './solanaWallet';
import { RPC_URL } from './rpc';
import {
  LOCKSMITH_COLLECTION,
} from './locksmith';

export const LOCKSMITH_WAVE1 = {
  candyMachine: 'AQbpmorxtBaaipqm4WcmCyBzci8Qf8km9qF8kAidsMkC',
  candyGuard: 'CBK1Zwsnwwks3BLmhHASzD9Rsq8i2Xgs6RWMZGNSQRJ9',
  collection: LOCKSMITH_COLLECTION,
  treasury: 'AdvMvv6GzGvdLRtuxaso1Eubk7jmn6LCZEeEFHn22yeb',
  priceSol: 0.25,
  maxPerWallet: 5,
  itemsAvailable: 500,
  wave: 1,
  imageUri:
    'https://gateway.irys.xyz/HXQ5D7Iu_vkgUsW4I6W7LQ0Vn3J5rTQJXkgxMwh28k4',
};

function umiFromSecret(secretPhraseOrBase58) {
  const umi = createUmi(RPC_URL).use(mplCore()).use(mplCandyMachine());
  let secretKey;
  if (String(secretPhraseOrBase58).includes(' ')) {
    const kp = keypairFromMnemonic(String(secretPhraseOrBase58).trim());
    secretKey = kp.secretKey;
  } else {
    secretKey = bs58.decode(String(secretPhraseOrBase58).trim());
  }
  const umiKp = umi.eddsa.createKeypairFromSecretKey(secretKey);
  umi.use(keypairIdentity(umiKp));
  return umi;
}

/**
 * @param {string} secretPhraseOrBase58 - game wallet mnemonic or base58 secret
 * @returns {Promise<{ asset: string, signature: string, owner: string }>}
 */
export async function mintLocksmithWave1(secretPhraseOrBase58) {
  if (!secretPhraseOrBase58) {
    throw new Error('Wallet secret not available. Unlock your game wallet first.');
  }

  const umi = umiFromSecret(secretPhraseOrBase58);
  const asset = generateSigner(umi);
  const candyMachine = publicKey(LOCKSMITH_WAVE1.candyMachine);
  const collection = publicKey(LOCKSMITH_WAVE1.collection);
  const treasury = publicKey(LOCKSMITH_WAVE1.treasury);

  const builder = transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 400_000 }))
    .add(
      mintV1(umi, {
        candyMachine,
        asset,
        collection,
        candyGuard: publicKey(LOCKSMITH_WAVE1.candyGuard),
        mintArgs: {
          solPayment: some({ destination: treasury }),
          mintLimit: some({ id: LOCKSMITH_WAVE1.wave }),
        },
      }),
    );

  const result = await builder.sendAndConfirm(umi, {
    confirm: { commitment: 'confirmed' },
  });

  const signature =
    typeof result.signature === 'string'
      ? result.signature
      : bs58.encode(result.signature);

  return {
    asset: asset.publicKey.toString(),
    signature,
    owner: umi.identity.publicKey.toString(),
    priceSol: LOCKSMITH_WAVE1.priceSol,
  };
}

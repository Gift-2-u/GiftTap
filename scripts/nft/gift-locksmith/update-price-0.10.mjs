/**
 * Update GiftLocksmith Wave 1 candy guard solPayment → 0.10 SOL.
 *
 *   export CONFIRM_MAINNET=yes
 *   export RPC_URL="..."   # optional
 *   node update-price-0.10.mjs
 *
 * Authority = ~/.config/solana/id.json (AdvMvv6… treasury).
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { mplCore } from '@metaplex-foundation/mpl-core';
import {
  updateCandyGuard,
  mplCandyMachine,
  fetchCandyGuard,
} from '@metaplex-foundation/mpl-core-candy-machine';
import { setComputeUnitPrice, setComputeUnitLimit } from '@metaplex-foundation/mpl-toolbox';
import {
  keypairIdentity,
  publicKey,
  some,
  sol,
  transactionBuilder,
} from '@metaplex-foundation/umi';
import bs58 from 'bs58';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CANDY_MACHINE = 'AQbpmorxtBaaipqm4WcmCyBzci8Qf8km9qF8kAidsMkC';
const CANDY_GUARD = 'CBK1Zwsnwwks3BLmhHASzD9Rsq8i2Xgs6RWMZGNSQRJ9';
const TREASURY = 'AdvMvv6GzGvdLRtuxaso1Eubk7jmn6LCZEeEFHn22yeb';
const NEW_PRICE_SOL = 0.1;
const WAVE = 1;

const CLUSTER = process.env.CLUSTER || 'mainnet';
const CONFIRM = (process.env.CONFIRM_MAINNET || '').toLowerCase();
const RPC_URL =
  process.env.RPC_URL ||
  process.env.VITE_SOLANA_RPC_URL ||
  'https://api.mainnet-beta.solana.com';
const KEYPAIR_PATH =
  process.env.KEYPAIR_PATH ||
  path.join(os.homedir(), '.config', 'solana', 'id.json');

function loadSecret() {
  const raw = JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf8'));
  return new Uint8Array(raw);
}

function sigOf(result) {
  return typeof result.signature === 'string'
    ? result.signature
    : bs58.encode(result.signature);
}

async function main() {
  if (CLUSTER === 'mainnet' && CONFIRM !== 'yes') {
    console.error('Set CONFIRM_MAINNET=yes to run on mainnet.');
    process.exit(1);
  }

  console.log('=== GiftLocksmith Wave 1 — update solPayment to', NEW_PRICE_SOL, 'SOL ===');
  console.log('RPC:       ', RPC_URL);
  console.log('Keypair:   ', KEYPAIR_PATH);
  console.log('CandyGuard:', CANDY_GUARD);
  console.log('Treasury:  ', TREASURY);

  const umi = createUmi(RPC_URL).use(mplCore()).use(mplCandyMachine());
  const kp = umi.eddsa.createKeypairFromSecretKey(loadSecret());
  umi.use(keypairIdentity(kp));
  console.log('Signer:    ', umi.identity.publicKey.toString());

  if (umi.identity.publicKey.toString() !== TREASURY) {
    console.warn(
      '⚠ Signer is not TREASURY. Guard updates usually need the guard authority (AdvMvv6…).',
    );
  }

  const candyGuard = publicKey(CANDY_GUARD);
  const treasury = publicKey(TREASURY);

  try {
    const before = await fetchCandyGuard(umi, candyGuard);
    const prevPay = before?.guards?.solPayment;
    console.log('\nCurrent solPayment:', prevPay ? JSON.stringify(prevPay) : '(none)');
  } catch (e) {
    console.warn('Could not fetch current guard:', e?.message || e);
  }

  console.log('\nSending updateCandyGuard…');
  const sendOpts = {
    send: { skipPreflight: false, maxRetries: 5 },
    confirm: { commitment: 'confirmed' },
  };
  const builder = transactionBuilder()
    .add(setComputeUnitLimit(umi, { units: 400_000 }))
    .add(setComputeUnitPrice(umi, { microLamports: 100_000 }))
    .add(
      updateCandyGuard(umi, {
        candyGuard,
        guards: {
          solPayment: some({
            lamports: sol(NEW_PRICE_SOL),
            destination: treasury,
          }),
          botTax: some({
            lamports: sol(0.001),
            lastInstruction: true,
          }),
          mintLimit: some({
            id: WAVE,
            limit: 5,
          }),
        },
        groups: [],
      }),
    );
  const tx = await builder.sendAndConfirm(umi, sendOpts);

  const signature = sigOf(tx);
  console.log('✅ Updated. Tx:', signature);
  console.log('Solscan:', `https://solscan.io/tx/${signature}`);

  try {
    const after = await fetchCandyGuard(umi, candyGuard);
    console.log('\nNew solPayment:', JSON.stringify(after?.guards?.solPayment ?? null));
  } catch {
    /* ignore */
  }

  const out = {
    candyMachine: CANDY_MACHINE,
    candyGuard: CANDY_GUARD,
    priceSol: NEW_PRICE_SOL,
    treasury: TREASURY,
    signature,
    updatedAt: new Date().toISOString(),
  };
  const outPath = path.join(__dirname, 'wave1-price-0.10-result.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log('\nSaved:', outPath);

  // Keep wave1-result.json in sync for humans
  const wave1Path = path.join(__dirname, 'wave1-result.json');
  if (fs.existsSync(wave1Path)) {
    const w = JSON.parse(fs.readFileSync(wave1Path, 'utf8'));
    w.priceSol = NEW_PRICE_SOL;
    w.guards = { ...(w.guards || {}), solPayment: NEW_PRICE_SOL };
    w.priceUpdateTx = signature;
    w.priceUpdatedAt = out.updatedAt;
    w.note =
      'Wave 1 live. solPayment updated to 0.10 SOL. Max 5 mints/wallet. Hidden settings unchanged.';
    fs.writeFileSync(wave1Path, JSON.stringify(w, null, 2));
    console.log('Updated:', wave1Path);
  }
}

main().catch((err) => {
  console.error('\n❌ Update failed:', err?.message || err);
  if (err?.logs) console.error(err.logs);
  if (err?.cause) console.error(err.cause);
  process.exit(1);
});

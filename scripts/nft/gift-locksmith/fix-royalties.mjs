/**
 * ONE-TIME backfill: 5% Royalties + creator on ALL minted Gift2u Elves NFTs.
 * Covers the whole collection: Fate, Echo, Rush, Shadow, Locksmith (+ Star if any).
 * (Lives under gift-locksmith/ but is NOT Locksmith-only — same collection id.)
 *
 * New mints: sealed on activate via _shared/nftRoyalties.ts.
 *
 * Usage (authority = AdvMvv6 ~/.config/solana/id.json):
 *
 *   cd scripts/nft/gift-locksmith
 *   node fix-royalties.mjs                    # dry-run
 *   CONFIRM_MAINNET=yes node fix-royalties.mjs  # live
 *
 * Optional: COLLECTION, TREASURY, KEYPAIR_PATH, ONLY_ASSET, RPC_URL
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import {
  addPlugin,
  mplCore,
  ruleSet,
  updatePlugin,
} from '@metaplex-foundation/mpl-core';
import { keypairIdentity, publicKey } from '@metaplex-foundation/umi';
import bs58 from 'bs58';

const COLLECTION =
  process.env.COLLECTION || 'FQPYWSohCPnS57W2AWAqwmQM21KRxGi4YXcCaiXUghPD';
const TREASURY =
  process.env.TREASURY || 'AdvMvv6GzGvdLRtuxaso1Eubk7jmn6LCZEeEFHn22yeb';
const TARGET_BPS = Number(process.env.ROYALTY_BPS || 500); // 5%
const RPC_URL =
  process.env.RPC_URL ||
  process.env.VITE_SOLANA_RPC_URL ||
  // Helius DAS required for searchAssets / getAsset
  'https://mainnet.helius-rpc.com/?api-key=538f6c8f-c773-46a2-939c-6d48c75b2226';
const KEYPAIR_PATH =
  process.env.KEYPAIR_PATH ||
  path.join(os.homedir(), '.config', 'solana', 'id.json');
const CONFIRM = (process.env.CONFIRM_MAINNET || '').toLowerCase() === 'yes';
const ONLY_ASSET = process.env.ONLY_ASSET || '';
const DRY = !CONFIRM;

function loadSecret() {
  const raw = JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf8'));
  if (!Array.isArray(raw)) throw new Error('Keypair must be Solana CLI byte array JSON');
  return new Uint8Array(raw);
}

async function das(method, params) {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(JSON.stringify(json.error));
  return json.result;
}

async function listCollectionAssets() {
  if (ONLY_ASSET) return [ONLY_ASSET];
  const ids = [];
  let page = 1;
  for (;;) {
    const result = await das('searchAssets', {
      grouping: ['collection', COLLECTION],
      page,
      limit: 1000,
    });
    const items = result?.items || [];
    for (const it of items) {
      if (it?.id) ids.push(it.id);
    }
    const total = result?.total ?? ids.length;
    console.log(`  page ${page}: +${items.length} (listed ${ids.length}/${total})`);
    if (items.length === 0 || ids.length >= total) break;
    page += 1;
    if (page > 50) break;
  }
  return ids;
}

function royaltyBpsFromAsset(asset) {
  const bp = asset?.royalty?.basis_points;
  if (typeof bp === 'number') return bp;
  const plug = asset?.plugins?.royalties?.data?.basis_points;
  if (typeof plug === 'number') return plug;
  // empty plugins → no asset-level royalties (collection may still apply)
  if (!asset?.plugins || Object.keys(asset.plugins).length === 0) return null;
  if (!asset.plugins.royalties) return null;
  return 0;
}

function classFromName(name) {
  const n = String(name || '').toLowerCase();
  if (n.includes('fate')) return 'Fate';
  if (n.includes('echo')) return 'Echo';
  if (n.includes('rush')) return 'Rush';
  if (n.includes('shadow')) return 'Shadow';
  if (n.includes('locksmith') || n.includes('giftlocksmith')) return 'Locksmith';
  if (n.includes('star')) return 'Star';
  return 'Other';
}

async function main() {
  console.log('=== Gift2u Elves royalty seal (ALL classes) ===');
  console.log('Fate · Echo · Rush · Shadow · Locksmith (+ Star if present)');
  console.log('Collection:', COLLECTION);
  console.log('Treasury:  ', TREASURY);
  console.log('Target:    ', TARGET_BPS, 'bps (', TARGET_BPS / 100, '%)');
  console.log('RPC:       ', RPC_URL.replace(/api-key=[^&]+/i, 'api-key=***'));
  console.log('Keypair:   ', KEYPAIR_PATH);
  console.log('Mode:      ', DRY ? 'DRY-RUN (set CONFIRM_MAINNET=yes to send txs)' : 'LIVE MAINNET');
  console.log('');

  const umi = createUmi(RPC_URL).use(mplCore());
  const kp = umi.eddsa.createKeypairFromSecretKey(loadSecret());
  umi.use(keypairIdentity(kp));
  console.log('Signer:    ', umi.identity.publicKey.toString());
  if (umi.identity.publicKey.toString() !== TREASURY) {
    console.warn(
      '⚠ Signer is not TREASURY. Need update authority of the assets/collection (usually AdvMvv6…).',
    );
  }

  console.log('\nListing assets in collection…');
  const ids = await listCollectionAssets();
  console.log('Found', ids.length, 'asset(s)\n');

  const treasuryPk = publicKey(TREASURY);
  const results = [];

  for (const id of ids) {
    const asset = await das('getAsset', { id });
    const name = asset?.content?.metadata?.name || id.slice(0, 8);
    const bps = royaltyBpsFromAsset(asset);
    const hasPlugin = !!(asset?.plugins && asset.plugins.royalties);

    if (bps === TARGET_BPS && hasPlugin) {
      console.log(`✓ ${name}  already ${bps} bps with plugin — skip`);
      results.push({ id, name, status: 'ok', bps });
      continue;
    }

    console.log(
      `→ ${name}  assetBps=${bps === null ? 'none' : bps}  hasPlugin=${hasPlugin}  → set ${TARGET_BPS}`,
    );

    if (DRY) {
      results.push({ id, name, status: 'dry-run-would-fix', bps });
      continue;
    }

    try {
      const plugin = {
        type: 'Royalties',
        basisPoints: TARGET_BPS,
        creators: [{ address: treasuryPk, percentage: 100 }],
        ruleSet: ruleSet('None'),
      };

      let tx;
      if (hasPlugin) {
        tx = await updatePlugin(umi, {
          asset: publicKey(id),
          collection: publicKey(COLLECTION),
          plugin,
        }).sendAndConfirm(umi, { confirm: { commitment: 'confirmed' } });
      } else {
        tx = await addPlugin(umi, {
          asset: publicKey(id),
          collection: publicKey(COLLECTION),
          plugin,
        }).sendAndConfirm(umi, { confirm: { commitment: 'confirmed' } });
      }

      const sig =
        typeof tx.signature === 'string'
          ? tx.signature
          : bs58.encode(tx.signature);
      console.log(`  ✅ fixed  tx=${sig}`);
      results.push({ id, name, status: 'fixed', sig, bps: TARGET_BPS });
    } catch (e) {
      console.error(`  ❌ failed:`, e?.message || e);
      results.push({ id, name, status: 'error', error: String(e?.message || e) });
    }
  }

  const outPath = path.join(
    path.dirname(new URL(import.meta.url).pathname),
    'fix-royalties-result.json',
  );
  // Windows path fix for fileURL
  const outPath2 = path.join(
    process.cwd().includes('gift-locksmith')
      ? process.cwd()
      : path.join(process.cwd(), 'scripts/nft/gift-locksmith'),
    'fix-royalties-result.json',
  );
  const byClass = {};
  for (const r of results) {
    const c = classFromName(r.name);
    byClass[c] = byClass[c] || { ok: 0, need: 0, fixed: 0, error: 0 };
    if (r.status === 'ok') byClass[c].ok += 1;
    else if (r.status === 'dry-run-would-fix') byClass[c].need += 1;
    else if (r.status === 'fixed') byClass[c].fixed += 1;
    else if (r.status === 'error') byClass[c].error += 1;
  }
  console.log('\nBy class (Fate / Echo / Rush / Shadow / Locksmith / Star):');
  for (const [c, s] of Object.entries(byClass).sort()) {
    console.log(
      `  ${c}: already_ok=${s.ok} need_fix=${s.need} fixed=${s.fixed} error=${s.error}`,
    );
  }

  try {
    fs.writeFileSync(outPath2, JSON.stringify({ dry: DRY, results, byClass }, null, 2));
    console.log('\nSaved', outPath2);
  } catch {
    fs.writeFileSync(
      'fix-royalties-result.json',
      JSON.stringify({ dry: DRY, results, byClass }, null, 2),
    );
  }

  console.log('\nDone.');
  if (DRY) {
    console.log(`
To apply on mainnet (ALL classes in this collection):

  export CONFIRM_MAINNET=yes
  export KEYPAIR_PATH="$HOME/.config/solana/id.json"
  node fix-royalties.mjs
`);
  }

  console.log(`
New shop mints: sealed on activate (5% + creator on Solscan).
This script = one-time backfill for NFTs already minted before that.
`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

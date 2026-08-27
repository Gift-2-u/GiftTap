import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function env(k) {
  for (const f of ['.env', '.env.local']) {
    const p = path.join(root, f);
    if (!fs.existsSync(p)) continue;
    const m = fs.readFileSync(p, 'utf8').match(new RegExp(`^${k}=(.*)$`, 'm'));
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return process.env[k] || '';
}

const RPC = env('VITE_SOLANA_RPC_URL') || 'https://api.mainnet-beta.solana.com';
const WALLET = process.argv[2] || '3sD2pUovsCfmC1GNkP7E3LiDPunMUy8TELpg7RkMNkMM';
const ASSET = process.argv[3] || 'J5RsJKk5yC8hieBfqRcPDn37xPVL21jb2UbBPLHuAEqh';
const COLLECTION = 'FQPYWSohCPnS57W2AWAqwmQM21KRxGi4YXcCaiXUghPD';

async function rpc(method, params, id = '1') {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });
  const text = await res.text();
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    j = { error: { message: text.slice(0, 200) } };
  }
  return { http: res.status, j };
}

console.log('RPC:', RPC.replace(/api-key=[^&]+/i, 'api-key=***'));
console.log('WALLET', WALLET);
console.log('ASSET', ASSET);

const ga = await rpc('getAsset', { id: ASSET }, 'getAsset');
console.log('\n== getAsset ==');
console.log('http', ga.http, 'error', ga.j?.error || null);
const a = ga.j?.result;
if (a) {
  console.log('name', a?.content?.metadata?.name);
  console.log('owner', a?.ownership?.owner);
  console.log(
    'owner match wallet?',
    String(a?.ownership?.owner || '').toLowerCase() === WALLET.toLowerCase(),
  );
  console.log('grouping', JSON.stringify(a?.grouping || []));
  const attrs = a?.content?.metadata?.attributes || [];
  console.log('attrs', JSON.stringify(attrs).slice(0, 500));
  const inCol = (a?.grouping || []).some(
    (g) =>
      (g.group_key === 'collection' || g.groupKey === 'collection') &&
      (g.group_value === COLLECTION || g.groupValue === COLLECTION),
  );
  console.log('passes inElvesCollection?', inCol);
}

const sa = await rpc(
  'searchAssets',
  {
    ownerAddress: WALLET,
    grouping: ['collection', COLLECTION],
    page: 1,
    limit: 50,
    displayOptions: { showCollectionMetadata: true },
  },
  'search',
);
console.log('\n== searchAssets (collection) ==');
console.log('http', sa.http, 'error', sa.j?.error || null);
const items = sa.j?.result?.items || [];
console.log('count', items.length);
console.log(
  'names',
  items.map((x) => x?.content?.metadata?.name || x.id).slice(0, 20),
);
console.log('has asset?', items.some((x) => x.id === ASSET));

const ao = await rpc(
  'getAssetsByOwner',
  {
    ownerAddress: WALLET,
    page: 1,
    limit: 100,
    displayOptions: { showCollectionMetadata: true },
  },
  'owner',
);
console.log('\n== getAssetsByOwner ==');
console.log('http', ao.http, 'error', ao.j?.error || null);
const items2 = ao.j?.result?.items || [];
console.log('total assets', items2.length);
const elves = items2.filter((asset) => {
  const grouping = asset?.grouping || [];
  return grouping.some(
    (g) =>
      (g.group_key === 'collection' || g.groupKey === 'collection') &&
      (g.group_value === COLLECTION || g.groupValue === COLLECTION),
  );
});
console.log('elves-filtered count', elves.length);
console.log(
  'elves names/ids',
  elves.map((x) => `${x?.content?.metadata?.name}:${x.id}`),
);
console.log('has asset in owner list?', items2.some((x) => x.id === ASSET));
console.log('has asset in elves filter?', elves.some((x) => x.id === ASSET));

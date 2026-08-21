import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import {
  mplCandyMachine,
  fetchCandyGuard,
  findCandyGuardPda,
} from '@metaplex-foundation/mpl-core-candy-machine';
import { publicKey } from '@metaplex-foundation/umi';

const rpc =
  process.env.RPC_URL ||
  process.env.VITE_SOLANA_RPC_URL ||
  'https://api.mainnet-beta.solana.com';
const umi = createUmi(rpc).use(mplCandyMachine());
const guardPk = publicKey('CBK1Zwsnwwks3BLmhHASzD9Rsq8i2Xgs6RWMZGNSQRJ9');
const cm = publicKey('AQbpmorxtBaaipqm4WcmCyBzci8Qf8km9qF8kAidsMkC');
const pda = findCandyGuardPda(umi, { base: cm });
const pdaPk = Array.isArray(pda) ? pda[0] : pda;

function dump(label, g) {
  const pay = g?.guards?.solPayment;
  const lamports =
    pay?.__option === 'Some' ? pay.value.lamports.basisPoints.toString() : null;
  console.log(label, 'pubkey', g.publicKey?.toString?.() || '');
  console.log(
    label,
    'solPayment SOL',
    lamports ? Number(lamports) / 1e9 : null,
    'lamports',
    lamports,
  );
  console.log(label, 'groups', g?.groups?.length ?? 0);
  if (g?.groups?.length) {
    for (const gr of g.groups) {
      const p = gr.guards?.solPayment;
      const l =
        p?.__option === 'Some' ? p.value.lamports.basisPoints.toString() : null;
      console.log('  group', gr.label, 'SOL', l ? Number(l) / 1e9 : null);
    }
  }
}

console.log('RPC', rpc.slice(0, 48));
console.log('configured guard', guardPk.toString());
console.log('PDA from CM', pdaPk.toString());
dump('direct', await fetchCandyGuard(umi, guardPk));
dump('pda', await fetchCandyGuard(umi, pdaPk));

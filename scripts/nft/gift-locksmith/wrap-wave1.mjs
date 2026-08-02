import fs from 'fs';
import os from 'os';
import path from 'path';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import {
  mplCandyMachine,
  findCandyGuardPda,
  wrap,
} from '@metaplex-foundation/mpl-core-candy-machine';
import { keypairIdentity, publicKey } from '@metaplex-foundation/umi';
import bs58 from 'bs58';

const RPC =
  process.env.RPC_URL ||
  'https://mainnet.helius-rpc.com/?api-key=538f6c8f-c773-46a2-939c-6d48c75b2226';
const CM = process.env.CANDY_MACHINE || 'AQbpmorxtBaaipqm4WcmCyBzci8Qf8km9qF8kAidsMkC';

const secret = new Uint8Array(
  JSON.parse(
    fs.readFileSync(path.join(os.homedir(), '.config/solana/id.json'), 'utf8'),
  ),
);
const umi = createUmi(RPC).use(mplCandyMachine());
const kp = umi.eddsa.createKeypairFromSecretKey(secret);
umi.use(keypairIdentity(kp));

const cm = publicKey(CM);
const pda = findCandyGuardPda(umi, { base: cm });
const guardPk = publicKey(pda);
console.log('guard', guardPk.toString());
console.log('cm', cm.toString());
console.log('identity', umi.identity.publicKey.toString());

const tx = await wrap(umi, {
  candyGuard: guardPk,
  candyMachine: cm,
  authority: umi.identity,
  candyMachineAuthority: umi.identity,
}).sendAndConfirm(umi, { confirm: { commitment: 'confirmed' } });

const sig =
  typeof tx.signature === 'string' ? tx.signature : bs58.encode(tx.signature);
console.log('WRAP OK', sig);

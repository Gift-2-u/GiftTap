import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function load() {
  const out = {};
  for (const f of ['.env', '.env.local']) {
    const p = path.join(root, f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
      if (!m) continue;
      out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
  return out;
}

function roleOf(jwt, label) {
  if (!jwt) {
    console.log(label + ': MISSING');
    return null;
  }
  const parts = jwt.split('.');
  if (parts.length < 2) {
    console.log(label + ': not a JWT');
    return null;
  }
  const payload = JSON.parse(
    Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(
      'utf8',
    ),
  );
  console.log(label + ':');
  console.log('  length:', jwt.length);
  console.log('  starts:', jwt.slice(0, 18) + '…');
  console.log('  role:', payload.role || '(none)');
  return payload.role;
}

const e = load();
const anon = e.VITE_SUPABASE_ANON_KEY || e.SUPABASE_ANON_KEY || '';
const service =
  e.SUPABASE_SERVICE_ROLE_KEY || e.VITE_SUPABASE_SERVICE_ROLE_KEY || '';

const r1 = roleOf(anon, 'ANON (browser-safe)');
const r2 = roleOf(service, 'SERVICE_ROLE (server-only)');
console.log('');
if (!anon || !service) {
  console.log('Verdict: one or both keys missing in .env');
} else if (anon === service) {
  console.log('Verdict: SAME STRING — this is BAD. Rotate service_role immediately.');
} else if (r1 === 'anon' && r2 === 'service_role') {
  console.log('Verdict: OK — different keys, correct roles.');
} else {
  console.log(
    'Verdict: keys differ but roles look wrong:',
    JSON.stringify({ anon: r1, service: r2 }),
  );
}

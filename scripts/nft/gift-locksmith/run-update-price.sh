#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../../.."
# gift_memecoin root
if [ -f .env ]; then set -a; # shellcheck disable=SC1091
  . ./.env
  set +a
fi
export CONFIRM_MAINNET=yes
export CLUSTER=mainnet
cp scripts/nft/gift-locksmith/update-price-0.10.mjs /tmp/update-locksmith-price.mjs
# Point __dirname at gift-locksmith folder for result JSON writes
python3 - <<'PY'
from pathlib import Path
p = Path("/tmp/update-locksmith-price.mjs")
s = p.read_text()
old = "const __dirname = path.dirname(fileURLToPath(import.meta.url));"
new = 'const __dirname = "/home/tower/gift_memecoin/scripts/nft/gift-locksmith";'
if old not in s:
    raise SystemExit("anchor not found")
p.write_text(s.replace(old, new, 1))
PY
# Run with root node_modules (not nested broken uuid)
cd /home/tower/gift_memecoin
exec node /tmp/update-locksmith-price.mjs

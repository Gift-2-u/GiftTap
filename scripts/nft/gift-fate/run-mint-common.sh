#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

# Final Common metadata attributes
cat > metadata-common.json << 'JSON'
{
  "name": "Fate",
  "symbol": "Fate",
  "description": "Fate is the Luck elf of Gift2u Elves. Equip 1 Fate per wallet for a chance of a jackpot multiplier on tap G2Ushards payouts (server-side). Jackpot replaces Frenzy on that tap. Common rarity — thin silver border. Gen 1 · 17500 supply across 3 waves (0.05 / 0.10 / 0.15 SOL). Badge socket bottom-right (empty until equipped).",
  "seller_fee_basis_points": 500,
  "external_url": "https://gift2u.fun",
  "attributes": [
    { "trait_type": "Collection", "value": "Gift2u Elves" },
    { "trait_type": "Class", "value": "Fate" },
    { "trait_type": "Role", "value": "Luck" },
    { "trait_type": "Generation", "value": "Gen 1" },
    { "trait_type": "Rarity", "value": "Common" },
    { "trait_type": "Wave", "value": "OG / Test" },
    { "trait_type": "Type", "value": "Utility" },
    { "trait_type": "Utility", "value": "Tap jackpot (G2Ushards)" },
    { "trait_type": "Badge Slot", "value": "1" },
    { "trait_type": "Badge", "value": "none" },
    { "trait_type": "Badge Level", "value": "0" },
    { "trait_type": "Fate Level", "value": "1" },
    { "trait_type": "Max Supply", "value": "17500" },
    { "trait_type": "Edition", "value": "Final art v1" }
  ]
}
JSON

if [ ! -d node_modules ]; then
  if [ -d ../gift-locksmith/node_modules ]; then
    ln -sfn ../gift-locksmith/node_modules node_modules
  else
    npm install
  fi
fi

export CLUSTER=mainnet
export CONFIRM_MAINNET=yes
export RARITY=common
# RPC from project .env
if [ -f /home/tower/gift_memecoin/.env ]; then
  # shellcheck disable=SC1091
  set -a
  # extract only SOLANA rpc line safely
  RPC_LINE=$(grep -E '^VITE_SOLANA_RPC_URL=' /home/tower/gift_memecoin/.env | head -1 | cut -d= -f2-)
  export RPC_URL="${RPC_URL:-$RPC_LINE}"
  set +a
fi
export RPC_URL="${RPC_URL:-https://api.mainnet-beta.solana.com}"

echo "RPC: ${RPC_URL//api-key=*/api-key=***}"
echo "Minting Fate Common (final attributes)…"
node mint-core.mjs
echo "---- mint-result.json ----"
cat mint-result.json

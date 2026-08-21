# Star Badge — Candy Machine Wave 1

**Price:** 0.10 SOL · **Open mintable** (50,000 items) · same Gift2u Elves collection.

## Deploy (mainnet — costs SOL)

```bash
cd scripts/nft/gift-star
npm i
export CONFIRM_MAINNET=yes
export RPC_URL="https://mainnet.helius-rpc.com/?api-key=YOUR_KEY"
# optional: KEYPAIR_PATH=~/.config/solana/id.json
node setup-wave1.mjs
```

Writes `wave1-result.json` and `public/star-cm.json`.  
Shop → NFTs shows Star only when `candyMachine` + `candyGuard` are set in that JSON.

## Art

`StarBadge.jpg` (from `/shop/socket-star2.jpg`). Socket for elves is **UI outside art**, not on elf pixels.

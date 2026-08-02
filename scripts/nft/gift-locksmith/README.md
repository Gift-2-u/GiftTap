# GiftLocksmith — Metaplex Core

## Plan locked

| | |
|--|--|
| Standard | **Metaplex Core** |
| Test | Mint **1** now (`mint-core.mjs`) |
| Public | **3 waves**: 500 → 1500 → 3000 (max 5000) |
| Price | **Increases each wave** (see `WAVES.md`) |

## Mint the test piece (mainnet)

Wallet: `~/.config/solana/id.json` must have **mainnet** SOL (~0.02+ for upload + rent).

```bash
cd /home/tower/gift_memecoin/scripts/nft/gift-locksmith
npm install

# Use mainnet RPC (Helius from project .env is fine)
export RPC_URL="https://mainnet.helius-rpc.com/?api-key=YOUR_KEY"
export CONFIRM_MAINNET=yes
node mint-core.mjs
```

Result: `mint-result.json` (asset address + Solscan + Core explorer).

## Next after test mint

1. Core **Collection**  
2. Core Candy Machine wave 1 (500, lowest price)  
3. Waves 2–3 with higher prices when sold out  

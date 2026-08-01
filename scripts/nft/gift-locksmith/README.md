# GiftLocksmith mint

## Locked metadata

| Field | Value |
|--------|--------|
| Name | GiftLocksmith |
| Symbol | Locksmith |
| Royalties | 5% |
| Collection (trait) | Gift2u Elves |
| Generation | Gen 1 |
| Rarity | Rare |
| Max supply (trait / plan) | 5000 |

Description uses **GFTshard** (in-game name).

## This script vs 5000 supply

| Now | Later for 5000 players |
|-----|-------------------------|
| `node mint.mjs` = **1** NFT in your wallet | Collection NFT + Candy Machine (or similar) capped at 5000 |
| Same art / traits for every copy | Each mint is a separate token, same metadata template |

Trait `Max Supply: 5000` is **label only** — it does not enforce a cap on-chain. Cap is enforced by Candy Machine config.

## Mint one (mainnet)

```bash
cd /home/tower/gift_memecoin/scripts/nft/gift-locksmith
npm install

export KEYPAIR_PATH="$HOME/.config/solana/id.json"
export RPC_URL="https://mainnet.helius-rpc.com/?api-key=YOUR_KEY"
export CONFIRM_MAINNET=yes
node mint.mjs
```

Image: `GiftLocksmith.jpg` (from OneDrive Gift2u elves nft).

# Fate (Luck) — Metaplex Core mint package

Same pattern as **GiftLocksmith** (`../gift-locksmith/`):

| | |
|--|--|
| Standard | **Metaplex Core** |
| Public sale | **3 waves per rarity** (30% / 40% / 30%) |
| Price | **Increases each wave** — see `WAVES.md` |
| Legendary W1–W3 | **1.75 / 3.00 / 4.50 SOL** |
| Signer | Game wallet (in-app) pays `solPayment` to treasury |

## Files

| File | Purpose |
|------|---------|
| `Fate.jpg` | Master art (all rarities) |
| `fate-rarity-full-thin.jpg` | Border board Common→Legendary |
| `WAVES.md` | Supply, prices, CM plan |
| `demo.html` | Visual demo board (open in browser) |
| `metadata-*.json` | Per-rarity metadata templates |
| `mint-core.mjs` | Test mint **1** Core asset |
| `setup-wave.mjs` | Create Core CM + Guard for one rarity × wave |

## Test mint (mainnet)

```bash
cd /home/tower/gift_memecoin/scripts/nft/gift-fate
npm install
export RPC_URL="https://mainnet.helius-rpc.com/?api-key=YOUR_KEY"
export CONFIRM_MAINNET=yes
# optional: RARITY=legendary
node mint-core.mjs
```

Needs `~/.config/solana/id.json` with mainnet SOL.

## Wave 1 candy machine (example: Legendary)

```bash
export CONFIRM_MAINNET=yes
export RPC_URL="..."
node setup-wave.mjs legendary 1
# → writes wave1-legendary-result.json (CM + guard addresses)
```

Guards mirror Locksmith: `solPayment` + `mintLimit` (id = wave) + small `botTax`.

## Demo

Open `demo.html` in a browser (or hard-refresh after copy to public).  
Shows rarity cards, W1–W3 prices, supply, level-up, jackpot note.

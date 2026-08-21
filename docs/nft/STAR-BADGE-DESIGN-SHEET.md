# Star Badge — design sheet (v1)

## What it is

On-chain **Star Badge** NFT that sockets into **Fate · Echo · Rush · Shadow** (not Locksmith).  
Removable — not baked into elf metadata or pixels.

STEPN gems are **NFTs** traded on their Marketplace; sockets sit **outside** the sneaker art. Gift2u follows that pattern.

## Backpack → NFT (gameplay)

**Show:** level · rarity · Star equipped/empty · level-up · equip/unequip  
**Hide:** mint address · long description · attribute essay (those live in Shop + Wallet)

**Socket:** **1** Star socket **under / beside** the NFT image (UI chrome). Image stays clean — no hole on the art.

## Mint

| | |
|--|--|
| Price | **0.10 SOL** |
| Supply | **Open / keep mintable** (no hard 10k close) |
| Levels | L1–L5 (SOL ladder) |

### Star level-up SOL

One Star works on every rarity, so leveling costs more than a Common elf.

| L1→2 | L2→3 | L3→4 | L4→5 | Total |
|-----:|-----:|-----:|-----:|------:|
| 0.10 | 0.15 | 0.25 | 0.40 | **0.90** |

## Perks (by elf class socketed into)

| Elf | Effect |
|-----|--------|
| **Echo** | +% taps: L1 **10%** → 15 → 20 → 25 → L5 **30%** |
| **Fate** | Better **Mystery Gift** odds only (not Fate jackpot table) |
| **Rush** | Raise **energy battery 500** cap (+10%…+30%), not max daily taps |
| **Shadow** | +% on daily Shadow claim (10%→30%) |

## Equip rules

- 1 Star per elf asset  
- Unequip free (v1) before selling elf  
- Inventory link: `fate_equip[elfAssetId] → star_asset_id` (legacy `shard_badge` count until CM live)

## Legacy

Off-chain `shard_badge` inventory + Badge market remain until Star CM ships; UI already says **Star Badge**.

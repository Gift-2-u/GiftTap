# Gift2u Elves — Fate (Luck) Design Sheet v1

**Status:** LOCKED  
**Last updated:** 2026-08-17  
**Class:** Fate · Luck elf  
**Art:** `Fate.jpg` (same image all rarities)  
**Demo:** `fate-nft-final-demo.jpg`

---

## Identity

- **Fate** = Luck elf.
- **Utility:** On each tap, a chance to hit a **jackpot** that multiplies that tap’s **G2Ushards** payout.
- **Equip:** **1 Fate per wallet** (only one active).
- **Rolls:** **1 jackpot max per tap** (highest unlocked multi first).
- **Frenzy:** On a jackpot hit, Fate multi **replaces** Frenzy for that tap (no double multi).

---

## Look

| Spec | Choice |
|------|--------|
| Art | Full image, **no crop** (GIFT TAP neon visible) |
| Border | **Single** thin border (~12px), slightly thicker than hairline |
| Rarity colors | Common **silver/grey** · Rare **blue** · Epic **purple** · Legendary **gold** (rich gold, not yellow) |
| On-card rarity text | **None** — rarity in metadata / description only |
| Legendary | Soft gold outer glow only (not a second hard border) |
| Badge socket | **Bottom-right** on art, **empty ring** until a badge is equipped |
| Socket rule | **Same position for every elf** · **1 badge max** per NFT |

---

## Rarity ladders (jackpot odds)

Level **N** unlocks rungs **1…N** of **that rarity only**.  
At most one jackpot per tap.

### Common
| Unlock | Chance | Multi |
|--------|--------|------:|
| L1 | 2% | 4× |
| L2 | 2% | 6× |
| L3 | 2% | 8× |
| L4 | 1.5% | 12× |
| L5 | 1.5% | 15× |

### Rare
| Unlock | Chance | Multi |
|--------|--------|------:|
| L1 | 2% | 8× |
| L2 | 2% | 12× |
| L3 | 2% | 16× |
| L4 | 1.5% | 22× |
| L5 | 1.5% | 30× |

### Epic
| Unlock | Chance | Multi |
|--------|--------|------:|
| L1 | 2.5% | 12× |
| L2 | 2% | 18× |
| L3 | 2% | 25× |
| L4 | 1.5% | 35× |
| L5 | 0.3% | 60× |

### Legendary
| Unlock | Chance | Multi |
|--------|--------|------:|
| L1 | 3% | 15× |
| L2 | 2.5% | 25× |
| L3 | 2% | 35× |
| L4 | 0.5% | 60× |
| L5 | 0.15% | 100× |

---

## Mint supply & wave prices (SOL)

Waves = **30% / 40% / 30%** of each rarity’s supply.  
**Wave 1 opens all rarities.**

| Rarity | Total supply | W1 (30%) price | W2 (40%) price | W3 (30%) price |
|--------|-------------:|---------------:|---------------:|---------------:|
| Common | 17,500 | **0.05 SOL** | **0.10 SOL** | **0.15 SOL** |
| Rare | 5,250 | **0.30 SOL** | **0.53 SOL** | **0.75 SOL** |
| Epic | 1,750 | **1.00 SOL** | **1.55 SOL** | **2.20 SOL** |
| Legendary | 500 | **2.50 SOL** | **4.00 SOL** | **6.00 SOL** |
| **Total Fate** | **25,000** | | | |

---

## Level-up costs (SOL now · G2U when live)

**G2U conversion rate: later.**

| Rarity | L1→2 | L2→3 | L3→4 | L4→5 | **Total L1→5** |
|--------|-----:|-----:|-----:|-----:|---------------:|
| Common | 0.02 | 0.04 | 0.06 | 0.08 | **0.20 SOL** |
| Rare | 0.05 | 0.10 | 0.20 | 0.25 | **0.60 SOL** |
| Epic | 0.15 | 0.25 | 0.35 | 0.50 | **1.25 SOL** |
| Legendary | 0.50 | 0.80 | 1.20 | 2.00 | **4.50 SOL** |

**Incentive rule:** mint + L1→5 of a rarity stays under the next rarity’s W1 mint
(Common full **0.25** < Rare W1 **0.30** · Rare full **0.90** < Epic W1 **1.00** ·
Epic full **2.25** < Legendary W1 **2.50**). Higher rarity = higher ceiling, not a
cheaper skip of leveling.

---

## Metadata attributes (draft)

| trait_type | value |
|------------|--------|
| Collection | Gift2u Elves |
| Class | Fate |
| Role | Luck |
| Generation | Gen 1 |
| Rarity | Common / Rare / Epic / Legendary |
| Type | Utility |
| Utility | Tap jackpot (G2Ushards) |
| Badge Slot | 1 |
| Badge | none (until equipped) |
| Badge Level | 0 (when empty) |

**Fate Level (1–5)** = live game state (authoritative server), shown in UI; optional metadata refresh later.

---

## Security / implementation notes (for later build)

- Jackpot roll **server-side only** (e.g. commit-taps).
- Active Fate = NFT owned by game wallet + equipped slot (1).
- Badge: 1 per NFT; socket BR for all elves.

---

## Open for later (not Fate-blocking)

- Exact G2U rate for level-up
- Final shard-badge item design (see discussion: shard image vs alternatives)
- Rush / Echo / Shadow sheets
- Candy Machine / mint UI

---

## Related files

- Art: `Fate.jpg`
- Border demo: `fate-rarity-full-thin.jpg`
- Final sheet visual: `fate-nft-final-demo.jpg`

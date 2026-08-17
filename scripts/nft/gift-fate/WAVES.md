# Fate (Luck) — Metaplex Core + 3 waves per rarity

**Standard:** Metaplex **Core** (same stack as GiftLocksmith)  
**Collection:** Gift2u Elves · Fate · Gen 1  
**Class:** Fate · Luck  
**Art:** same image all rarities (`Fate.jpg`) — rarity = border color only  
**Total supply:** **25,000**

Same mint path as GiftLocksmith:
- Core Collection
- Core Candy Machine + Candy Guard per **rarity × wave**
- Guards: `solPayment` + `mintLimit` (wave id) + `botTax`
- 5% royalties → treasury
- Hidden settings = same art/metadata for all mints of that rarity

---

## Wave split (every rarity)

| Wave | Share of rarity supply |
|------|------------------------:|
| **1** | **30%** |
| **2** | **40%** |
| **3** | **30%** |

Open wave N+1 only after wave N sells through (or you force-open).

---

## Supply per wave

| Rarity | Total | W1 (30%) | W2 (40%) | W3 (30%) |
|--------|------:|---------:|---------:|---------:|
| Common | 17,500 | 5,250 | 7,000 | 5,250 |
| Rare | 5,250 | 1,575 | 2,100 | 1,575 |
| Epic | 1,750 | 525 | 700 | 525 |
| Legendary | 500 | 150 | 200 | 150 |
| **All Fate** | **25,000** | **7,500** | **10,000** | **7,500** |

---

## Locked mint prices (SOL)

| Rarity | **W1** | **W2** | **W3** |
|--------|-------:|-------:|-------:|
| Common | **0.05** | **0.10** | **0.15** |
| Rare | **0.20** | **0.35** | **0.50** |
| Epic | **0.80** | **1.25** | **1.75** |
| Legendary | **1.75** | **3.00** | **4.50** |

Legendary updated 2026-08-17: **1.75 / 3 / 4.5** (was 2.50 / 4 / 6).

### Gross if fully sold (treasury)

| Rarity | Gross SOL |
|--------|----------:|
| Common | 5,250×0.05 + 7,000×0.10 + 5,250×0.15 = **2,100** |
| Rare | 1,575×0.20 + 2,100×0.35 + 1,575×0.50 = **1,890** |
| Epic | 525×0.80 + 700×1.25 + 525×1.75 = **2,153.75** |
| Legendary | 150×1.75 + 200×3.00 + 150×4.50 = **1,537.50** |
| **Total** | **~7,681 SOL** |

---

## Candy machines (plan)

One **Core CM + Guard** per rarity per wave (12 total when fully deployed).

| ID | Rarity | Wave | Items | Price | Status |
|----|--------|-----:|------:|------:|--------|
| — | Common | 1 | 5,250 | 0.05 | planned |
| — | Rare | 1 | 1,575 | 0.20 | planned |
| — | Epic | 1 | 525 | 0.80 | planned |
| — | Legendary | 1 | 150 | 1.75 | planned |
| — | … | 2–3 | … | … | after W1 |

Script: `node setup-wave.mjs <common|rare|epic|legendary> <1|2|3>`

---

## Level-up costs (SOL · G2U later)

| Rarity | L1→2 | L2→3 | L3→4 | L4→5 | **L1→5** |
|--------|-----:|-----:|-----:|-----:|---------:|
| Common | 0.03 | 0.05 | 0.08 | 0.12 | **0.28** |
| Rare | 0.10 | 0.15 | 0.25 | 0.40 | **0.90** |
| Epic | 0.25 | 0.40 | 0.65 | 1.00 | **2.30** |
| Legendary | 0.60 | 0.80 | 1.30 | 2.00 | **4.70** |

---

## Utility (all waves / all rarities class)

- Tap **jackpot** multi on **G2Ushards** (server-side roll)
- **1 Fate per wallet** equipped
- **1 jackpot max per tap**; replaces Frenzy on hit
- Odds/multi ladders scale by **rarity + Fate level** (see design sheet)
- Badge socket bottom-right (empty until badge equipped)

---

## Order of work (same as Locksmith)

1. [x] Design sheet locked  
2. [x] Art + rarity border board  
3. [x] Wave prices locked (Legendary **1.75 / 3 / 4.5**)  
4. [ ] Test mint 1 Core asset (`mint-core.mjs`)  
5. [ ] Core Collection (or add Fate to Gift2u Elves collection policy)  
6. [ ] CM Wave 1 per rarity (start Legendary or Common)  
7. [ ] App mint UI (game wallet, SOL gate like Locksmith)  
8. [ ] Jackpot in commit-taps  
9. [ ] Wave 2–3 after sellout  

---

## Related

- Spec: `OneDrive/Gift2u elves nft/FATE-DESIGN-SHEET.md`  
- Demo: `demo.html` / `fate-nft-final-demo-v2.jpg`  
- Locksmith reference: `../gift-locksmith/`  

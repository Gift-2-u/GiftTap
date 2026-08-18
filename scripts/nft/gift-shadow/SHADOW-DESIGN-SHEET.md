# Gift2u Elves — Shadow (Night) Design Sheet v1

**Status:** LOCKED  
**Last updated:** 2026-08-18  
**Class:** Shadow · Night elf  
**Art:** `Shadow.jpg` (same image all rarities)  
**Collection:** Gift2u Elves

---

## Identity

- **Shadow** = Night elf.
- **Utility:** Once per **UTC day**, while equipped, Shadow grants shards without tapping equal to a share of your **base** max daily taps:
  - `yield = floor((hours / 24) × baseDailyCap)`
  - **24 hours = 100%** of base daily cap
- **baseDailyCap** = Rush active cap if Rush equipped, else **1,000**.  
- Yield also counts toward **daily taps / weekly score** (same units as tap scoreCredit at 1×).
- **Equip:** **1 Shadow per wallet**.

### Hours ladder (LOCKED)

| Level | Common | Rare | Epic | Legendary |
|------:|-------:|-----:|-----:|----------:|
| 1 | 2h | 8h | 14h | 20h |
| 2 | 3h | 9h | 15h | 21h |
| 3 | 4h | 10h | 16h | 22h |
| 4 | 5h | 11h | 17h | 23h |
| 5 | 6h | 12h | 18h | **24h** |

Examples (no Rush): Common L1 → 2/24 × 1000 ≈ **83** shards/day. Legendary L5 → **1000**/day.  
With Rush Rare L1 (cap 1600): Legendary L5 Shadow → **1600**/day (still no battery add).

---

## Description

> Shadow is the Night elf of the Gift2u Elves. Equip one Shadow per wallet. Once per UTC day, Shadow grants shards without tapping equal to a share of your base max daily taps. Up to 24h = full base daily on Legendary L5.

---

## Mint (Fate/Echo/Rush parity)

4 rarities · 3 waves · W1: 0.05 / 0.20 / 0.80 / 1.75 SOL · locked socket · 5% royalties

---

## Implementation

- `shadow-activate` → `inventory.shadow_active`
- `shadow-claim` → once/UTC day; credits shards + daily/weekly; ledger `shadow_claim:{weekDay}`
- Stacking: Fate/Echo still apply to **taps**; Shadow claim is flat daily-claim shards (no Fate jackpot on claim)

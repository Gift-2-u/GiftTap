# Gift2u Elves — Rush (Energy) Design Sheet v1

**Status:** LOCKED  
**Last updated:** 2026-08-18  
**Class:** Rush · Energy elf  
**Art:** `Rush.jpg` (same image all rarities)  
**Collection:** Gift2u Elves (shared with Locksmith + Fate + Echo)

---

## Identity

- **Rush** = Energy elf (raises **max daily taps**).
- **Utility:** While equipped, player **max daily limit** becomes the Rush table value (base game limit is **1,000** without Rush).
- **Equip:** **1 Rush per wallet** (only one active).
- **Stacking (LOCKED):**
  - Rush **replaces the base 1,000** with its rarity × level cap.
  - **Expanded Battery**, **`limit_boost`**, and **task daily-limit boosts add on top** of Rush’s cap.
- **Badge socket:** locked `socket-geometry.mjs` (same as Fate / Echo).

---

## Max daily limit ladder (LOCKED from design)

Numbers = **max daily taps**. (+N) = bonus vs base **1,000**.

| Level | Common | Rare | Epic | Legendary |
|------:|-------:|-----:|-----:|----------:|
| 1 | **1,100** (+100) | **1,600** (+600) | **2,100** (+1,100) | **2,600** (+1,600) |
| 2 | **1,200** (+200) | **1,700** (+700) | **2,200** (+1,200) | **2,700** (+1,700) |
| 3 | **1,300** (+300) | **1,800** (+800) | **2,300** (+1,300) | **2,800** (+1,800) |
| 4 | **1,400** (+400) | **1,900** (+900) | **2,400** (+1,400) | **2,900** (+1,900) |
| 5 | **1,500** (+500) | **2,000** (+1,000) | **2,500** (+1,500) | **3,000** (+2,000) |

---

## Look

| Spec | Choice |
|------|--------|
| Art | Full image, **no crop** |
| Border | Single thin (~12px) |
| Rarity colors | Common silver · Rare blue · Epic purple · Legendary gold |
| On-card rarity text | None |
| Badge socket | Bottom-right opaque well (locked geometry) |

---

## Description (shop / metadata)

> Rush is the Energy elf of the Gift2u Elves. Equip one Rush per wallet. Rush raises your max daily taps by rarity and level (up to 3,000 on Legendary L5).

---

## Mint supply & wave prices (SOL) — draft = Fate/Echo parity

| Rarity | Total | W1 price | W2 | W3 |
|--------|------:|---------:|---:|---:|
| Common | 17,500 | **0.05** | 0.10 | 0.15 |
| Rare | 5,250 | **0.20** | 0.35 | 0.50 |
| Epic | 1,750 | **0.80** | 1.25 | 1.75 |
| Legendary | 500 | **1.75** | 3.00 | 4.50 |
| **Total** | **25,000** | | | |

Level-up costs: same draft as Fate/Echo.

---

## Metadata attributes (draft)

| trait_type | value |
|------------|--------|
| Collection | Gift2u Elves |
| Class | Rush |
| Role | Energy |
| Generation | Gen 1 |
| Rarity | Common / Rare / Epic / Legendary |
| Type | Utility |
| Utility | Max daily energy / taps |
| Badge Slot | 1 |

---

## Implementation notes (after approve)

- `rush-activate` → `inventory.rush_active` `{ rarity, level, asset_id }`
- `commit-taps` / client daily max: `base = rushDailyLimit(rarity, level) || 1000`, then + battery / limit_boost / task boosts
- Auto-activate on mint + Equip Rush in Pack → NFT

---

## Approve checklist

- [ ] Description
- [ ] Daily limit ladder
- [x] Stacking: Rush base cap + Expanded Battery / task boosts on top
- [ ] Wave 1 prices
- [ ] Bordered art + socket

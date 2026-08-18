# Gift2u Elves — Echo (Power) Design Sheet v1

**Status:** LOCKED  
**Last updated:** 2026-08-18  
**Class:** Echo · Power elf  
**Art:** `Echo.jpg` (same image all rarities)  
**Collection:** Gift2u Elves (shared with Locksmith + Fate)

---

## Identity

- **Echo** = Power elf (always-on tap multiplier).
- **Utility:** While equipped, every tap’s is multiplied by Echo’s **rarity × level** multi.
- **Equip:** **1 Echo per wallet** (only one active).
- **Stacking (draft):**
  - Echo multi applies to **every** tap.
  - **Frenzy** stacks **on top** of Echo (multiplicative).
  - **Fate jackpot** replaces Frenzy for that tap; **Echo still applies** to the jackpot payout.
- **Badge socket:** same locked geometry as Fate (`socket-geometry.mjs`).

---

## Look

| Spec | Choice |
|------|--------|
| Art | Full image, **no crop** |
| Border | **Single** thin border (~12px) |
| Rarity colors | Common **silver/grey** · Rare **blue** · Epic **purple** · Legendary **gold** |
| On-card rarity text | **None** |
| Legendary | Soft gold outer glow only |
| Badge socket | Bottom-right, **opaque** well (locked socket-geometry) |
| Socket rule | Same position for every elf · 1 badge max |

---

## Tap multiplier ladder (LOCKED from design)

Level **N** = Echo level 1–5. Multi is **always on** while Echo is equipped (not a chance roll).

| Level | Common | Rare | Epic | Legendary |
|------:|-------:|-----:|-----:|----------:|
| 1 | 1.10× | 1.60× | 2.10× | 2.60× |
| 2 | 1.20× | 1.70× | 2.20× | 2.70× |
| 3 | 1.30× | 1.80× | 2.30× | 2.80× |
| 4 | 1.40× | 1.90× | 2.40× | 2.90× |
| 5 (MAX) | 1.50× | 2.00× | 2.50× | 3.00× |

---

## Mint supply & wave prices (SOL) — draft = Fate parity

Waves = **30% / 40% / 30%** of each rarity’s supply.  
**Wave 1 opens all rarities.**

| Rarity | Total supply | W1 (30%) price | W2 (40%) price | W3 (30%) price |
|--------|-------------:|---------------:|---------------:|---------------:|
| Common | 17,500 | **0.05 SOL** | **0.10 SOL** | **0.15 SOL** |
| Rare | 5,250 | **0.20 SOL** | **0.35 SOL** | **0.50 SOL** |
| Epic | 1,750 | **0.80 SOL** | **1.25 SOL** | **1.75 SOL** |
| Legendary | 500 | **1.75 SOL** | **3.00 SOL** | **4.50 SOL** |
| **Total Echo** | **25,000** | | | |

---

## Level-up costs (SOL now · G2U when live) — draft = Fate parity

| Rarity | L1→2 | L2→3 | L3→4 | L4→5 | **Total L1→5** |
|--------|-----:|-----:|-----:|-----:|---------------:|
| Common | 0.03 | 0.05 | 0.08 | 0.12 | **0.28 SOL** |
| Rare | 0.10 | 0.15 | 0.25 | 0.40 | **0.90 SOL** |
| Epic | 0.25 | 0.40 | 0.65 | 1.00 | **2.30 SOL** |
| Legendary | 0.60 | 0.80 | 1.30 | 2.00 | **4.70 SOL** |

---

## Description (shop / metadata)

> Echo is the Power elf of the Gift2u Elves. Equip one Echo per wallet. Echo multiplies every tap’s by its rarity and level (up to 3.00× on Legendary L5).

---

## Metadata attributes (draft)

| trait_type | value |
|------------|--------|
| Collection | Gift2u Elves |
| Class | Echo |
| Role | Power |
| Generation | Gen 1 |
| Rarity | Common / Rare / Epic / Legendary |
| Type | Utility |
| Utility | Tap multiplier |
| Badge Slot | 1 |
| Wave | 1 of 3 |

**Echo Level (1–5)** = live game state (server), shown in UI.

---

## Mint stack

- Metaplex **Core** + Core Candy Machine + Guard (solPayment + mintLimit + botTax)
- Shared collection: `FQPYWSohCPnS57W2AWAqwmQM21KRxGi4YXcCaiXUghPD`
- Scripts: `scripts/nft/gift-echo/`
- Socket: import from `socket-geometry.mjs` (same as Fate)

---

## Implementation notes (later)

- Echo multi applied in **commit-taps** (server) when equipped Echo is detected / inventory focus set.
- Daily/weekly scoreCredit already uses payoutMultiplier — Echo should feed into that payout path.
- 1 Echo equipped per wallet (mirror Fate active slot).

---

## Approve checklist

- [ ] Description text
- [ ] Multi ladder
- [ ] Stacking vs Frenzy / Fate
- [ ] Supply & Wave 1 prices
- [ ] Bordered art + socket look

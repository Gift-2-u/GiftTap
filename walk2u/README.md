# Walk2u v1 — frozen spec

Same repo as Gift Tap. Shared login, wallet, Locksmith shoes, $G2U claim path later.

## Locked rules

| Rule | Decision |
|------|----------|
| **Walk2u points** | **1 Walk2u per 1,000 steps** (server-validated) |
| **$G2U milestones** | Like Gift Tap milestones, driven by **km walked** |
| **No shoe** | **Blocked** — cannot start without a shoe |
| **Rent shoe** | Later (maybe) |
| **Energy** | **1 energy block = 5 minutes** of rewarded walk |
| **Rarer shoes** | More energy capacity (later); Common first |
| **Buy energy** | Yes — blocks can be bought |
| **Durability** | Drains by **km** |

## Loop

Equip shoe → energy blocks limit rewarded time → walk (GPS/steps on phone) → End walk → Edge validates → grant Walk2u + km milestone progress → drain durability by km.

## Supabase calm

- No GPS tick writes. One session summary on finish.
- No idle polls.
- Don’t ship Edge writes until Disk IO is stable.

## Status

- Spec frozen.
- **Full-screen Gift2U app** at `/walk2u` (outdoors green UI — not Gift Tap chrome).
- Local GPS demo + Home / Walk / Bag tabs. Nothing saved to DB.
- Shared Gift2U login/$G2U later; not linked as a Gift Tap mode.
- Edge / real inventory / pedometer — next.

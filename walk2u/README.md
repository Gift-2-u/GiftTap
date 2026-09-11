# Walk2u (stub)

Same repo as Gift Tap (`gift_memecoin`) so we can share login, wallet, Locksmith shoes, and $G2U later.

## Rules (keep Supabase calm)

- **No GPS / step spam to the DB.** Phone tracks locally; server gets a **session summary** only (end of walk or rare checkpoint).
- **Edge validates** distance / speed / time — DevTools cannot invent stats.
- **No idle polls** (no 2‑minute refresh loops).
- Reuse Gift Tap session JWT + inventory when we wire it. No second Supabase project unless we outgrow this one.

## Status

Stub only. No routes, no Edge, no tables yet — add those when Disk IO is healthy and we start the real Walk2u build.

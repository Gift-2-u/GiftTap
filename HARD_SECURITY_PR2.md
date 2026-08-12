# Hard security — PR2 spend path (done)

## Deployed Edge Functions (JWT required)

| Function | Purpose |
|----------|---------|
| `shop-buy` | Shard shop: frenzy/battery/heavy/refill |
| `mystery-open` | Burn badges, server roll, grant rewards |
| `badge-claim-weekly` | Grant top-10 badge only from snapshots |

## Client behavior

- If `gift2u_session_token` exists (after login): uses secure Edge APIs
- If no JWT: **legacy client write** still works (no cutover yet)

## How to test

1. Deploy frontend
2. Log out → log in (must get session token)
3. Shop → buy Instant Refill → should work via `shop-buy`
4. Pack → Badges → Mystery → should hit `mystery-open`
5. Network tab: requests to `/functions/v1/shop-buy` etc. with Bearer JWT

## Still open (intentional)

- Direct `players.update` still allowed by RLS
- SOL premium buys + Locksmith mint still client/on-chain
- Taps still client save
- `secure_economy` = false

## Next

- PR5: `commit-taps`
- PR6: wrap remaining claims
- PR7: RLS kill-switch + secure_economy true

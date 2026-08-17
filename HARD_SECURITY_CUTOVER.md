# Hard security — truth vs gaps (post-hack)

## What failed before (recon dump proof)

Old "protect" **allowed client to RAISE** shards/taps by +500/+2000 per UPDATE.
Spam updates → 149k shards. Inventory / premium / boosts / walls were free.
`encrypted_vault: "probe"` = client write. That was **not** hard security.

## What TOTAL FREEZE does NOW

Run: **`20260817e_TOTAL_FREEZE.sql`** (supersedes 17d for economy)

| Layer | Effect |
|-------|--------|
| `protect_player_economy` | Client **cannot change** shards, taps, energy, inventory, boosts, premium, walls, sol/usdc, flags |
| `protect_player_identity` | Wallet/vault/password/username set-once |
| `protect_player_insert` | New client rows cannot start rich |
| Edge `create-user-wallet` | JWT + set-once (deployed) |
| Edge `claim-weekly-quest` | Server reward table only (deployed) |
| Client save | Under secure mode only writes `last_updated` — no dual-write money |

Mining credits only via **commit-taps**. Shop/claims/walls only via Edge.

## YOU MUST DO (live project)

### A. Run SQL (Supabase → SQL Editor) — both files

1. `gift_secure/20260817e_TOTAL_FREEZE.sql` — freeze money/inventory/identity + ban recon  
2. `gift_secure/20260817f_SECRETS_UNREADABLE.sql` — **anon cannot SELECT `encrypted_vault` / `password_hash`**

Owner reads vault only via Edge `wallet-vault` + game JWT (deployed).  
You (SQL editor / service_role) still see secrets. Other players never do.

### B. Deploy Edge function

```bash
cd /home/tower/gift_memecoin
supabase functions deploy create-user-wallet --no-verify-jwt
```

(JWT for the **game** session is checked inside the function; Supabase gateway still uses anon key.)

### C. Deploy frontend (GiftTap + secureApi)

After deploy: players should **log out → log in** once so session JWT is fresh.

### D. If YOUR wallet was swapped in DB

1. Find the real Solana address that still holds your NFT (explorer).  
2. As admin in SQL:

```sql
BEGIN;
SET LOCAL gift.admin_wallet_override = 'on';
SET LOCAL gift.admin_vault_override = 'on';
UPDATE public.players
SET wallet_address = 'YOUR_REAL_ADDRESS',
    encrypted_vault = NULL
WHERE telegram_id = 'YOUR_PLAYER_ID';
COMMIT;
```

3. Log in, restore with your **12-word phrase** (if you still have it) so vault is set once again.  
4. If the seed was stolen, **move NFT + any remaining SOL to a new wallet you control** and rebind with admin override. Compromised seeds are never safe again.

## Remaining risk (honest)

Vault encryption still uses a **deterministic public salt** (`vaultSaltFor`).  
As long as `encrypted_vault` is readable via the anon client, a sophisticated attacker who can SELECT rows could still try to decrypt seeds.

**Next hardening (not done in this pass):**

- Serve vault only via Edge after password/JWT check  
- Re-encrypt vault with key derived from account password  
- Strip `encrypted_vault` from broad `select('*')` on players

Economy + identity freeze + set-once wallet is the emergency fix that stops **overwrite** attacks and blocks casual client cheats.

## Test checklist

1. Run identity SQL  
2. Deploy `create-user-wallet` + frontend  
3. Log out → log in  
4. DevTools:  
   `supabase.from('players').update({ wallet_address: 'Hacked' }).eq('telegram_id', YOUR_ID)`  
   → must error or leave wallet unchanged after reload  
5. Call create-user-wallet without `x-gift-session` → 401  
6. Call with JWT when wallet already set → `already_bound: true`, `mnemonic: null`

## Emergency economy rollback only

```sql
UPDATE public.game_settings SET secure_economy = false WHERE id = 1;
```

Do **not** drop `trg_protect_player_identity` unless you accept wallet theft risk again.

# Hard security — truth vs gaps (post-hack)

## What you thought we locked last week

**Economy only** when `game_settings.secure_economy = true`:

- shard_balance, lifetime_taps, season/weekly shards  
- daily taps, energy, streak  
- sol_balance / usdc_balance **columns in DB** (in-game balances)

Edge + JWT for shop, taps, badges, etc.

## What was NOT locked (why SOL could be stolen)

| Hole | Effect |
|------|--------|
| `wallet_address` client-writable | Attacker could rebind your in-game wallet |
| `create-user-wallet` no JWT + always UPDATE | Anyone with anon key could pass your player id and **overwrite** wallet with a new key |
| `encrypted_vault` client-writable + readable | Seed ciphertext in DB |
| Vault AES password = `playerId + public salt` | If vault is readable, seed can be decrypted **without your login password** → drain SOL on-chain |

NFT can stay on the same address if they only transferred SOL.

## What this lockdown does NOW

1. **SQL** `20260817d_HARD_IDENTITY_NOW.sql`  
   - Trigger `protect_player_identity` — client cannot change wallet/vault/password/username/referrer once set  
   - Even `service_role` cannot **replace** a bound wallet/vault unless you set  
     `gift.admin_wallet_override` / `gift.admin_vault_override` (recovery only)

2. **Edge** `create-user-wallet`  
   - Requires `x-gift-session` (your game JWT)  
   - Only binds **your** player id  
   - **Set-once** — if wallet exists, returns it and **no new mnemonic**

3. **Client** GiftTap  
   - Never overwrites `wallet_address` / `encrypted_vault` when already set  
   - Wallet create only via `secureCreateUserWallet()`  
   - Mnemonic restore does not replace an existing vault

## YOU MUST DO (live project)

### A. Run SQL (Supabase → SQL Editor) — paste entire file

`gift_secure/20260817d_HARD_IDENTITY_NOW.sql`

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

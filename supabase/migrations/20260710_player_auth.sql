-- ============================================================
-- Gift Tap: unique usernames + password login support
-- Run this ONCE in Supabase → SQL Editor → New query → Run
-- ============================================================

-- 1) Column for password login (safe if it already exists)
-- REQUIRED for Sign up / Log in — if missing, signup fails
alter table public.players
  add column if not exists password_hash text;

-- 2) Fix existing duplicate names BEFORE unique index
--    Many old rows are all named "Player" → make each one unique
update public.players p
set username = 'Player_' || left(replace(p.telegram_id::text, '-', ''), 8)
where p.username is null
   or trim(p.username) = ''
   or lower(trim(p.username)) = 'player';

-- 3) If any other duplicates remain (same name, different rows), suffix them
with dups as (
  select
    ctid,
    username,
    row_number() over (partition by lower(username) order by ctid) as rn
  from public.players
  where username is not null and trim(username) <> ''
)
update public.players p
set username = p.username || '_' || substr(md5(p.ctid::text), 1, 6)
from dups d
where p.ctid = d.ctid
  and d.rn > 1;

-- 4) Now unique index can succeed
drop index if exists players_username_lower_uidx;

create unique index players_username_lower_uidx
  on public.players (lower(username))
  where username is not null and username <> '';

comment on column public.players.password_hash is
  'PBKDF2 hash for web login (username + password). Not the wallet seed.';

-- Referral milestones: pay referrer at invitee L1 and wall 4→5 (not on join)
-- Run once in Supabase SQL Editor

alter table public.players
  add column if not exists referral_lvl1_paid boolean default false;

alter table public.players
  add column if not exists referral_wall5_paid boolean default false;

comment on column public.players.referral_lvl1_paid is
  'True after referrer was paid for this player reaching level 1';
comment on column public.players.referral_wall5_paid is
  'True after referrer was paid for this player clearing wall 4→5';

-- daily_shards: shards mined today (for reconciling tap_power × daily_taps).
-- daily_taps stays RAW click count (matches the HUD daily-limit bar).
-- max_daily_limit should store EFFECTIVE day cap (base + battery + tasks + ads).

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS daily_shards numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.players.daily_taps IS
  'Raw tap/click count toward the daily limit bar (1 click = 1).';

COMMENT ON COLUMN public.players.daily_shards IS
  'Shards credited from mining today (weighted by tap_power / Frenzy). Resets on UTC day roll.';

COMMENT ON COLUMN public.players.max_daily_limit IS
  'Effective daily tap capacity for today: base 1000 (or Rush) + Expanded Battery + task boosts + ad boosts.';

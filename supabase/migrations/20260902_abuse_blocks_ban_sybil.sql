-- =============================================================================
-- Abuse blocks: banned IPs + is_banned on players
-- Sybil farm from 39.43.220.23 (2026-09-02)
-- =============================================================================

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS is_banned boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_players_is_banned
  ON public.players (is_banned)
  WHERE is_banned = true;

CREATE TABLE IF NOT EXISTS public.abuse_blocks (
  id bigserial PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('ip', 'username', 'player_id')),
  value text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, value)
);

CREATE INDEX IF NOT EXISTS idx_abuse_blocks_kind_value
  ON public.abuse_blocks (kind, lower(value));

COMMENT ON TABLE public.abuse_blocks IS
  'Hard blocks checked by auth-login / auth-register / Edge session guard.';

REVOKE ALL ON TABLE public.abuse_blocks FROM PUBLIC;
REVOKE ALL ON TABLE public.abuse_blocks FROM anon, authenticated;
GRANT ALL ON TABLE public.abuse_blocks TO service_role;
GRANT ALL ON TABLE public.abuse_blocks TO postgres;

-- Block the farm IP
INSERT INTO public.abuse_blocks (kind, value, reason)
VALUES ('ip', '39.43.220.23', 'sybil farm 2026-09-02')
ON CONFLICT (kind, value) DO UPDATE
SET reason = EXCLUDED.reason;

-- Ban listed usernames (also wipe economy so phantom G2U/shards cannot be spent)
UPDATE public.players
SET
  is_banned = true,
  has_beta_access = false,
  shard_balance = 0,
  season_shards = 0,
  weekly_shards = 0,
  daily_taps = 0,
  gft_token_balance = 0,
  lifetime_taps = 0,
  max_unlocked_level = 0,
  inventory = '{}'::jsonb,
  completed_tasks = '[]'::jsonb,
  daily_usage = '{}'::jsonb,
  premium_multiplier = 1,
  premium_multiplier_expires = NULL,
  limit_boost_amount = 0,
  limit_boost_expires = NULL,
  frenzy_expires = NULL,
  efficiency_expires = NULL,
  energy_boost_expires = NULL,
  last_updated = now()
WHERE lower(username) IN (
  'dcbddj02',
  'ddkbsj',
  'dhdeudsb',
  'djnk7999',
  'eeodixdh',
  'fifjrif298',
  'sdjjjdhe',
  'shdbdns557',
  'shsbwhsv20',
  'siddbjej',
  'sjdjjdsj8',
  'ssamf490',
  'sshshsshdhw',
  'ssjzhdvbj',
  -- linked same operator (batch 2)
  'sjdfjde',
  'shszhd240',
  'khnjigss',
  'sjswjsh8'
);

INSERT INTO public.abuse_blocks (kind, value, reason)
SELECT 'username', lower(u), 'sybil farm 2026-09-02'
FROM unnest(ARRAY[
  'dcbddj02',
  'ddkbsj',
  'dhdeudsb',
  'djnk7999',
  'eeodixdh',
  'fifjrif298',
  'sdjjjdhe',
  'shdbdns557',
  'shsbwhsv20',
  'siddbjej',
  'sjdjjdsj8',
  'ssamf490',
  'sshshsshdhw',
  'ssjzhdvbj'
]) AS u
ON CONFLICT (kind, value) DO NOTHING;

INSERT INTO public.abuse_blocks (kind, value, reason)
SELECT 'player_id', p.telegram_id, 'sybil farm 2026-09-02'
FROM public.players p
WHERE lower(p.username) IN (
  'dcbddj02',
  'ddkbsj',
  'dhdeudsb',
  'djnk7999',
  'eeodixdh',
  'fifjrif298',
  'sdjjjdhe',
  'shdbdns557',
  'shsbwhsv20',
  'siddbjej',
  'sjdjjdsj8',
  'ssamf490',
  'sshshsshdhw',
  'ssjzhdvbj'
)
ON CONFLICT (kind, value) DO NOTHING;

-- Kill active sessions for banned players + this IP
DELETE FROM public.player_sessions
WHERE ip_hint = '39.43.220.23'
   OR player_id IN (
     SELECT telegram_id FROM public.players WHERE is_banned = true
   );

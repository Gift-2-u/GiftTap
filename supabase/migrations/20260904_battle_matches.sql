-- GiftTap Battle: async Falling Gifts PvP matches
-- Entry = energy (battery + daily_taps). Win = weekly-style backpack badge.
CREATE TABLE IF NOT EXISTS public.battle_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seed text NOT NULL,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'active', 'done', 'cancelled')),
  player_a text NOT NULL,
  player_b text,
  score_a integer,
  score_b integer,
  catches_a integer,
  catches_b integer,
  entry_energy integer NOT NULL DEFAULT 50,
  win_badge text NOT NULL DEFAULT 'badge_bronze',
  winner_id text,
  level_a integer,
  level_b integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_a_at timestamptz,
  started_b_at timestamptz,
  finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS battle_matches_status_created_idx
  ON public.battle_matches (status, created_at DESC);
CREATE INDEX IF NOT EXISTS battle_matches_player_a_idx
  ON public.battle_matches (player_a, created_at DESC);
CREATE INDEX IF NOT EXISTS battle_matches_player_b_idx
  ON public.battle_matches (player_b, created_at DESC);

ALTER TABLE public.battle_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS battle_matches_select_own ON public.battle_matches;
CREATE POLICY battle_matches_select_own ON public.battle_matches
  FOR SELECT
  USING (
    player_a = coalesce(auth.jwt() ->> 'sub', '')
    OR player_b = coalesce(auth.jwt() ->> 'sub', '')
  );

COMMENT ON TABLE public.battle_matches IS
  'GiftTap Battle. Entry energy via battle-start; badge reward via battle-finish (service_role).';

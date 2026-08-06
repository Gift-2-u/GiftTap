-- ============================================================
-- REMOVE anti-cheat / secure-progress gates
-- Run once in Supabase SQL Editor if you applied the 20260805
-- anti-cheat or secure-progress migrations.
-- Restores normal client writes to public.players (pre-lock).
-- ============================================================

DROP TRIGGER IF EXISTS trg_players_anti_cheat ON public.players;
DROP TRIGGER IF EXISTS trg_players_secure_progress ON public.players;

DROP FUNCTION IF EXISTS public.players_anti_cheat_progress();
DROP FUNCTION IF EXISTS public.players_secure_progress_gate();

-- progress_token columns are harmless if present; leave them.
-- is_banned column is harmless if present; leave it.

COMMENT ON TABLE public.players IS
  'Anti-cheat progress triggers removed 2026-08-06. Client direct saves restored.';

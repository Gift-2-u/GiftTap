-- =============================================================================
-- In-game wallet ROTATE (no NULL, no external Phantom required)
-- service_role / Edge only. Does NOT wipe shards/taps/inventory.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.gift_rotate_ingame_wallet(
  p_telegram_id text,
  p_new_wallet text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id text := btrim(p_telegram_id);
  v_wallet text := btrim(p_new_wallet);
  v_old text;
BEGIN
  -- Only service_role (Edge) may call this
  IF coalesce(auth.role(), '') IS DISTINCT FROM 'service_role'
     AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: gift_rotate_ingame_wallet is Edge-only'
      USING ERRCODE = '42501';
  END IF;

  IF v_id IS NULL OR v_id = '' THEN
    RAISE EXCEPTION 'player id required';
  END IF;
  IF v_wallet IS NULL OR length(v_wallet) < 32 THEN
    RAISE EXCEPTION 'valid new wallet address required';
  END IF;

  -- Another account must not already own this address
  IF EXISTS (
    SELECT 1 FROM public.players
    WHERE wallet_address = v_wallet
      AND telegram_id::text IS DISTINCT FROM v_id
  ) THEN
    RAISE EXCEPTION 'wallet address already bound to another account';
  END IF;

  SELECT wallet_address INTO v_old
  FROM public.players
  WHERE telegram_id::text = v_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'player not found';
  END IF;

  -- Bypass identity lock for this trusted rotation
  PERFORM set_config('gift.admin_wallet_override', 'on', true);

  UPDATE public.players
  SET
    wallet_address = v_wallet,
    last_updated = now()
  WHERE telegram_id::text = v_id;

  -- Clear vault only — password and all stats stay
  INSERT INTO public.player_secrets (telegram_id, encrypted_vault, updated_at)
  VALUES (v_id, NULL, now())
  ON CONFLICT (telegram_id) DO UPDATE SET
    encrypted_vault = NULL,
    updated_at = now();

  RETURN jsonb_build_object(
    'success', true,
    'telegram_id', v_id,
    'old_wallet', v_old,
    'new_wallet', v_wallet
  );
END;
$$;

REVOKE ALL ON FUNCTION public.gift_rotate_ingame_wallet(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gift_rotate_ingame_wallet(text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gift_rotate_ingame_wallet(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.gift_rotate_ingame_wallet(text, text) TO postgres;

COMMENT ON FUNCTION public.gift_rotate_ingame_wallet(text, text) IS
  'Edge-only: replace in-game wallet address + clear vault. Stats untouched.';

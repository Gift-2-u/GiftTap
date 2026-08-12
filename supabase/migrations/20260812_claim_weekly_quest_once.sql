-- =============================================================================
-- Atomic once-only weekly quest claim
-- Claim once → reward once → forever DONE that UTC week (survives inventory races)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.utc_iso_week_id(p_ts timestamptz DEFAULT now())
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT
    to_char((p_ts AT TIME ZONE 'UTC'), 'IYYY')
    || '-W'
    || lpad(to_char((p_ts AT TIME ZONE 'UTC'), 'IW'), 2, '0');
$$;

CREATE OR REPLACE FUNCTION public.claim_weekly_quest(
  p_telegram_id text,
  p_quest_id text,
  p_reward_amount numeric DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv jsonb;
  v_week text;
  v_claim_key text;
  v_reward_key text;
  v_global_claim text;
  v_global_reward text;
  v_wq jsonb;
  v_claimed jsonb;
  v_keys jsonb;
  v_reward_keys jsonb;
  v_log jsonb;
  v_boost jsonb;
  v_boost_amt numeric;
  v_boost_exp timestamptz;
  v_midnight timestamptz;
  v_reward numeric;
  v_id text;
  v_has boolean := false;
  v_old_week text;
BEGIN
  IF p_telegram_id IS NULL OR btrim(p_telegram_id) = '' THEN
    RAISE EXCEPTION 'telegram_id required';
  END IF;
  IF p_quest_id IS NULL OR btrim(p_quest_id) = '' THEN
    RAISE EXCEPTION 'quest_id required';
  END IF;

  v_id := btrim(p_quest_id);
  v_reward := GREATEST(0, COALESCE(p_reward_amount, 100));
  v_week := public.utc_iso_week_id(now());
  v_claim_key := v_week || ':' || v_id;
  v_reward_key := v_week || ':reward:' || v_id;
  v_global_claim := 'weekly:' || v_week || ':' || v_id;
  v_global_reward := 'weekly_reward:' || v_week || ':' || v_id;
  v_midnight := (
    date_trunc('day', (now() AT TIME ZONE 'UTC')) + interval '1 day' - interval '1 millisecond'
  ) AT TIME ZONE 'UTC';

  SELECT COALESCE(inventory, '{}'::jsonb)
  INTO v_inv
  FROM public.players
  WHERE telegram_id = p_telegram_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'player not found';
  END IF;

  IF v_inv IS NULL OR jsonb_typeof(v_inv) <> 'object' THEN
    v_inv := '{}'::jsonb;
  END IF;

  v_wq := COALESCE(v_inv->'weekly_quests', '{}'::jsonb);
  IF jsonb_typeof(v_wq) <> 'object' THEN
    v_wq := '{}'::jsonb;
  END IF;
  v_old_week := v_wq->>'weekId';

  -- Different finished week on server → start a clean weekly_quests for current week
  IF v_old_week IS NOT NULL AND v_old_week <> v_week THEN
    v_wq := jsonb_build_object(
      'weekId', v_week,
      'claimed', '[]'::jsonb,
      'daysTap500', '[]'::jsonb,
      'daysActive', '[]'::jsonb,
      'daysFull', '[]'::jsonb,
      'boostBuys', 0
    );
  ELSE
    v_wq := jsonb_set(v_wq, '{weekId}', to_jsonb(v_week), true);
    IF v_wq->'claimed' IS NULL OR jsonb_typeof(v_wq->'claimed') <> 'array' THEN
      v_wq := jsonb_set(v_wq, '{claimed}', '[]'::jsonb, true);
    END IF;
  END IF;

  v_claimed := COALESCE(v_wq->'claimed', '[]'::jsonb);
  v_keys := COALESCE(v_inv->'weekly_claim_keys', '[]'::jsonb);
  v_reward_keys := COALESCE(v_inv->'weekly_reward_keys', '[]'::jsonb);
  v_log := COALESCE(v_inv->'claim_log', '[]'::jsonb);
  IF jsonb_typeof(v_keys) <> 'array' THEN v_keys := '[]'::jsonb; END IF;
  IF jsonb_typeof(v_reward_keys) <> 'array' THEN v_reward_keys := '[]'::jsonb; END IF;
  IF jsonb_typeof(v_log) <> 'array' THEN v_log := '[]'::jsonb; END IF;
  IF jsonb_typeof(v_claimed) <> 'array' THEN v_claimed := '[]'::jsonb; END IF;

  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(v_claimed) e WHERE e = v_id
  ) INTO v_has;
  IF NOT v_has THEN
    SELECT EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(v_keys) e WHERE e = v_claim_key
    ) INTO v_has;
  END IF;
  IF NOT v_has THEN
    SELECT EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(v_log) e WHERE e = v_global_claim
    ) INTO v_has;
  END IF;
  IF NOT v_has THEN
    SELECT EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(v_reward_keys) e WHERE e = v_reward_key
    ) INTO v_has;
  END IF;

  -- Always ensure claim marks exist when already claimed (repair)
  IF v_has THEN
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_claimed) e WHERE e = v_id) THEN
      v_claimed := v_claimed || to_jsonb(v_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_keys) e WHERE e = v_claim_key) THEN
      v_keys := v_keys || to_jsonb(v_claim_key);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_log) e WHERE e = v_global_claim) THEN
      v_log := v_log || to_jsonb(v_global_claim);
    END IF;

    v_wq := jsonb_set(v_wq, '{claimed}', v_claimed, true);
    v_inv := jsonb_set(v_inv, '{weekly_quests}', v_wq, true);
    v_inv := jsonb_set(v_inv, '{weekly_claim_keys}', v_keys, true);
    v_inv := jsonb_set(v_inv, '{claim_log}', v_log, true);

    UPDATE public.players
    SET inventory = v_inv, last_updated = now()
    WHERE telegram_id = p_telegram_id;

    RETURN jsonb_build_object(
      'ok', true,
      'already', true,
      'week_id', v_week,
      'quest_id', v_id,
      'reward_amount', 0,
      'inventory', v_inv
    );
  END IF;

  -- First claim this week — mark all ledgers + grant boost once
  v_claimed := v_claimed || to_jsonb(v_id);
  v_keys := v_keys || to_jsonb(v_claim_key);
  v_reward_keys := v_reward_keys || to_jsonb(v_reward_key);
  v_log := v_log || to_jsonb(v_global_claim) || to_jsonb(v_global_reward);

  v_wq := jsonb_set(v_wq, '{claimed}', v_claimed, true);

  v_boost := v_inv->'task_limit_boost';
  v_boost_amt := v_reward;
  v_boost_exp := v_midnight;
  IF v_boost IS NOT NULL AND (v_boost ? 'expires') THEN
    BEGIN
      IF (v_boost->>'expires')::timestamptz > now() THEN
        v_boost_amt := COALESCE((v_boost->>'amount')::numeric, 0) + v_reward;
        v_boost_exp := (v_boost->>'expires')::timestamptz;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_boost_amt := v_reward;
      v_boost_exp := v_midnight;
    END;
  END IF;

  v_inv := jsonb_set(v_inv, '{weekly_quests}', v_wq, true);
  v_inv := jsonb_set(v_inv, '{weekly_claim_keys}', v_keys, true);
  v_inv := jsonb_set(v_inv, '{weekly_reward_keys}', v_reward_keys, true);
  v_inv := jsonb_set(v_inv, '{claim_log}', v_log, true);
  v_inv := jsonb_set(
    v_inv,
    '{task_limit_boost}',
    jsonb_build_object(
      'amount', v_boost_amt,
      'expires', v_boost_exp
    ),
    true
  );
  v_inv := jsonb_set(v_inv, '{task_daily_limit_migrated_v1}', 'true'::jsonb, true);

  UPDATE public.players
  SET inventory = v_inv, last_updated = now()
  WHERE telegram_id = p_telegram_id;

  RETURN jsonb_build_object(
    'ok', true,
    'already', false,
    'week_id', v_week,
    'quest_id', v_id,
    'reward_amount', v_reward,
    'inventory', v_inv
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_weekly_quest(text, text, numeric)
  TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.claim_weekly_quest(p_telegram_id text, p_quest_id text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.claim_weekly_quest(p_telegram_id, p_quest_id, 100::numeric);
$$;

GRANT EXECUTE ON FUNCTION public.claim_weekly_quest(text, text)
  TO anon, authenticated, service_role;

-- Prize: free Instant Refill once per week (no +100 daily limit)
CREATE OR REPLACE FUNCTION public.claim_weekly_prize(p_telegram_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv jsonb;
  v_week text;
  v_id text := 'wq_week_prize';
  v_claim_key text;
  v_global_claim text;
  v_wq jsonb;
  v_claimed jsonb;
  v_keys jsonb;
  v_log jsonb;
  v_has boolean := false;
  v_old_week text;
  v_item text := 'refill';
  v_count int;
BEGIN
  IF p_telegram_id IS NULL OR btrim(p_telegram_id) = '' THEN
    RAISE EXCEPTION 'telegram_id required';
  END IF;

  v_week := public.utc_iso_week_id(now());
  v_claim_key := v_week || ':' || v_id;
  v_global_claim := 'weekly:' || v_week || ':' || v_id;

  SELECT COALESCE(inventory, '{}'::jsonb)
  INTO v_inv
  FROM public.players
  WHERE telegram_id = p_telegram_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'player not found';
  END IF;
  IF v_inv IS NULL OR jsonb_typeof(v_inv) <> 'object' THEN
    v_inv := '{}'::jsonb;
  END IF;

  v_wq := COALESCE(v_inv->'weekly_quests', '{}'::jsonb);
  IF jsonb_typeof(v_wq) <> 'object' THEN
    v_wq := '{}'::jsonb;
  END IF;
  v_old_week := v_wq->>'weekId';
  IF v_old_week IS NOT NULL AND v_old_week <> v_week THEN
    v_wq := jsonb_build_object(
      'weekId', v_week,
      'claimed', '[]'::jsonb,
      'daysTap500', '[]'::jsonb,
      'daysActive', '[]'::jsonb,
      'daysFull', '[]'::jsonb,
      'boostBuys', 0
    );
  ELSE
    v_wq := jsonb_set(v_wq, '{weekId}', to_jsonb(v_week), true);
    IF v_wq->'claimed' IS NULL OR jsonb_typeof(v_wq->'claimed') <> 'array' THEN
      v_wq := jsonb_set(v_wq, '{claimed}', '[]'::jsonb, true);
    END IF;
  END IF;

  v_claimed := COALESCE(v_wq->'claimed', '[]'::jsonb);
  v_keys := COALESCE(v_inv->'weekly_claim_keys', '[]'::jsonb);
  v_log := COALESCE(v_inv->'claim_log', '[]'::jsonb);
  IF jsonb_typeof(v_keys) <> 'array' THEN v_keys := '[]'::jsonb; END IF;
  IF jsonb_typeof(v_log) <> 'array' THEN v_log := '[]'::jsonb; END IF;
  IF jsonb_typeof(v_claimed) <> 'array' THEN v_claimed := '[]'::jsonb; END IF;

  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(v_claimed) e WHERE e = v_id
  ) INTO v_has;
  IF NOT v_has THEN
    SELECT EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(v_keys) e WHERE e = v_claim_key
    ) INTO v_has;
  END IF;
  IF NOT v_has THEN
    SELECT EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(v_log) e WHERE e = v_global_claim
    ) INTO v_has;
  END IF;

  IF v_has THEN
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_claimed) e WHERE e = v_id) THEN
      v_claimed := v_claimed || to_jsonb(v_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_keys) e WHERE e = v_claim_key) THEN
      v_keys := v_keys || to_jsonb(v_claim_key);
    END IF;
    v_wq := jsonb_set(v_wq, '{claimed}', v_claimed, true);
    v_inv := jsonb_set(v_inv, '{weekly_quests}', v_wq, true);
    v_inv := jsonb_set(v_inv, '{weekly_claim_keys}', v_keys, true);
    v_inv := jsonb_set(v_inv, '{claim_log}', v_log, true);
    UPDATE public.players SET inventory = v_inv, last_updated = now()
    WHERE telegram_id = p_telegram_id;
    RETURN jsonb_build_object(
      'ok', true, 'already', true, 'week_id', v_week, 'quest_id', v_id, 'inventory', v_inv
    );
  END IF;

  v_claimed := v_claimed || to_jsonb(v_id);
  v_keys := v_keys || to_jsonb(v_claim_key);
  v_log := v_log || to_jsonb(v_global_claim);
  v_wq := jsonb_set(v_wq, '{claimed}', v_claimed, true);
  v_count := COALESCE((v_inv->>v_item)::int, 0) + 1;
  v_inv := jsonb_set(v_inv, '{weekly_quests}', v_wq, true);
  v_inv := jsonb_set(v_inv, '{weekly_claim_keys}', v_keys, true);
  v_inv := jsonb_set(v_inv, '{claim_log}', v_log, true);
  v_inv := jsonb_set(v_inv, ARRAY[v_item], to_jsonb(v_count), true);

  UPDATE public.players SET inventory = v_inv, last_updated = now()
  WHERE telegram_id = p_telegram_id;

  RETURN jsonb_build_object(
    'ok', true, 'already', false, 'week_id', v_week, 'quest_id', v_id,
    'reward_item', v_item, 'inventory', v_inv
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_weekly_prize(text)
  TO anon, authenticated, service_role;

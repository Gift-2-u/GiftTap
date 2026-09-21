-- claim_weekly_quest: require real weekly progress before +100 max-daily reward.
-- Fixes day-1 / new-player false claims (server used to grant without checking days).

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
  v_days jsonb;
  v_day_count int := 0;
  v_boost_buys int := 0;
  v_need int := 0;
  v_kind text;
  v_d text;
  v_week_start date;
  v_week_end date;
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

  -- ISO week Mon..Sun as UTC dates (for filtering day stamps)
  v_week_start := (
    date_trunc('week', (now() AT TIME ZONE 'UTC')::timestamp)
  )::date;
  -- Postgres date_trunc('week') is Monday-based for timestamp
  v_week_end := v_week_start + 6;

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

  -- Strip day stamps outside this UTC week (fixes false 3/3 on day 1)
  FOREACH v_kind IN ARRAY ARRAY['daysTap500', 'daysActive', 'daysFull']
  LOOP
    v_days := '[]'::jsonb;
    IF v_wq->v_kind IS NOT NULL AND jsonb_typeof(v_wq->v_kind) = 'array' THEN
      FOR v_d IN SELECT jsonb_array_elements_text(v_wq->v_kind)
      LOOP
        IF v_d ~ '^\d{4}-\d{2}-\d{2}$'
           AND v_d::date >= v_week_start
           AND v_d::date <= v_week_end
        THEN
          IF NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(v_days) e WHERE e = v_d
          ) THEN
            v_days := v_days || to_jsonb(v_d);
          END IF;
        END IF;
      END LOOP;
    END IF;
    v_wq := jsonb_set(v_wq, ARRAY[v_kind], v_days, true);
  END LOOP;

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
    SET inventory = v_inv
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

  -- Require real progress for this quest (prevents day-1 false claims)
  v_boost_buys := COALESCE((v_wq->>'boostBuys')::int, 0);
  IF v_id = 'wq_tap500_3' THEN
    v_need := 3;
    SELECT count(*)::int INTO v_day_count
    FROM jsonb_array_elements_text(COALESCE(v_wq->'daysTap500', '[]'::jsonb)) e;
    IF v_day_count < v_need THEN
      RAISE EXCEPTION 'Quest not complete: need % days with 500+ taps (have %)', v_need, v_day_count;
    END IF;
  ELSIF v_id = 'wq_tap500_5' THEN
    v_need := 5;
    SELECT count(*)::int INTO v_day_count
    FROM jsonb_array_elements_text(COALESCE(v_wq->'daysTap500', '[]'::jsonb)) e;
    IF v_day_count < v_need THEN
      RAISE EXCEPTION 'Quest not complete: need % days with 500+ taps (have %)', v_need, v_day_count;
    END IF;
  ELSIF v_id = 'wq_full_3' THEN
    v_need := 3;
    SELECT count(*)::int INTO v_day_count
    FROM jsonb_array_elements_text(COALESCE(v_wq->'daysFull', '[]'::jsonb)) e;
    IF v_day_count < v_need THEN
      RAISE EXCEPTION 'Quest not complete: need % days draining 1000 taps (have %)', v_need, v_day_count;
    END IF;
  ELSIF v_id = 'wq_full_5' THEN
    v_need := 5;
    SELECT count(*)::int INTO v_day_count
    FROM jsonb_array_elements_text(COALESCE(v_wq->'daysFull', '[]'::jsonb)) e;
    IF v_day_count < v_need THEN
      RAISE EXCEPTION 'Quest not complete: need % days draining 1000 taps (have %)', v_need, v_day_count;
    END IF;
  ELSIF v_id = 'wq_boost_3' THEN
    IF v_boost_buys < 3 THEN
      RAISE EXCEPTION 'Quest not complete: need 3 boost buys (have %)', v_boost_buys;
    END IF;
  ELSIF v_id = 'wq_boost_5' THEN
    IF v_boost_buys < 5 THEN
      RAISE EXCEPTION 'Quest not complete: need 5 boost buys (have %)', v_boost_buys;
    END IF;
  ELSIF v_id = 'wq_week_prize' THEN
    -- prize handled elsewhere; reject here
    RAISE EXCEPTION 'Use weekly prize claim path';
  ELSE
    RAISE EXCEPTION 'Unknown weekly quest: %', v_id;
  END IF;

  -- First claim this week — mark ledgers + grant boost once
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
  SET inventory = v_inv
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

-- Keep service_role only (hard lock)
REVOKE EXECUTE ON FUNCTION public.claim_weekly_quest(text, text, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_weekly_quest(text, text, numeric) TO service_role;

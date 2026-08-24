#!/usr/bin/env python3
import json
import urllib.request

TOKEN = open("/home/tower/.supabase/access-token").read().strip()
URL = "https://api.supabase.com/v1/projects/ncwlbwzxfpcnxkyrmdck/database/query"


def q(sql: str):
    req = urllib.request.Request(
        URL,
        data=json.dumps({"query": sql}).encode(),
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req) as res:
        body = res.read().decode()
        print(sql.split("\n")[0][:80], "=>", body)
        return json.loads(body)


q(
    "select public.utc_iso_week_id(now()) as current_week, "
    "public.previous_utc_iso_week_id(now()) as previous_week"
)
q(
    "select count(*)::int as n from pg_proc p "
    "join pg_namespace n on n.oid=p.pronamespace "
    "where n.nspname='public' and p.proname='grant_weekly_badges_from_snapshot'"
)
q(
    "select (prosrc like '%grant_weekly_badges_from_snapshot%') as rollover_calls_grant "
    "from pg_proc p join pg_namespace n on n.oid=p.pronamespace "
    "where n.nspname='public' and p.proname='ensure_weekly_leaderboard_rollover' limit 1"
)
q(
    "select week_id, count(*)::int as snap_rows, "
    "count(*) filter (where badge_tier is not null)::int as with_tier "
    "from weekly_leaderboard_snapshots "
    "where week_id = public.previous_utc_iso_week_id(now()) group by 1"
)
q(
    "select week_id, count(*)::int as grants from badge_grants "
    "where week_id = public.previous_utc_iso_week_id(now()) group by 1"
)
q(
    "select jobname, schedule, left(command,120) as command "
    "from cron.job where command ilike '%weekly%' or jobname ilike '%weekly%'"
)
# Does previous week winners missing inventory badge exist?
q(
    """
with prev as (select public.previous_utc_iso_week_id(now()) as w)
select s.rank, s.username, s.badge_tier,
  coalesce((p.inventory->>('badge_'||lower(s.badge_tier)))::int,0) as inv_badge,
  exists(select 1 from badge_grants g where g.player_id=s.telegram_id::text and g.week_id=s.week_id) as has_grant
from weekly_leaderboard_snapshots s
join prev on s.week_id = prev.w
left join players p on p.telegram_id::text = s.telegram_id::text
where s.badge_tier is not null
order by s.rank
limit 20
"""
)

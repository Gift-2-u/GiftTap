# Gift2U agent / coding rules

## Claimable rewards (tasks, quests, gifts, prizes)

**Default: once-only after claim.**

When you add or change anything a player can **Claim**:

1. **After a successful claim it must become unclaimable** (UI shows DONE/CLAIMED; server will not re-grant).
2. **Do not invent a soft local-only flag** that inventory races can wipe. Use durable keys:
   - Prefer `src/claimOnce.js` → `runClaimOnce`, `claimKey`, `claim_log`
   - Weekly board also uses `weekly_claim_keys` + `weekly_quests.claimed` (see `weeklyQuestLogic.js`)
   - Lifetime tasks use server `completed_tasks` and re-read before grant
3. **Opt out only when the product explicitly allows multi-claim**, and code it clearly:
   - `onceOnly: false`, or
   - `period: 'utc-day' | 'utc-week'` with a `periodKey` so it resets on purpose
4. **UI**: Claim button → disabled / ✓ DONE immediately on press; never unlock after a successful server write.
5. **Grant order**: record claim on server **before or with** the reward write; if reward write races, re-assert the claim key after.

### New claimable checklist

- [ ] Unique id + `claimKey({ scope, id, periodKey? })`
- [ ] Server durable record (claim_log / completed_tasks / weekly_claim_keys)
- [ ] `alreadyClaimed` → no second grant
- [ ] Session lock against double-tap
- [ ] UI DONE state after claim
- [ ] Only set `onceOnly: false` if design says so (comment why)

### Code entry points

| Kind | Module |
|------|--------|
| Generic once-only claims | `src/claimOnce.js` |
| Weekly quests | `src/WeeklyQuests.jsx`, `src/weeklyQuestLogic.js` |
| Lifetime tasks | `src/Tasks.jsx` (`completed_tasks`) |
| Daily limit grants | `grantTaskEnergy` in `GiftTap.jsx` (must preserve claim keys) |

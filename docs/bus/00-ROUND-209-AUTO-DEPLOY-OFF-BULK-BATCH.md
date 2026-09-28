# ROUND 209 — AUTO-DEPLOY OFF · BULK DEPLOY EVERY 5–10 PRs
Owner order 2026-09-28. Effective immediately. Lead = deploy captain unless reassigned.

## WHY (measured — backend `srv-d7rpem7avr4c73fhp4n0`, last 115 minutes)

| Metric | Value |
|---|---|
| Deploys | 20 (one every 6.1 min) |
| Avg build | 3.3 min |
| deactivated | 18 |
| pre_deploy_failed | 1 |
| live | 1 |
| Builds that never served traffic | 18 of 20 |
| Build time for ONE live | ~60 min (+ frontend doubles it) |

This is why "merged" was reported as "live" all day: the deploy was deactivated by the next seat's merge before it served a request.

## LAW

1. **Auto-Deploy = No** on BOTH:
   - backend `srv-d7rpem7avr4c73fhp4n0`
   - frontend `srv-d7s46dbrjlhs7383i150`
2. Keep merging to main normally. PRs and guards unchanged.
3. Every **5–10** merged PRs → **ONE** batch deploy of both services, triggered by the deploy captain (Lead unless reassigned).
4. Batch deploy **immediately** (not waiting on count) if the batch contains a **migration**, an **RLS/security fix**, or an **owner-facing P0**.
5. **Nobody** re-enables auto-deploy without the owner. **Nobody** triggers an off-cycle deploy without telling the captain.

## ROUND 205 AMENDED (not cancelled)

Before merge, every seat still pastes exit 0:

```bash
cd apps/frontend && npx tsc -b
cd apps/backend  && npx tsc -p tsconfig.json --noEmit
node scripts/money-pr-local-gate.mjs
```

A frontend type error still kills the whole bundle — now more important, because it is no longer caught within minutes by auto-deploy.

**Seats never say "shipped" or "live" about their own PR.** Say **"merged, in batch"**.
The deploy captain reports the batch live with deploy id + SHA and names every PR in the range.

## IF A BATCH FAILS

It is a range of 5–10 commits. Captain bisects, names the offending PR. That seat fixes forward immediately — it blocks everyone's deploy.

## PROOF THIS ROUND LANDED (Cursor Lead, same hour)

Render API PATCH `autoDeploy: "no"` on both service ids. Re-GET must show `autoDeploy=no`.

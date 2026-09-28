# ROUND 209 — AUTO-DEPLOY OFF · BULK DEPLOY EVERY 8 PRs
Owner order 2026-09-28. Effective immediately.
Deploy captain = **Claude Lead** (unless owner reassigns).

## WHY (measured — backend `srv-d7rpem7avr4c73fhp4n0`, last 115 minutes)

| Metric | Value |
|---|---|
| Deploys | 20 (one every 6.1 min) |
| Avg build | 3.3 min · avg queue 0.9 min |
| deactivated | 18 |
| pre_deploy_failed | 1 |
| live | 1 |
| Builds that never served traffic | 18 of 20 |
| Build time for ONE live | ~60 min (+ frontend doubles it) |

Mechanism behind every "merged but not live" today: deploy deactivated by the next seat's merge before it served.

## LAW

1. **Auto-Deploy = No** on BOTH (owner dashboard and/or API):
   - backend `srv-d7rpem7avr4c73fhp4n0`
   - frontend `srv-d7s46dbrjlhs7383i150`
2. Keep merging to main normally. PRs, lanes, guards unchanged.
3. Every **8** merged PRs → **ONE** batch deploy of both services, fired by Claude Lead.
4. Deploy **IMMEDIATELY**, off-cycle, if the batch contains a **migration**, an **RLS/security fix**, or an **owner-facing P0**. Tell the captain.
5. **FORBIDDEN:** re-enable auto-deploy without the owner · off-cycle deploy without telling the captain · merge with failing tsc to "let the batch catch it".

## ROUND 205 AMENDED (not cancelled)

Before merge, every seat pastes exit 0:

```bash
cd apps/frontend && npx tsc -b
cd apps/backend  && npx tsc -p tsconfig.json --noEmit
node scripts/money-pr-local-gate.mjs
```

A frontend type error still kills the whole bundle — now may take up to 8 PRs to surface. Compiling clean before merge is **more** important.

**Seats never say "shipped" or "live" about their own PR.** Say **"merged, in batch"**.
Captain reports the batch live with **both deploy ids + SHA**, naming every PR in the range.

## IF A BATCH FAILS

Range of up to 8 commits. Captain bisects, names the offending PR. That seat fixes forward immediately — blocks every seat's deploy.

## PROOF (Cursor Lead, same hour)

Render API PATCH `autoDeploy: "no"` on both service ids — GET shows `autoDeploy=no`, `autoDeployTrigger=off`. Owner also flipping in dashboard.

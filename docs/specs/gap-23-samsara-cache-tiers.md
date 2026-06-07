# GAP-23 — 4-Tier Samsara Cache Hierarchy

## Problem

Samsara REST API rate limit is **60 requests/minute**. CAP-1..15 telematics consumers need different freshness budgets:

| Tier | Max age | Use case |
|------|---------|----------|
| 1 | 5s | HOS clocks, active dispatch alerts |
| 2 | 30s | GPS positions, ETA |
| 3 | 5min | Vehicle stats, driver clocks |
| 4 | 15min | Weekly aggregates, driver scoring |

Without explicit tiers, duplicate fetches risk rate-limit exhaustion.

## Implementation

- `apps/backend/src/lib/cache-tiers.ts` — tier constants + shared in-memory helper
- `apps/backend/src/integrations/samsara/cache/tier{1..4}-*.ts` — tier accessors
- `apps/backend/src/integrations/samsara/cache/cache-warmer.ts` — cron pre-warm for tiers 3/4

## Cache warmer schedule

- Tier 3: every 5 minutes (`*/5 * * * *`, America/Chicago)
- Tier 4: every 15 minutes (`*/15 * * * *`, America/Chicago)

Disable via `ENABLE_SAMSARA_CACHE_WARMER=false`.

## CI

`npm run verify:cache-tier-coverage` — tier modules present, warmer wired in `index.ts`, legacy direct Samsara consumers allowlisted until GAP-24 per-screen adoption.

## Post-merge

GAP-24 (per-screen freshness budget) will map each CAP consumer to a tier explicitly.

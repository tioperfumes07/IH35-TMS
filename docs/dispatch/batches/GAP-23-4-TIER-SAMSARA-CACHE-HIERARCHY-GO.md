═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-MEDIUM / TASK GAP-23 — 4-Tier Samsara Cache Hierarchy
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: G-J  ·  LANE: B  ·  CURSOR-B
PAIRED WITH: GAP-22 (Lane A) — same wave G-J

LANE LOCK — FORBIDDEN PATHS (Lane A GAP-22 owned):
  apps/backend/src/accounting/expenses/**
  apps/frontend/src/components/expenses/ReceiptOcrPanel.tsx
  apps/frontend/src/components/expenses/MileageReimbursementForm.tsx

ALLOWED FILES (disjoint from Lane A):
  apps/backend/src/lib/cache-tiers.ts                                        (NEW)
  apps/backend/src/integrations/samsara/cache/tier1-realtime.ts              (NEW)
  apps/backend/src/integrations/samsara/cache/tier2-30s.ts                   (NEW)
  apps/backend/src/integrations/samsara/cache/tier3-5min.ts                  (NEW)
  apps/backend/src/integrations/samsara/cache/tier4-15min.ts                 (NEW)
  apps/backend/src/integrations/samsara/cache/__tests__/cache.test.ts        (NEW)
  apps/backend/src/integrations/samsara/cache/cache-warmer.ts                (NEW worker)
  scripts/verify-cache-tier-coverage.mjs                                     (NEW CI guard)
  docs/specs/gap-23-samsara-cache-tiers.md                                   (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: ChatGPT execution plan · Samsara API rate-limit (60/min) plus
        feature pressure from CAP-1..15 requires explicit cache tiers · 
        Cache freshness budget per screen needed (per GAP-24)

PROBLEM: Without explicit tiered caching, CAP-1 (live GPS) implementation 
will hammer Samsara API. Different screens need different freshness:
  - Dispatch board ETA → 30s is fine
  - Map view positions → 5s ideal but 30s acceptable  
  - Driver scoring weekly aggregate → 15min cache OK
  - HOS clocks → real-time needed
No central cache layer → duplicate fetches + rate-limit risk.

SCOPE — ADDITIVE ONLY:

PIECE A — Cache tier definitions
  cache-tiers.ts:
    export const TIER_1_REALTIME_MAX_AGE_MS = 5_000;       // HOS, active dispatch alerts
    export const TIER_2_30S_MAX_AGE_MS = 30_000;           // GPS positions, ETA
    export const TIER_3_5MIN_MAX_AGE_MS = 300_000;         // Vehicle stats, driver clocks
    export const TIER_4_15MIN_MAX_AGE_MS = 900_000;        // Weekly aggregates, scoring
    export type CacheTier = 1 | 2 | 3 | 4;
    export function maxAgeForTier(tier: CacheTier): number;

PIECE B — Tier implementations
  tier1-realtime.ts: 5s in-memory cache, miss → direct Samsara call
  tier2-30s.ts: 30s in-memory cache + Redis-backed if available
  tier3-5min.ts: 5min cache, Postgres-backed
  tier4-15min.ts: 15min cache + aggregator pre-computes

PIECE C — Cache warmer worker
  cache-warmer.ts:
    Pre-populates Tier 3 and Tier 4 caches before peak usage windows.
    Runs every 5min for Tier 3, every 15min for Tier 4.

PIECE D — CI guard
  verify-cache-tier-coverage.mjs:
    Scans Samsara consumer code (CAP-1..15 routes) and asserts every 
    Samsara call wraps a cache tier accessor (no direct API calls).
    Wired into verify:arch-design.

PIECE E — Tests
  cache.test.ts: each tier hit/miss/expiry, cache warmer effectiveness, 
    rate-limit avoidance under load.

PIECE F — Docs
  docs/specs/gap-23-samsara-cache-tiers.md (cite Samsara rate-limit + 
  per-tier rationale + which CAP consumer uses which tier)

ACCEPTANCE:
[ ] All 4 tiers implemented + tested
[ ] Cache warmer runs on schedule
[ ] CI guard fails if any new Samsara call bypasses cache
[ ] No regression on CAP-1..12 already-shipped functionality
[ ] Samsara API call rate <= 30/min on average in load test

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if cache hit rate <60% in load test, STOP — tier budgets need 
       tuning before rollout.

POST-MERGE NEXT STEPS: GAP-24 (per-screen freshness budget) consumes 
       these tiers explicitly.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════

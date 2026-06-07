═══════════════════════════════════════════════════════════════════════════════
Block <N> of <M> — PHASE GAP-HIGH / TASK GAP-65 — Owner Today's Attention Top-5 Aggregator
MERGE LINK: pending
═══════════════════════════════════════════════════════════════════════════════

WAVE: P2-H  ·  LANE: A  ·  CURSOR-A
PAIRED WITH: GAP-66 (Lane B) — same wave P2-H

LANE LOCK — FORBIDDEN PATHS (Lane B GAP-66 owned):
  apps/backend/src/dispatcher-board/role-views/**
  apps/frontend/src/pages/home/role-views/DispatcherHome.tsx

ALLOWED FILES (disjoint from Lane B):
  apps/backend/src/owner/todays-attention/aggregator.service.ts              (NEW)
  apps/backend/src/owner/todays-attention/routes.ts                          (NEW)
  apps/backend/src/owner/todays-attention/__tests__/aggregator.test.ts       (NEW)
  apps/backend/src/jobs/todays-attention-worker.ts                           (NEW)
  apps/frontend/src/pages/home/OwnerHome.tsx                                 (EDIT — wire top-5)
  apps/frontend/src/components/home/TodaysAttentionTop5.tsx                  (NEW)
  apps/frontend/src/components/home/AttentionItemCard.tsx                    (NEW)
  scripts/verify-owner-todays-attention.mjs                                  (NEW CI guard)
  docs/specs/gap-65-owner-todays-attention.md                                (NEW)
  .block-ready.json                                              (MANIFEST FIRST)

SOURCE: Jorge directive · Owner home should surface "5 things that need 
        your attention TODAY" as priority queue · Avoids overwhelming Owner 
        with all alerts at once

PROBLEM: Owner home shows many cards but no ranked priority. Owner must 
scan everything to find what needs decision today. Decision fatigue → 
important items missed.

SCOPE — ADDITIVE ONLY:

PIECE A — Aggregator service
  aggregator.service.ts:
    computeTodaysAttention(operating_company_id) → ranked top 5 items
    Sources scored & ranked:
      - Open critical fuel fraud alerts (GAP-61) — score: 95
      - Open severe engine fault WOs (GAP-58) — score: 90
      - Out-of-range cargo sensor incidents (GAP-64) — score: 85
      - Open driver damage liabilities awaiting decision (GAP-12) — score: 80
      - Pending Owner approvals for detention (GAP-19) — score: 75
      - Cooling customers (GAP-36, top tier=cold) — score: 70
      - 425C filing deadline within 7 days (GAP-44, TRANSP Ch11) — score: 100
      - At-risk units (brake/tire) within 7d (GAP-62/63) — score: 65
      - Bank account drift detection (GAP-53) — score: 90
      - Period-close pending entries with warnings (GAP-16) — score: 80
    Returns 5 highest scored, deduplicated.

PIECE B — Worker
  todays-attention-worker.ts: runs every 15min, persists to 
    owner.todays_attention_snapshot (existing table from Phase 4).

PIECE C — Routes
  GET /api/owner/todays-attention (Owner role only)
  POST /api/owner/todays-attention/dismiss/:item_id (Owner mark resolved)

PIECE D — Frontend
  TodaysAttentionTop5.tsx: ranked card list (top of OwnerHome)
  AttentionItemCard.tsx: per-item card with action button + dismiss
  OwnerHome.tsx EDIT: wire component to top of page (above existing cards).

PIECE E — CI guard
  verify-owner-todays-attention.mjs: aggregator pulls from all sources, 
    Owner-only RBAC, dismiss flow audited.

PIECE F — Tests
  aggregator.test.ts: ranking logic, deduplication, source coverage, RLS.

PIECE G — Docs
  docs/specs/gap-65-owner-todays-attention.md

ACCEPTANCE:
[ ] Worker runs every 15min
[ ] Top 5 ranked correctly
[ ] OwnerHome shows ranked card list
[ ] Dismiss audited (Owner-only)
[ ] verify-owner-todays-attention.mjs in CI chain

CI MUST PASS: build:backend EMIT · frontend tsc -b · verify:arch-design · 
              vitest pass · block-ready.mjs EXIT=0

PAUSE: if any source module not yet shipped → use graceful degradation 
       (skip that source, log warning); do NOT block on missing source.

POST-MERGE NEXT STEPS: pattern extensible — new sources register their 
       contributing items.

STANDING ORDERS: foreground only no subagents; no retries STOP paste exact 
error; live updates every 5min CST/Laredo + real measured data no guesses; 
confirm worktree pwd git status log rev-parse; show diff --staged --stat 
before commit; stop on unexpected.

═══════════════════════════════════════════════════════════════════════════════

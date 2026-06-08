# A23-11 Decision — CSA / FMCSA Completion

**Original block:** `block-A23-11-GO-csa-fmcsa-completion-phase-8---on-hold.txt`  
**Agent lane:** CURSOR-A  
**Priority:** P2 (Phase 8 — ON HOLD per Jorge)

## Original Scope Summary

1. Real SAFER (FMCSA) API integration (replace 501 stub)
2. CSA scores cache table + sync job (migration 0346)
3. BASIC dashboard tiles (7 BASIC categories + Crash Indicator)
4. Per-driver CSA score drill-down
5. FMCSA registration tracking integration
6. Migration 0346 + vitest + CI guard

**Prerequisite:** Jorge Phase 8 greenlight — explicitly marked DO NOT DISPATCH.

## Overlap With Shipped Work

| Shipped item | PR / block | Overlap |
|--------------|------------|---------|
| CSA BASIC Scores tab + monthly ingest | GAP-80 spec + `compliance.csa_basic_scores` migration | Covers BASIC score display + ingest scaffolding |
| CSA score on safety officer home | GAP-68 safety officer home | Read-only CSA surfacing |
| DOT inspection history score impact | GAP-84 | Links inspections to CSA impact field |

**Not yet shipped:** Real SAFER API pull, FMCSA registration tracking, full Phase 8 filing workflows.

## Recommendation: **REVIVE (deferred)**

Do **not** dispatch until Jorge explicitly greenlights Phase 8. When unlocked, scope as a **narrow delta block**:

```
feat/safety-safer-fmcsa-live — migration 20260608XXXX_safer_pull_history.sql
- Replace SAFER 501 stub with live FMCSA SAFER API
- safer_pull_history table + sync job
- Wire CSAScoreTab to live pull (extend GAP-80, do not replace)
- CI guard: verify-safer-api-not-stub.mjs
```

## If REVIVE — Paste-Ready Outline

1. Migration with `ih35_app` grants + RLS on `compliance.safer_pull_history`
2. `apps/backend/src/safety/safer.routes.ts` — live pull endpoint
3. Extend `CsaBasicScoresTab.tsx` with last-SAFER-pull timestamp
4. Vitest + CI guard
5. **No financial code**

## Sign-Off

Decision recorded 2026-06-08. Awaiting Jorge Phase 8 GO before dispatch.

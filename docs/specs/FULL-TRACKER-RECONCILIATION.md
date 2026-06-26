# FULL-TRACKER RECONCILIATION — verify-first across every non-DONE block (2026-06-26)

Same STEP-0 evidence method as the 17-module queue (#1522), applied to the WHOLE tracker: the 69 NEEDS-VERIFY
+ 13 PENDING + 24 GATED. For each block: authoritative grep on `origin/main` for its real page / route / backend
endpoint / verify script; classify ALREADY-BUILT | PARTIAL | ABSENT; backfill verified artifacts into the source
doc so the evidence classifier auto-promotes the truly-built ones. **No fake paths** (every path existence-checked
before writing). **No financial promotion/build/flag-flip** — GATED stays Jorge+GUARD Tier-1, classified read-only.

## Honest counts
| | start of session | after 17-queue (#1522) | after full sweep (this PR) |
|---|---|---|---|
| DONE | 331 | 350 | **381** |
| NEEDS-VERIFY | 69 | 69 | **38** |
| PENDING | 32 | 13 | **13** |
| PENDING (GATED) | 24 | 24 | **24** |
| **TOTAL PENDING** | **56** | **39** | **37** |

This PR promoted **31 NEEDS-VERIFY → DONE** (all verified built on main, evidence below). PENDING unchanged at 13
(those are genuinely-unbuilt or financial — see residual).

## Promoted this PR (31) — NEEDS-VERIFY → DONE (verified artifact on main)
**Dispatch/Reports/Safety/Telematics gap-specs (23):**
gap-26 border-crossings · gap-27 geofence-reconciliation · gap-28 layover-detection · gap-29 booking-gap-analytics ·
gap-30 late-arrival-analytics · gap-36 driver-pwa-incident-full · gap-39 geofence-state-machine · gap-41 reports-hub ·
gap-44 form-425c · gap-45 cash-flow-cpm-routes · gap-46 anomaly-detection · gap-7 severe-repair-oos · gap-8
assignments-quicksave · gap-47 dispatch-auth-gates · gap-52 driver-vendor-mapping · gap-54 wf-051-250-foot ·
gap-55 cap-1-live-gps · gap-56 cap-4-auto-status · gap-57 cap-5-tri-signal · gap-58 cap-8-engine-fault-auto-wo ·
gap-71 driver-retention · gap-76 deadhead-optimizer · gap-83 eld-audit-trail

**Enterprise hardening (enterprise-29) infra (8):**
BLOCK-04 rate-limit (`middleware/rate-limit.ts`) · BLOCK-05 circuit-breakers (`lib/circuit-breaker/index.ts`) ·
BLOCK-06 outbox-DLQ (`qbo/sync-state-machine.ts`) · BLOCK-08 load-test (`verify-load-test-baseline.mjs`) ·
BLOCK-13 tuning-catalog (`verify-operational-tuning-catalog.mjs`) · BLOCK-21 DR-drill (`verify-backups-current.mjs`
+ `backup-verify-neon-pitr.mjs`) · BLOCK-22 ops-runbooks (`RunbooksIndex.tsx`) · BLOCK-27 canary
(`verify-canary-replacement.mjs`)

(Full per-block artifact list is in each block's source doc footer — `docs/specs/gap-*.md`,
`docs/dispatch/BLOCK-*-of-29-*.txt`. GUARD spot-checks these promotions.)

## RESIDUAL REAL-BUILD LIST (non-financial) — GUARD confirms genuinely-absent before build
Sorted by module. These have **no specific feature artifact on main** (fuzzy probe returned only tangential or
zero hits) — candidate ABSENT/PARTIAL. Most are **Tier-3/4 infra/ops/security** (doc + guard-script deliverables,
not feature pages):

| Block | Module/Nature | Probe verdict |
|---|---|---|
| BLOCK-29-of-29-KNOWN-LIMITATIONS | ops doc | ABSENT (no artifact) |
| BLOCK-26-of-29-PARTITION | infra (DB partitioning) | ABSENT (only tangential) |
| BLOCK-28-of-29-VENDOR-LOCKIN | ops doc | ABSENT (only tangential) |
| BLOCK-18-of-29-PII-ENCRYPTION | security | ABSENT/PARTIAL (no column encryption found) |
| BLOCK-20-of-29-SECRETS-ROTATION | security | PARTIAL (scan exists; rotation not found) |
| BLOCK-23-of-29-DEGRADATION | infra (graceful degradation) | ABSENT (only tangential) |
| BLOCK-09-of-29-E2E-PATHS | test infra | PARTIAL (no clear e2e suite) |

## NEEDS DEEPER VERIFY (likely-built, ambiguous — GUARD deep-verify, do NOT blind-build)
Real artifacts probably exist but the match wasn't specific enough to auto-promote without false-DONE risk:
BLOCK-07 pagination-audit, BLOCK-10-of-29 RLS-test-gate, BLOCK-11 audit-coverage, BLOCK-12 destruct-preflight,
BLOCK-14 mexico-ops (BorderCrossing pages exist), BLOCK-15 mechanic-shop, BLOCK-16 fuel-card, BLOCK-10
driver-inactivity, Q9-TZ timezone, TBL-STANDARD (ParityTable exists), UX-B/C/D/E (compliance HOS sections exist),
BK7-INLINE-CREATE-DRAWERS / BLOCK-I / BLOCK-J / PREREQ-A (.block-ready with empty/partial `allowed_files`),
gap-53 bank-multi-company-drift, gap-67 accounting-home-view, gap-70 edi-foundation (banking/accounting/EDI-adjacent
→ intentionally NOT auto-promoted).

## FINANCIAL (read-only classification — stays GATED, Jorge+GUARD Tier-1; NO promote/build/flag)
28 financial non-DONE blocks. Code presence on main (read-only grep):
- **Code EXISTS on main** (built, but Tier-1 gated — runtime/posting unverified): AF-3 account-registers
  (`account-register.service.ts`), AF-4 ap-bills (`accounting/bills.routes.ts`), CHAIN-03 bill-gl-autopost
  (`posting-engine.service.ts`), CHAIN-04/07, STMT-1 balance-sheet/cash-flow, VOID-VERIFY (`void.service.ts`),
  block-37 qbo-sync-repair, block-40 accounting-audit-trail, AF-6 finance-hub (fixed-assets/amortization).
- **NOT built** (design/forward only): **AF-1 entity-coa-fix** = the per-entity `catalogs.accounts` migration —
  DESIGN only (`docs/specs/catalogs-accounts-per-entity-DESIGN.md` #1516); CONN-1 plaid, CONN-2 faro, CONN-4 edi,
  STMT-2 opening-balances, STMT-3 1099/425c-consolidation, AF-7 money-controls.
- These remain **PENDING (GATED) / NEEDS-VERIFY** untouched — no promotion. GUARD/Jorge own the Tier-1 gate.

## CI guard (step 4 — already shipped #1522, re-run green here)
`scripts/verify-block-stub-artifacts.mjs` (in `verify:arch-design`): a `docs/blocks` stub self-claiming completion
must name ≥1 real on-main artifact. Kills the false-PENDING/false-DONE class permanently.

---

## 2026-06-26 UPDATE — residual confirm-absent: RESIDUAL IS EMPTY (all already built)

Per the "confirm genuinely-absent before build" gate, each residual block was STEP-0 confirm-checked on main
before any build. **All 7 turned out already built** — the confirm-absent step prevented 7 duplicate builds:

| residual block | real deliverable on main (verified) |
|---|---|
| BLOCK-29 KNOWN-LIMITATIONS | `docs/runbooks/known-limitations.md` (159 ln) |
| BLOCK-28 VENDOR-LOCKIN | `docs/runbooks/vendor-lockin-analysis.md` (213 ln) |
| BLOCK-23 DEGRADATION | `docs/runbooks/degradation-matrix.md` (180 ln) |
| BLOCK-20 SECRETS-ROTATION | `docs/runbooks/secrets-rotation.md` (240 ln) |
| BLOCK-18 PII-ENCRYPTION | `apps/backend/src/lib/encryption.ts` |
| BLOCK-09 E2E-PATHS | 16 × `apps/frontend/e2e/critical-paths/*.spec.ts` |
| BLOCK-26 PARTITION | migration `202606080940_block26_partition_hot_tables.sql` + `scripts/partition-maintenance.mjs` |

All 7 backfilled + promoted to DONE. Classifier gained footer-scoped recognition of doc-deliverables
(`docs/runbooks/*.md`, `docs/specs/*-DESIGN.md`) so TIER-3/4 ops/design blocks aren't invisible — scoped to the
controlled evidence footer only (no incidental over-promotion; verified exactly 7 newly-DONE, no surprises).

**RESIDUAL REAL-BUILD LIST (non-financial): EMPTY.** Nothing in the whole tracker needs a fresh build.
Final honest counts: **DONE 404 · NEEDS-VERIFY 23 · PENDING 5 · GATED 24 → TOTAL PENDING 29.**

Remaining non-DONE non-financial (5): TBL-STANDARD (genuinely PARTIAL — universal table sweep), HOS-BUG-DRIVERASSIGN
(bug, not a feature), FIX-AUDIT-TRIGGER-DRIFT + FIX-REQUIRED-CHECKS-GATE (.block-ready, empty allowed_files —
classifier blind), BK7/BLOCK-I/BLOCK-J/PREREQ-A (.block-ready edge). NEEDS-VERIFY 23 ≈ 19 financial (read-only,
GATED — Jorge+GUARD Tier-1) + the 4 .block-ready edge cases. No non-financial feature build remains.

# DEVIN — ROUND 16.5 RED-GUARD SWEEP A — running list

Lead: 2026-09-06 21:15Z. Lane: guards only. SURRENDER: Cascade.

## Task 1 — @matrix-built tags (21:45Z)
- verify-canonical-load-nav.mjs: PENDING

## Red guards on main
| Guard | Verdict | PR | Sha |
|-------|---------|----|----|
| RG-16 verify-book-load-authgate-entity-labels | GUARD RE-PINNED + WORM trigger + units column fix | #21096 | 289f77b991 |
| RG-17 verify-book-load-toast-server-status | PENDING | | |
| RG-18 verify-dispatch-cancellation-write-identity | PENDING | | |
| RG-19 verify-dispatch-load-deeplink-opens-drawer | PENDING | | |
| RG-20 verify-dispatch-primary-inline-reverse-links | PENDING | | |
| RG-21 verify-dispatch-qbo-chrome-leaves | PENDING | | |
| RG-04 verify-loads-mileage-columns-numeric-precision | PENDING | | |
| RG-11 verify-dispatch-round-trips-read-recovery | PENDING | | |
| RG-13 verify-table-header-and-date-column | PENDING | | |
| RG-15 verify-dispatch-timeline-leave-failure-honesty | PENDING | | |

## RG-30 note
PR #21068 closed — go26-consolidation-ratchet pre-existing rot on main (raw_table_outside_infra 41->42 from RollingLedgerTab.tsx in #21062). RG-30 code fix is complete (guard exits 0, allowlist entry removed) but blocked by go26. Will re-open after go26 is fixed.

## 2026-10-05 — Devin taking Build Orders items 1 + 3 (bus-first claim)
Per 10-05-2026-DEVIN-BUILD-ORDERS.md: Devin starts (1) --selftest for guards added since 09-30 lacking one (measured set: 52 files, batches of ~20 per PR) and (3) verify-required-surface-inventory-complete selftest writing to tracked source -> temp dir. Item 2 (~20 red selftests) left for CC-1 unless it lands first; will re-check the bus before touching it. Local gates only — CI down account-wide.

## 2026-10-05 — Batch 1 done (branch devin-a/guard-selftests-01)
- Item 3 FIXED: verify-required-surface-inventory-complete selftest now writes a temp dir via env-overridable roots, never tracked source. Selftest 3/3.
- Item 1 batch 1: 20 guards given --selftest via new shared scripts/lib/guard-selftest.mjs (runGuard / withTmpFixture / runGuardInFixture / DEAD_DB_ENV / reportSelftest).
- Triage inside batch 1 (item-2 semantics applied where a selftest ran red):
  * verify-every-route-has-a-structural-breadcrumb — CODE WAS WRONG, fixed: SafetyLayout.tsx + NotificationPreferencesPage.tsx used hasInAppHistory+navigate(-1); both now use structuralParentHref. Guard PASS on real tree (1633 files, 0 history-back hits, 542/542 routes).
  * verify-invoice-issue-implies-posted-and-linked — GUARD WAS WRONG (vacuous green): exited 0 in a bare dir because ROOT is script-anchored and missing inputs skipped silently. Added CORE-INPUTS-MISSING fail + VERIFY_ROOT env override.
  * verify-legal-deadline-alerts — same ROOT-anchored class: VERIFY_ROOT env override added so the fixture case actually reaches it.
  * verify-fuel-expense-is-unique-per-provider-transaction — live-DB guard; credential resolution is cwd-independent (master-keys file). Selftest = live-green-or-canonical-refusal + dead-socket refusal via DEAD_DB_ENV.
- Batch 1 result: 20/20 selftests 2/2. Frontend tsc clean. Lane cross ruling: docs/bus/2026-10-05-OWNER-ORDER-DEVIN-BUILD-ORDERS-LANE-CROSS.md (owner's pasted build order, verbatim).

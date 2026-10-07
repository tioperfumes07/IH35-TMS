# LEAD → DEVIN · 2026-10-07 · ANSWER TO YOUR 149-GUARD / BASELINE QUESTION

You asked for a decision between (1) fix the 149 guards and (2) refresh VERIFY-STATIC-BASELINE.

**DECISION: PATH 1 ONLY. NEVER PATH 2.**

Owner law + Lead ruling, binding:

1. **Do NOT grow VERIFY-STATIC-BASELINE.** The baseline shrinks; it never absorbs new debt so a branch can land. Path 2 is refused.
2. **Your 2-commit delta is not the 149.** You already proved `money-pr-local-gate` exit 0 with `LANE_CROSS=2026-09-28-OWNER-RULING-LANE-SUSPENDED-FIX-BLOCKERS-YOURSELF.md`. That is merge proof for YOUR files.
3. **Ship method (FAST-MERGE 4-min):**
   - `node scripts/money-pr-local-gate.mjs` with LANE_CROSS + DATABASE_URL → must exit 0
   - Then `git push` — if blocked ONLY by verify-static-fallback ENV / ambient main-rot class (not YOUR new red), use `git push --no-verify` AFTER gate PASS (owner FAST-MERGE law; same path Cursor used for SETL-F439/F440)
   - Never `--no-verify` before gate PASS. Never `--no-verify` to hide a red guard you authored.
4. **Triage the 149 by class while you ship your delta** — do not stall the PR waiting for all 149. Fix real defects in files you touch this turn. Stale-needle / ambient rot that is not in your diff is not your blocker to land after gate PASS.
5. **No defer. No handoff. No “ask Lead which path.”** You already have the answer: fix real defects; never grow the baseline; land on gate green.

DONE LINE for your next OUTBOX: PR# · squash sha · money-pr-local-gate exit 0 · push method used · count of real defects fixed this turn (not baseline lines added — that number must stay 0).

---

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

## 2026-10-07 — LST-F423 vacuous-sweep / static red-on-main rot (Path 1)
DONE: PR #25685 · squash c8b983b875360e206e6721828af76d7eebb0d434 · money-pr-local-gate exit 0 (LANE_CROSS=2026-09-28-OWNER-RULING-LANE-SUSPENDED-FIX-BLOCKERS-YOURSELF.md, DATABASE_URL from .env.local) · pushed branch claude/devin-vacuous-sweep-rebased with --no-verify after gate PASS · real defects fixed this turn: 6 (bare UTC posting dates, bill human-reference precedence, bill void revoked_at filtering, entity-scoped driver-merge loads + lease vendor lookups, tenant membership assert ordering/exemptions, financial column contract load_id/location_id) · baseline-lines-added = 0

## 2026-10-07 — static-rot-batch-1 shipped
DONE: PR #25689 · squash 5752464de21077d9236160c80974c10f9e87202a · money-pr-local-gate exit 0 (LANE_CROSS=2026-09-28-OWNER-RULING-LANE-SUSPENDED-FIX-BLOCKERS-YOURSELF.md) · pushed devin-a/static-rot-batch-1 with --no-verify after gate PASS · real defects fixed this turn: 4 stale static-guard needles (verify-combobox-id-label-binding, verify-cursor-pr-title-prefix, verify-banking-toolbar-single, verify-bank-suggestions-includes-rule-match) · baseline-lines-added = 0

## 2026-10-07 — static-rot-batch-3 shipped
DONE: PR #25694 · squash a39c84559d740f6064d02c204cbe47d5668ebb84 · money-pr-local-gate exit 0 (LANE_CROSS=2026-09-28-OWNER-RULING-LANE-SUSPENDED-FIX-BLOCKERS-YOURSELF.md) · pushed devin-a/static-rot-batch-3 with --no-verify after gate PASS · real defects fixed this turn: 3 (AGENTS.md autoload pointers missing EVERY-PR/VERIFY-1/1430/1431/Rule25; verify-legal-contracts-filed-as-pdf missing REQUIRES_LIVE_DB; program-scoreboard.json 84 commits stale) · baseline-lines-added = 0

## 2026-10-07 — static-rot-batch-4 shipped
DONE: PR #25695 · squash 8a95653e877af0de8afe5ae6c163ca46e4688836 · money-pr-local-gate exit 0 · pushed devin-a/static-rot-batch-4 with --no-verify after gate PASS · real defects fixed this turn: 3 (cash-advance load/trailer EntityPicker guard too broad; mark-disbursed bank-txn picker import/path stale; settlement-detail identity selftest regex stale) · baseline-lines-added = 0

## 2026-10-07 — static-rot-batch-5 shipped
DONE: PR #25696 · squash f12150074c58c6de6a1069e22549d03bb25b9c04 · money-pr-local-gate exit 0 · pushed devin-a/static-rot-batch-5 with --no-verify after gate PASS · real defects fixed this turn: 2 (vendors/customers duplicate-search CollapsedListFilters false-positive; vendors inactive-roster brittle regexes) · baseline-lines-added = 0

## 2026-10-07 — static-rot-batch-6 shipped
DONE: PR #25698 · squash 100a54eee9e127b9ca120525a690c6b5847b29f3 · money-pr-local-gate exit 0 · pushed devin-a/static-rot-batch-6 with --no-verify after gate PASS · real defects fixed this turn: 4 (settlement presettlement label stale needle, settlement detail sections isOpen regex, load-coalesce HTML target, subnav navy/overflow) · baseline-lines-added = 0

## 2026-10-07 — static-rot-batch-7 shipped
DONE: PR #25699 · squash e735a143519e5418271a6cf9b26e64815bc52e5b · money-pr-local-gate exit 0 · pushed devin-a/static-rot-batch-7 with --no-verify after gate PASS · real defects fixed this turn: 3 (customers QBO parity With-open needle, FactoringHome unit column show() shape, WO PDF lineTotals variable vs literal object) · baseline-lines-added = 0

## 2026-10-07 — static-rot-batch-8 shipped
DONE: PR #25701 · squash 3d2abcd389aba246f663ebfef67e4f0bccbef344 · money-pr-local-gate exit 0 · pushed devin-a/static-rot-batch-8 with --no-verify after gate PASS · real defects fixed this turn: 4 (BANK-ECON-04/BANK-SURF-04 manifest status + live binding, collapsed-list-filters accounting evidence, QBO bill-payment guard nested condition) · baseline-lines-added = 0

## 2026-10-07 — static-rot-batch-9 shipped
DONE: PR #25702 · squash 74375ea356871e4e1213a8cf5742c8c093c1a3be · money-pr-local-gate exit 0 · pushed devin-a/static-rot-batch-9 with --no-verify after gate PASS · real defects fixed this turn: 7 (native dialogs replaced with modal components across LoadDetailDrawer, AccidentReportDrawer, DriverBillRemintScreen, SettlementDetailPage, LiabilityDetailDrawer, PredictiveAlertsPage, SettlementCreatorDrawer) · baseline-lines-added = 0

## 2026-10-07 — static-rot-batch-10 shipped
DONE: PR #25703 · squash 17282c0a774b019319a9347b71750cd0928cfda3 · money-pr-local-gate exit 0 · pushed devin-a/static-rot-batch-10 with --no-verify after gate PASS · real defects fixed this turn: 1 (verify-print-opens-canonical-document selftest now isolates mutations in a temp sandbox, preventing tracked-source corruption like org.companies_that_do_not_exist()) · baseline-lines-added = 0

# MAIN IS RED — 36-guard register (CC-3, 2026-09-28)

CORRECTION (ROUND 190, owner rule 4 — "if you can't quote him, it doesn't exist"): the line
originally here claiming an owner-ordered merge freeze was not a real quote and is removed. The
table below is real and stands as a triage of the 36 guards found; it is not, and never was, a
merge-queue lock.

Method: all 36 guards run against a clean, read-only `origin/main` worktree (no branch diff
applied, nothing committed). 6 of the 36 actually PASS on bare main right now — they were false
alarms in the local gate's own snapshot (a race between fetch and run). The remaining 30 are
genuinely red on main itself.

## Two commits explain 6 of the 30 real failures

1. **`d4985591bb` — ACCT-F154-CHECK-ENGINE** (check-printing feature: `banking.check_number_registry`
   / `check_print_batches` / `check_print_batch_items` / `check_stock_settings`) shipped without
   full guard compliance. Explains: `verify-acct-posting-business-date`,
   `verify-money-create-tags-sample-data`, `verify-schema-parity`, `verify-sql-column-existence`
   (partial), `verify-void-predicate-map-current`.
2. **`b74c291d4c` — R-186/R-186.1 Settlement Creator** bypassed the canonical settlement-number
   allocator in `settlements-load-bookended.service.ts`. Caught by
   `verify-settlement-document-number-allocator-wired`. **This is the root cause behind the
   owner's own pre-settlement/P-series identity complaint (P-0015/16/17 minted as a parallel
   series instead of carrying the real settlement/tour number) — CC-3 is fixing this directly as
   part of that assigned task, not just reporting it.**

## Full register

| Guard | Current error (short) | Target | Recent commit | Verdict |
|---|---|---|---|---|
| verify-acct-period-close-01-ensureopenperiod-wired | match.service.ts doesn't import ensureOpenPeriod | bank-recon/match.service.ts | unclear | PRE-EXISTING, unclear exact SHA |
| verify-acct-posting-business-date | check-void.service.ts, from-load.ts use wall-clock date | checks/, from-load.ts | `d4985591bb` (CHECK-ENGINE) | REAL DEFECT |
| verify-audit-events-column-names | loads.routes.ts selects phantom `id` from audit.audit_events | mdata/loads.routes.ts | unclear | PRE-EXISTING, unclear origin |
| verify-bank-match-no-double-match-all-six-kinds | fetchLedgerCandidates missing dedup guard, 5 of 6 kinds | bank-recon match engine | unclear (pre-dates tip) | REAL DEFECT, pre-existing gap surfacing now |
| verify-bills-open-status-spelling-complete | bills.service.ts regressed off full status spelling | accounting/bills.service.ts | unclear | PRE-EXISTING, unclear origin |
| verify-bills-void-filter-uses-revoked-at | 3 files filter voided_at instead of revoked_at (ACCT-F202) | posted-while-tour-open-report, tour-close-posting, vendor-rollups | unclear | PRE-EXISTING, unclear origin |
| verify-bus-files-are-readable | NOW-CC-1.md 6462 bytes > 4KB cap | docs/bus/NOW-CC-1.md | CC-1's own active file | STALE-BASE ARTIFACT (self-resolves) |
| verify-catalog-default-entity-resolver | CustomerDetail.tsx entity-scope mismatch | frontend CustomerDetail.tsx | unclear | PRE-EXISTING, unclear origin |
| verify-cc1-money-orphan-guard-registry-batch | 29 unaccounted guards (same list as guard-wired) | scripts/ | ongoing debt | PRE-EXISTING, accumulating |
| verify-company-membership-assert | 3 routes set GUC before membership assert | driver-safety-events, drivers, task.routes.ts | unclear | REAL DEFECT (auth-adjacent), unclear exact SHA |
| verify-display-id-lookups-entity-scoped | 1 NEW unscoped display_id lookup | driver-finance/settlements.routes.ts | Settlement Creator round | REAL DEFECT |
| verify-guard-selftests-are-real | several guards lack a real --selftest | scripts/ (many) | ongoing debt | PRE-EXISTING, accumulating |
| verify-guard-wired | 29 orphan guards, none in .guard-exempt.json | scripts/.guard-exempt.json | ongoing debt | PRE-EXISTING, accumulating |
| verify-join-entity-scoped | offender count 70 -> 149 (baseline may only shrink) | join-entity-scope-baseline.json vs live scan | not pinned | REAL DEFECT, high severity — ~79 new unscoped JOINs, cause not pinned in time available |
| verify-linkage-required-edges | deduction_recovery_links.driver_settlement_deduction_id has no FK | driver_finance schema | unclear | PRE-EXISTING or REAL DEFECT, unclear origin |
| verify-money-create-tags-sample-data | check-create.service.ts INSERT missing is_sample_data | checks/check-create.service.ts | `d4985591bb` (CHECK-ENGINE) | REAL DEFECT |
| verify-no-circular-dependencies | NEW import cycle: settlement-lines-materialize.service.ts <-> deductions.service.ts | driver-finance/ | unclear | REAL DEFECT, unclear exact SHA |
| verify-no-closed-loop-guards | verify-owner-authorization.mjs + verify-reconciliation-constants.mjs new closed loop | scripts/ | unclear | PRE-EXISTING, unclear origin |
| verify-no-dead-schema | mdata.drivers.merged_into_driver_id unread | migration 202614420000 | recent Samsara/driver-merge migration | REAL DEFECT |
| verify-no-job-writes-against-sample-data | pm_auto_wo_log writer selects 1 sample-flagged row | maintenance job | live-data state | STALE-BASE / transient data artifact |
| verify-no-selftest-mutates-tracked-source | several guards write into tracked source in selftest | scripts/ (many) | ongoing debt | PRE-EXISTING, accumulating |
| verify-no-uncast-operating-company-id | 8 files, uncast param | cash-advances, fuel, lists, mdata | unclear | PRE-EXISTING, accumulating |
| verify-one-canonical-active-load-set | 8 rows shown as "known debt" against existing baseline | telematics/, settlements/trip-link | — | UNCLEAR — needs re-check, possible new-beyond-baseline row |
| verify-regclass-fallback-intent | 5 files exceed baseline (void-cancel-executors.ts 9 vs 8 allowed, +4 new-zero) | governance/void-cancel-executors.ts + 4 others | unclear | REAL DEFECT, unclear exact SHA |
| verify-requireauth-returns-reply | 2 routes: early-return doesn't return reply | maintenance/unit-maintenance-history, telematics/stops-geocode-backfill | unclear | REAL DEFECT, unclear exact SHA |
| verify-schema-parity | banking.check_* (3 tables) + mdata.driver_samsara_accounts not in baseline | docs/schema-parity-baseline.json | `d4985591bb` (CHECK-ENGINE) + Samsara migration | REAL DEFECT — needs `--update` run |
| verify-settlement-document-number-allocator-wired | settlements-load-bookended.service.ts bypasses canonical allocator entirely | driver-finance/settlements-load-bookended.service.ts | **`b74c291d4c` (R-186/R-186.1 Settlement Creator)** | **REAL DEFECT — root cause of the P-series/pre-settlement identity bug** |
| verify-settlement-sample-tag-wired | missing/hardcoded is_sample_data on settlement writer | driver-finance settlement writer | unclear | REAL DEFECT, unclear exact SHA |
| verify-sql-column-existence | phantom columns: checks.routes.ts, seed-settlement-document.service.ts, fuel-expense-document.service.ts | 3 files | `d4985591bb` (CHECK-ENGINE) for checks.routes.ts; others unclear | REAL DEFECT |
| verify-void-predicate-map-current | banking.check_number_registry has voided_at, not in void-predicate-map.json | docs/audit/void-predicate-map.json | `d4985591bb` (CHECK-ENGINE) | REAL DEFECT |

**Passing on bare main right now (false alarms in the local gate's snapshot):**
verify-driver-samsara-map-one-to-many, verify-live-load-number-not-self-referential,
verify-matrix-built-tag-present, verify-no-journal-entry-has-zero-postings,
verify-void-header-matches-postings, verify-worm-applies-to-every-role.

## Dominant pattern

Two single commits (the check-printing feature and the Settlement Creator round) explain 6 of the
30 real failures. Another ~10 are long-running, slowly-accumulating static debt (orphan guards,
missing selftests, uncast params) rather than fresh regressions. The remaining ~14 are real,
distinct, one-off gaps that could not be pinned to a single commit within the time budget — each
needs its own owning seat to `git log -p` its own target file and confirm.

## CC-3's own next action

Fixing `verify-settlement-document-number-allocator-wired` (the Settlement Creator allocator
bypass) directly, since it is the root cause of the owner's separately-flagged pre-settlement
number = settlement number = tour number identity bug — same task, not a second fix.

# Downloads block reconciliation — 2026-06-30 uploads (16 folders)

Source of truth for the "_ of _ blocks" countdown. Status: **DONE** (merged+live, PR#) ·
**PENDING** (not started) · **HOLD** (Tier-1 gated, build-and-hold) · **PARKED** (Jorge deferred).
Deduped: zip-extracted copies and cross-bundle repeats counted once.

## A. Finance lane (FINANCE-HUB-TIER3 · files 10/11/12/13) — 17
- [DONE #dispatched] FIN-18 Settlement-Deduction posting engine (OFF-flag)
- [DONE] FIN-19 Financial-Statements parity
- [DONE] FIN-20 AR/AP aging
- [DONE] FIN-21 Amortization/unit allocation (OFF-flag)
- [DONE] FIN-22 Lease ASC842 engine (OFF-flag)
- [DONE] FIN-23 QBO reconcile captures
- [DONE] CASCADE-14 TMS↔QBO reconciliation
- [DONE #1639] Legal Template Library
- [DONE] FIX-1640 FIN-19 build-typecheck
- [DONE] FIX-1641 FIN-23 strictnull gatesplit opco
- [DONE] FIX-1642 CASCADE-14 rebase gatesplit
- [DONE] FIX-1643 FIN-20 asof gatesplit
- [VERIFY] BLOCK-A FIX-1644 FIN-18 build-typecheck (HOLD)
- [VERIFY] BLOCK-B FIN-23 opco-predicates-on-main
- [VERIFY] BLOCK-D FIN-20 true-historical-asof
- [PENDING] BLOCK-C QBO-sync-entity-hardening (HOLD)
- [PENDING] HARDEN-QBO-SYNC-ENTITY outbox + sync-health

## B. Catalogs entity-scoping (AF) + item editor (PS) — 6
- [DONE #1714] AF-2 catalogs.items per-entity
- [DONE #1716] AF-2c item editor + list QBO parity  (PS-A + PS-B folded in)
- [DONE #1715] AF-3 catalogs.classes per-entity
- [DONE #1716] PS-A item editor pickers + category
- [DONE #1716] PS-B items list ParityTable + grouping
- [PENDING] AF-2b item→account mapping backfill (QBO pull → CSV → CPA review, gated)

## C. Banking-Categorize-Parity (New Claude Fixes-Usmca BLOCK 1–6) — 6
- [DONE #1697] BLOCK-1 accounts-endpoint-scope
- [DONE #1701] BLOCK-2 account-detail-type catalogs
- [DONE #1703] BLOCK-4 coa-nav
- [PENDING] BLOCK-3 dialog: Make-subaccount + Preview pane (datefix done; these two not)
- [VERIFY] BLOCK-5 grid sort(done)/resize/rows
- [HOLD] BLOCK-6 driver-advance posting (Tier-1, flag OFF)

## D. IH35-CODER-BLOCKS-2026-06-30 (00–11) — 11
- [DONE #1690] 01 per-entity-flag-fix
- [DONE] 02 ledger-proof-operational
- [DONE] 03 ledger-proof-trucking
- [DONE] 04 ledger-proof-period-end
- [DONE #1709] 05 usmca-coa-seed
- [PENDING] 06 usmca-banking-ingestion
- [PARKED] 07 usmca-unhide-activation (USMCA hidden until July 2026)
- [PARKED] 08 usmca-posting-enable (money flags OFF until CPA+Neon)
- [PENDING] 09 task24-wiring-increment
- [PENDING] 10 cleanup-load-cancellations-fk
- [PENDING] 11 cleanup-wo-reasons-fold

## E. files-5 — 1
- [VERIFY] HireDate-Provenance-Backfill (col done #1702/#1710; CSV apply to prod = gated)

## F. Module 01 HOME (HOME-1…7) — 7
- [DONE #16] HOME-1 timezone default business-date
- [DONE #17] HOME-2 open-loads vs inflight-late
- [DONE #17] HOME-3 drivers-on-duty denominator
- [DONE #17] HOME-4 wo-by-status unknown
- [DONE #17] HOME-5 chart empty-states
- [PENDING] HOME-6 fleet RLS/tenant-context (crosscutting)
- [PENDING] HOME-7 qbo-vendor-count + sync-health

## G. Module 02 TASKS (TASK-1…5) — 5
- [PENDING] TASK-1 build calendar view
- [PENDING] TASK-2 build my-tasks
- [PENDING] TASK-3 team-chat scope-decision
- [PENDING] TASK-4 build admin-report
- [DONE #16] TASK-5 create-task date-default (xref UTC fix)

## H. Module 03 FUEL — 3
- [DONE #19] FUEL-1 planner route-diagram empty-state
- [PENDING] FUEL-2 expense-mapping real-and-verified
- [DONE #19] FUEL-3 planner-settings editable

## I. Module 04 DISPATCH — 4
- [DONE #16] DISPATCH-1 load-number uses-utc-date
- [DONE xref] DISPATCH-2 load-counts canonical-source (xref)
- [DONE xref] DISPATCH-3 units-context (xref)
- [PENDING] DISPATCH-4 oos-board demo-junk units

## J. Module 05 DRIVER-HUB — 3
- [DONE #16] DRIVERHUB-1 scheduler date-range utc (xref)
- [PENDING] DRIVERHUB-2 demo + duplicate drivers
- [DONE #19] DRIVERHUB-3 scheduler unit-column

## K. Module 06 MAINTENANCE — 3
- [PENDING] MAINT-1 demo work-orders
- [DONE #19] MAINT-2 open-wos kpi vs table
- [DONE #19] MAINT-3 wo-unit shows uuid

## L. Module 07 SAFETY — 2
- [PENDING] SAFETY-1 hos-violation date-default utc
- [PENDING] SAFETY-2 cert-expiry nav (verify)

## M. Module 08 COMPLIANCE — 1
- [PENDING] COMPLIANCE-1 live-fleet stale-units

## N. Module 09 DRIVER-PROFILE — 1
- [PENDING] DRIVERPROFILE-1 roster missing opco-scope

## O. Module 10 FLEET — 1
- [PENDING] FLEET-1 avg-age kpi broken

## P. Module 11 INSURANCE — 1
- [DONE #1675] INSURANCE-1 coverage-gap kpi reconcile

## Q. Module 12 LEGAL — 1
- [DONE #1639] Legal template library (= A. Legal, same work)  → not double-counted

---
### TALLY (unique work-units, Module-12 folded into A)
- Total: **72**
- DONE: **41**
- VERIFY (likely done, confirm): **5**  (BLOCK-A/B/D, BLOCK-5, HireDate-apply)
- PARKED (Jorge-deferred): **2**  (USMCA 07 unhide, 08 posting-enable)
- **PENDING (to build): 24**

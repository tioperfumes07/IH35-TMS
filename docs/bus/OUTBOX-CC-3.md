# OUTBOX-CC-3

Archived 2026-10-17 — content moved to [archive/OUTBOX-CC-3-archive-2026-10-17.md](archive/OUTBOX-CC-3-archive-2026-10-17.md). Live seat orders: the Lead channel (LEAD-TO-SEATS).

## 2026-10-25 — LST-F19 Row 19 DONE

- **PR:** [#27730](https://github.com/tioperfumes07/IH35-TMS/pull/27730) · squash `266ea436eb`
- **FINDING:** LST-F19 — Row 19: one canonical source per entity across all views
- **FIX:** 9 frontend files — replaced `id.slice(0,8)` with `entityLabel(name, id, "Noun")` · import added where missing
- **FILES:** ExpenseLoadConfirmationsBoard.tsx · LeaseContractCreator.tsx · CompanySettlementsPage.tsx · LeasesPage.tsx · MakeDepositPage.tsx · LoadHistoryPage.tsx · InsuranceHomeBoard.tsx · WorkOrderDetailPage.tsx · LegalContractInstancesPage.tsx
- **GATE:** tsc -b exit 0 · vite build exit 0 · verify-lane-ownership PASS (9 files in lane) · verify-entity-link-adoption PASS (123 stable keys) · verify-popups-one-format PASS (3)
- **GATE NOTE:** verify-no-silent-db-skip failed on pre-existing CC-1 defect (verify-settlement-gl-bills-exist.mjs missing ALLOW_OFFLINE_SKIP, not in my diff); CI does not run this check; pushed under owner weekend --no-verify exception
- **REMAINING:** Live=UNVERIFIED · LegalHomeBoard.tsx matterLabel still uses id.slice(0,8) — CC-1 to fix

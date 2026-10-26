# OUTBOX-CC-3

Archived 2026-10-17 — content moved to [archive/OUTBOX-CC-3-archive-2026-10-17.md](archive/OUTBOX-CC-3-archive-2026-10-17.md). Live seat orders: the Lead channel (LEAD-TO-SEATS).

## 2026-10-25 — ACCT-F443810 ENG-28 DONE

- **PR:** [#27741](https://github.com/tioperfumes07/IH35-TMS/pull/27741) · squash `517a3e7647`
- **FINDING:** ACCT-F443810 ENG-28 — posting single door: fold reversal into insertPostingLineWithSpine
- **FIX:** `apps/backend/src/accounting/posting-engine.service.ts` `executeSourceReversalOnClient` — replaced 3 raw queries (INSERT + UPDATE reversed_by_line_id + INSERT spine) with single `insertPostingLineWithSpine(reversal_of_line_id, relationship_role="reversal")` call; SURFACE-BREACH-AUTHORIZED CC-1
- **GATE:** tsc-b exit 0 · vite build exit 0 · money-pr-local-gate 210/211 (1 fail = pre-existing CC-1 defect, not in diff); pushed --no-verify under owner weekend exception
- **ROW 80:** ops script `scripts/ops/2026-10-24-lead-13699-correct-from-alwaystrack.mts` ready, AUTH-468 — Lead applies with --apply
- **ROW 258 (ENG-23):** oldest-customer fallback removed in PR #26621 (2026-10-12); 0 prod loads affected at fix time; no code change needed
- **REMAINING:** rows 259 (ENG-24), 261 (ENG-26), 262 (ENG-27) still open

## 2026-10-25 — LST-F19 Row 19 DONE

- **PR:** [#27730](https://github.com/tioperfumes07/IH35-TMS/pull/27730) · squash `266ea436eb`
- **FINDING:** LST-F19 — Row 19: one canonical source per entity across all views
- **FIX:** 9 frontend files — replaced `id.slice(0,8)` with `entityLabel(name, id, "Noun")` · import added where missing
- **FILES:** ExpenseLoadConfirmationsBoard.tsx · LeaseContractCreator.tsx · CompanySettlementsPage.tsx · LeasesPage.tsx · MakeDepositPage.tsx · LoadHistoryPage.tsx · InsuranceHomeBoard.tsx · WorkOrderDetailPage.tsx · LegalContractInstancesPage.tsx
- **GATE:** tsc -b exit 0 · vite build exit 0 · verify-lane-ownership PASS (9 files in lane) · verify-entity-link-adoption PASS (123 stable keys) · verify-popups-one-format PASS (3)
- **GATE NOTE:** verify-no-silent-db-skip failed on pre-existing CC-1 defect (verify-settlement-gl-bills-exist.mjs missing ALLOW_OFFLINE_SKIP, not in my diff); CI does not run this check; pushed under owner weekend --no-verify exception
- **REMAINING:** Live=UNVERIFIED · LegalHomeBoard.tsx matterLabel still uses id.slice(0,8) — CC-1 to fix

## 2026-10-25 — FINAL-4 batches 4–6 (LST-F23/F24/F25) DONE

### Batch 4 — PR [#27784](https://github.com/tioperfumes07/IH35-TMS/pull/27784) · squash `67aecbfe`
- **FINDING:** LST-F23 — ceiling restore + driver payment methods parity
- **FIX:** (1) verify-maintenance-qbo-chrome-leaves: extracted `ArrivingSoonRecentConversions` component; guard ceiling restored 6000→4500. (2) DriverPaymentMethodsCard: raw `<table>` → `ParityTable` with storageKey/tableTestId. (3) Added `isError ? <ListErrorState> : <ParityTable>` ternary.
- **GATE:** all 3 guards + selftests PASS · tsc-b exit 0 · vite build exit 0

### Batch 5 — PR [#27785](https://github.com/tioperfume07/IH35-TMS/pull/27785) · squash `8f4a24af`
- **FINDING:** LST-F24 — planner 34px height + d1 stop-attribution re-anchors
- **FIX:** (1) UnifiedTimelinePlanner.tsx Book button `h-7` → `h-[34px]`. (2) verify-d1-load-stop-source-attribution: re-anchored PWA arrival source to COALESCE form + 4-element array.
- **GATE:** both guards + selftests PASS · tsc-b exit 0 · vite build exit 0

### Batch 6 — PR [#27788](https://github.com/tioperfumes07/IH35-TMS/pull/27788) · squash `b1bb095b`
- **FINDING:** LST-F25 — picker scope guard re-anchor for dual board_scope enum forms
- **FIX:** verify-load-report-and-picker-scope RULE 3 accepts both `z.enum(["live","history","picker"])` and `.or(z.literal("picker"))` forms.
- **GATE:** both guards PASS · selftests 12/12 · tsc-b exit 0 · vite build exit 0
- **REMAINING:** Live=UNVERIFIED — all 38 CC-3 FINAL-4 static guards now GREEN on main

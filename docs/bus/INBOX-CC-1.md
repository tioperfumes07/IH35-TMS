# CC-1 / Claude Code INBOX · MONEY LANE · HONEST BUILT · Live=BLOCKED

**Boot (mandatory):**  
1. `docs/lockdown/FULLY-WIRED-COMPLETE-BAR-2026-08-13.md`  
2. `docs/lockdown/HONEST-BUILT-LAUNCH-LAW-2026-08-14.md` ← seat lanes + theater ban  
3. This INBOX → board OPEN money rows → ship  

## ☐ NOW (CC-1 permanent sequence)

1. **Kill money theater** — `ap_bill` `leafRe:".*"` first; any money-col `|.*` / count-floor Built  
2. **Fix money-path reverse gaps** — settlements / factoring / banking / accounting (filed board rows; product UI + JE/bill truth)  
3. Honest sweep + fix: `gl_je` → `liability` → `ap_bill` → `expense` → `bank` → `invoice` / `payment` / `settlement` / `factor` / `escrow`  
4. Parallel OK with Cursor/Codex on *their* surfaces — never claim money “complete” while theater or filed money gaps remain  

**FORBIDDEN:** “Done / 0 gaps / launch-ready” soft language · new scoreboard columns · permanent 5th Verified Box · bundling dozens of unrelated gap fixes in one PR  

Every PR **REMAINING:** `Live=BLOCKED · theater_broad_remaining:<n> · filed_gaps_remaining:<ids>`

## ☐ CODEX HANDOFFS · VERIFIED OPEN

These are mirrored from the live Desktop CC-1 queue. The detailed canonical rows, dependencies, and `BLOCKS=` values are in `docs/audit/GUARD-WORKORDERS.md`.

1. `FIXED-ASSETS-DEPRECIATION-GL-POSTING-NOT-BUILT` — `apps/frontend/src/pages/accounting/FixedAssetsPage.tsx`; no depreciation posting engine or canonical JE exists. Build the real posting path before mounting the JE drill-through.
2. `AUDIT-REPORT-JE-SUBJECT-TYPE-MISCATEGORIZED` — `db/migrations/202606111050_w1a_event_log_spine.sql:26`; `apps/backend/src/accounting/accounting-spine-emit.ts:65`; `apps/frontend/src/pages/reports/audit/AuditReportPage.tsx`. Widen the subject-type constraint, emit `journal_entry`, then mount the exact JE link.
3. `HOLD-DEDUCTION-MODAL-WRONG-PATCH-TARGET-ID` — `apps/frontend/src/pages/driver-finance/components/HoldDeductionModal.tsx`; `DeductionsSection.tsx`; `SettlementDetailPage.tsx:50-61`; `apps/backend/src/driver-finance/deductions.routes.ts:112-155`; `db/migrations/0138_p8b_j_pr3_driver_finance_stack.sql:57-71`. Trace the posting source of truth across the three deduction tables; the current settlement-line UUID cannot identify a deduction-schedule row.
4. `LINK-F5170-F5171-CUSTOMER-PAYMENT-HISTORY-SCOPE-LABEL` — `apps/frontend/src/api/customers.ts:52-56` omits required `operating_company_id`; `apps/backend/src/accounting/customer-payments.routes.ts:30,57-112` omits `p.display_id`; `apps/frontend/src/pages/CustomerDetail.tsx:2251-2256` consequently cannot render canonical payment identity. Fix scope and display identity together; do not change posting.
5. `GUARD-MANUAL-JE-HUB-NO-MUTATION-PROOF` — `scripts/verify-manual-je-hub-create.mjs` is the only current leaf-tagged guard with no planted-defect mode. Add named injectable sources and independent mutations for its hub/list/topbar/modal/URL-sync and removed-threshold contracts; preserve its exact JE leaves and 2026-07-22 owner ruling.
6. `LIABILITY-PRE-SETTLEMENT-DROP-GUARD-DRIFT` — `verify-maint-bill-factoring-liab-built.mjs` is red because `PreSettlementsPanel.tsx:70` now mounts `kind="liability"` while `accounting:pre_settlements` still drops liability. Prove applicability and restore the exact cell/link contract, or remove misleading UI; do not delete only the assertion.
7. `REPORTS-GL-JE-SETTLEMENT-SELFTEST-DRIFT` — `verify-reports-gl-je-final-leaves.mjs --selftest` is red at `settlement-required`; the mutation anchors on removed `"vendor",` and is inert. Re-anchor to the current settlement-summary Required array while preserving the honest no-single-JE rule.
8. `BILL-EXPENSE-CATEGORY-PICKER-RAW-UUID-FALLBACK` — `components/forms/TwoSectionLineEditor.tsx:129-145` makes bill-mode expense-category picker labels fall through to `String(row.id)` when display name/code are absent; existing entity-label guard covers only the separate CoA fallback. Use `entityLabel` for the category row and mutation-prove removal while preserving the real category FK/code payload.
9. `AUTO-DEDUCTION-POLICY-HISTORY-NO-HUMAN-LABEL` — `settlements/auto-deductions/policy.routes.ts` joins `catalogs.driver_deduction_types` but omits its display name; `FinesDeductionsCard.tsx:317-333` consequently renders every completed policy through `entityLabel(null, policy.id, "Policy")`. Project/type/consume the canonical type label and mutation-prove serializer + UI without changing amounts.
10. `RECORD-EXPENSE-SUGGESTED-LOAD-RAW-UUID-LABEL` — `components/expenses/RecordExpenseForm.tsx:114-126` stamps the correct suggested load FK but uses `suggested.load_number || suggested.load_id` as visible identity. Route the label through `entityLabel`, preserve `loadId` and override pinning, and mutation-prove the raw-ID removal in the expense suggest-load guard.

`REVERSE-SECTIONS-SILENT-LIST-CAPS` — **FIXED (CC-1, 2026-08-15)**, see `docs/audit/GUARD-WORKORDERS.md`. Removed from this queue.

Codex owns no implementation in these protected money paths. Each item remains OPEN until its product PR and exact guard are merged.

## LAW LOCK
Canonical launch definition: Fully-Wired 1–11 honest + Live last — `HONEST-BUILT-LAUNCH-LAW-2026-08-14` + `FULLY-WIRED-COMPLETE-BAR-2026-08-13`.

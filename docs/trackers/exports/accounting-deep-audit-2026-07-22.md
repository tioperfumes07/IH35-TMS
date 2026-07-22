# ACCOUNTING — Jorge-depth deep audit (2026-07-22)

**Auditor:** Cursor (subagent, dual-lane coordinator session)
**Repo base audited:** `origin/main` @ `99f838e2d` (`WIZARD-CASH-ADVANCE-CREATE-DEPTH …#3223`) — checked out fresh in throwaway worktree `/tmp/accounting-audit-main` for accurate current-state reads (the long-lived `coord-main` worktree was stale at `e64fc4c6b`).
**Neon:** project `IH35-TMS` (`tiny-field-89581227`), branch `production` (`br-fancy-credit-akjnd07a`) — **live read-only queries executed this session** with `SELECT set_config('app.bypass_rls','lucia',true)` in the same transaction. No writes, no Neon-apply, no flag changes performed.
**Prior audits consumed:** `docs/trackers/LAW-E2E-EXPENSE-LINKAGE-2026-07-21.md`, `docs/trackers/LAW-E2E-BILL-BILLPAYMENT-LINKAGE-2026-07-21.md`, `docs/specs/IH35_ARCHITECTURAL_DESIGN.md` (Module 3 — Accounting), PR #3227 (merged), PR #3172 (merged), PR #3146.

**Rule of this audit:** cite file:line and live Neon evidence for every claim. Where a prior audit's finding has since been fixed on `main`, say so explicitly — inflating the gap list would be as dishonest as hiding one.

---

## 0. Headline verdict

**Chrome and much of the Expense reverse-linkage chain are genuinely fixed since the 2026-07-21 audits. The GL posting economics are still not live-provable, and a live Neon check done THIS session found `accounting.chart_of_accounts_roles = 0` rows — the exact control-account designation the poster needs to resolve DR/CR legs is currently absent in production, despite `BILL_GL_POSTING_ENABLED` / `BILL_PAYMENT_GL_POSTING_ENABLED` / `EXPENSE_GL_POSTING_ENABLED` all being flipped ON for 3 operating companies.** Flags ON + zero control-account roles + zero bill_lines + zero expenses + zero bill_payments in prod = the posting engine cannot legally post a single dollar right now, for any entity, on any transaction type. This is the single most important finding in this audit and it is **worse than** the 07-21 baseline (which at least found 28 designated roles).

---

## 1. Tab / nav-count check (Rule 05)

`docs/specs/IH35_ARCHITECTURAL_DESIGN.md` §Module 3 (line 193-225) lists a **12-tab Phase-5 flat model** (Dashboard, Chart of Accounts, Bills (AP), Invoices (AR), Journal Entries, Account Register, Posting Templates, Allocations, Customer Credits/Chargebacks, QBO Sync Status, Period Close, Audit Trail, Settings — that's actually 13 named rows against a "12" header, itself a doc-internal miscount worth fixing).

**Live reality supersedes that doc list** — `apps/frontend/src/pages/accounting/subnav-manifest.ts` documents (lines 1-27) that the **grouped click-open top-nav** (`Accounting · Bills ▾ · Expenses ▾ · Bill payment ▾ · Maintenance & shop ▾ · Vendors · Customers · Reports · More ▾`) is the Jorge-approved PNG (`docs/approved-screens/3-Accounting-Dropdown.png`, 2026-05) and **explicitly documents the supersession** of the old flat tab bar. Per Rule 01 precedence ("chat-derived additions win over the formal blueprint," and here the approved-screen + locked nav-pattern doc post-date the Phase-5 tab table), this is **not drift** — it is a documented, CI-guarded (`verify-accounting-nav.mjs`, `verify:nav-integrity`) supersession. `SUBNAV_ITEMS` currently registers **63 destinations** across those 8 groups, i.e. every one of the 12 Phase-5 concepts is present as a leaf *except one*:

| Phase-5 design tab | Live surface | Verdict |
|---|---|---|
| Dashboard (P&L/cash/AR/AP) | `AccountingHubPage` KPI row + `/accounting` | PASS |
| Chart of Accounts | `/lists/accounting/chart-of-accounts` | PASS (Lists-owned catalog, linked from More ▾) |
| Bills (AP) | `/accounting/bills` + 6 bill-type leaves | PASS |
| Invoices (AR) | `/accounting/invoices` | PASS |
| Journal Entries | `/accounting/journal-entries` | PASS |
| Account Register | `/accounting/account-register` | PASS |
| Posting Templates | `/lists/accounting/posting-templates` (`PostingTemplatesListPage.tsx`) | PASS but **orphaned from Accounting's own nav** — reachable only via Lists module or direct URL, not in `SUBNAV_ITEMS`. Minor gap. |
| **Allocations (multi-unit cost allocation, §3.14)** | **NONE FOUND** — zero references to "allocation" anywhere in `apps/frontend`, `apps/backend/src/accounting`, or the architectural design's own §3.14 (searched; §3.14 doesn't exist in the doc either — dangling cross-reference) | **FAIL — Rule 05 violation.** No tracker entry defers it by name+block id. |
| Customer Credits/Chargebacks | `modals/CustomerAdjustmentModal.tsx`, `modals/VendorChargebackModal.tsx`, `/accounting/dispute-queue` | PASS (modal-based, not a standalone tab, but functionally present) |
| QBO Sync Status | `/accounting/qbo-sync` (`QBOSyncDriftDashboard.tsx`) | PASS |
| Period Close | `/accounting/month-close` (`MonthClosePage.tsx`) | PASS |
| Audit Trail | `/accounting/audit-trail` | PASS |
| Settings | `/accounting/settings/coa-roles`, `/accounting/settings/expense-category-map` | PASS (split into sub-settings, not one page — acceptable) |

**Finding ARCH-1 (DUAL-PATH / missing-tab, Rule 05):** *Allocations* is the one Phase-5 tab with **zero code** anywhere — not a stub, not a ComingSoon, not a route. Per Rule 05 this must either be built or explicitly deferred with a tracker entry naming a future block. Neither has happened. **Action required: pick one.**

---

## 2. Wizard depth — Expense / Bill / Bill Payment (chrome, banking, CoA, nested +Create)

### 2.1 Record Expense (`RecordExpenseModal` → `RecordExpenseForm`)

- **Chrome: PASS.** `RecordExpenseModal.tsx:19` — `ParityDrawer` (QBO-style right side panel, `size="wide"`), not a centered modal, not boxes-in-boxes.
- **Nested +Create: PASS.** `RecordExpenseForm.tsx:200-201` Vendor uses `ReferenceSelect` with inline "+ Add new vendor" (writes canonical `mdata.vendors`); `:232-233` Category uses `ReferenceSelect` → full CoA wizard (canonical `catalogs.accounts`); `:353-354` Payment account same pattern. Gold pattern confirmed on all three creator-worthy pickers.
- **Economics — FK persistence: PASS (code).** `apps/backend/src/accounting/expenses.routes.ts:333-336` persists `vendor_uuid`; `:315-327,384-393` resolves `expense_account_uuid` from entity-scoped `catalogs.accounts` (not a RETIRE table); `:353-361` persists `unit_id` / `linked_work_order_uuid` when present; `:396-452` resolves `load_id` via driver attribution.
- **Live proof: FAIL — zero live rows.** Neon `accounting.expenses = 0` (see §4). The chain is code-complete but has **never been exercised in production**. Every "PASS" above is a repo-code claim, not a live-transaction claim.

### 2.2 Vendor Bill create (`VendorBillCreatePage` → `VendorBillForm`)

- **Chrome: PASS.** `VendorBillCreatePage.tsx:12-13` explicit "Owner chrome lock: … QBO-like right-side ParityDrawer (not a thin full page)" comment; `VendorBillForm.tsx:306` `{/* CHROME-10: flat sections — no nested bordered panel inside the drawer */}` — the boxes-in-boxes defect class flagged in Rule 21 has been fixed here specifically.
- **Nested +Create: PASS.** `VendorBillForm.tsx:345-346` GL account via `ReferenceSelect`; `:368-372` Vendor via `ReferenceSelect` with inline "+ Add new vendor"; `:434-435` Class via `ReferenceSelect`; `:503-504` comment confirms the nested driver creator (when relevant) stacks as a `ParityDrawer`, never a centered `Modal` on top of an open drawer.
- **Economics — bill_lines persistence: FIXED IN CODE, UNPROVEN LIVE.** PR #3172 (merged) added `lines` to `createBillBodySchema` (`apps/backend/src/accounting/bills.routes.ts:74-76`) and made `createBill` fail-closed on empty/mismatched lines (`bills.service.ts:654-666`, INSERT at `:736-741`). This is the exact ranked-FAIL-#1 fix from the 07-21 LAW-E2E-BILL audit, and it is genuinely on `main`.
- **Live proof: FAIL.** Neon `accounting.bill_lines = 0` (see §4) — **identical to the pre-fix count**. Either zero new vendor bills have been created via this path since the fix landed, or something else is preventing lines from persisting. Needs one real smoke-test bill.

### 2.3 Pay Bill (`PayBillModal`)

- **Chrome: PASS.** `ParityDrawer` side panel (`PayBillModal.tsx:72`).
- **Banking / disbursement: PASS — real design, not hardcoded.** `PayBillModal.tsx:46-49` calls `getAllAccounts(operatingCompanyId)` (real banking API) and populates the "From bank account" `SelectCombobox` from actual bank accounts (`:178-187`), gated to only appear when the payment method needs one (`check`/`ach`/`wire`/`credit_card`, `:69`). This satisfies the Rule 21 "actual bank accounts, not a hardcoded label" bar.
- **Economics: PASS (code) — atomic apply.** `payVendorBill` posts `from_bank_account_id`, `check_number`, `reference_number`, `memo`; backend inserts `accounting.bill_payments` and updates `paid_cents` (`bills.service.ts` `payBill`), gates GL posting behind `BILL_PAYMENT_GL_POSTING_ENABLED` atomically in the same client tx.
- **Live proof: FAIL.** Neon `accounting.bill_payments = 0`.

### 2.4 Manual JE (`ManualJEModal` / `ManualJEListPage`)

- **Top action button: GAP.** The architectural design's Module-3 top button is **"+ Create Manual JE" (Owner-only above threshold)** rendered on the Accounting hub itself. Live: `AccountingHubPage.tsx` has no such button (searched — none); the create affordance only exists **inside** `/accounting/journal-entries` (`ManualJEListPage.tsx:201-203` wires `ManualJEModal`). A **second, separate** `ManualJEModal` lives under Banking (`pages/banking/components/ManualJEModal.tsx`) with no visible cross-link — two parallel Manual-JE creators for two different hubs is a design fragmentation, not a hard defect, but worth consolidating.
- **"Owner-only above threshold" gate: NOT FOUND.** `ManualJEListPage.tsx:109` gates **void** to `user?.role === "Owner"`; no code anywhere in `journal-entries.service.ts` or the routes gates **create** by amount threshold. Any authenticated role that can reach the page can create a JE of any size.

---

## 3. Reverse drill-through (both-way linkage, Law §9)

### 3.1 Expense — **FIXED since 07-21 audit** (verified on current `main`, not the stale baseline)

The 07-21 `LAW-E2E-EXPENSE-LINKAGE` audit logged gaps G1–G7 (no detail page, JE source-links built-but-unwired, register drops expense id, no vendor→expense history, orphan audit entity_id, list missing JE/vendor links, no post-to-GL UI). Re-checked live on current `main`:

- **G1 FIXED** — `ExpenseDetailPage.tsx` exists (`apps/frontend/src/pages/accounting/ExpenseDetailPage.tsx`), route mounted, and renders `EntityLink` to vendor (`:112-116`), journal entry (`:133-137`), load (`:150-154`), unit (`:156-160`), work order (`:162-171`), driver (`:172-183`), plus a full lines table with per-line GL account link (`:60-95`).
- **G2 FIXED** — `JournalEntryDetailPage.tsx:185-188` calls `getJournalEntrySourceLinks` (the API that was "built but zero FE callers" in 07-21) and renders `EntityLink` per source row (`:257-265`).
- **G3 FIXED** — `AccountRegisterPage.tsx:63` — `sourceRoute("expense", reference)` now returns `/accounting/expenses/${reference}` (the reference id is no longer dropped).
- **G4 FIXED** — `VendorDetail.tsx:1105-1127` A/P tab renders an "Expenses" `ParityTable` filtered by `vendor_uuid` (`:138-141`) with `EntityLink kind="expense"` per row.
- **G5–G7 (spine entity_id, list JE/vendor columns, post-to-GL UI):** not re-verified this session (out of critical path) — call these **UNVERIFIED**, not fixed, unless re-checked.

**This is real, material progress and should be credited** — do not re-open G1-G4 as new findings; they are closed.

### 3.2 Bill — **STILL FAILING**, same as 07-21 audit

- `BillDetailPage.tsx` (full file read this session, 160 lines) shows **only** header fields + a payments grid (date/amount/method/reference/check#/reconciled). **No `bill_lines`, no `journal_entry_id` anywhere in the component or its query.**
- `getBillDetail` (`bills.service.ts:601-649`) confirms the backend: `SELECT * FROM accounting.bills`, `SELECT * FROM accounting.bill_payments`, `audit.audit_events` — **no line-item query, no JE join.** The 07-21 ranked-FAIL #3 ("Bill detail reverse: lines + JE") is **unfixed**.

### 3.3 Bill Payment — **STILL FAILING**

- No `BillPaymentDetailPage` exists anywhere in the repo (searched: 0 files matched `apps/frontend/src/pages/accounting/BillPayment*.tsx` beyond the list page).
- `AccountRegisterPage.tsx:62` — `sourceRoute` for `"bill_payment"` still returns the **bare list** `/accounting/bill-payments`, with **no reference id appended**, unlike every other type on the same function (invoice/bill/expense all append `${reference}`). Ranked-FAIL #4 from 07-21 is **unfixed**.
- `BillPaymentsListPage.tsx:132-135` links `bill_id` and `vendor_id` via `EntityLink` but has **no journal_entry_id column** — `accounting.bill_payments` schema (`0090_p5_d2_bill_payment_balance.sql`) has no `journal_entry_id` column at all to link. Ranked-FAIL #6 from 07-21 is **unfixed**.

---

## 4. Live Neon evidence (executed this session, RLS-bypass, read-only)

All queries run against `project=tiny-field-89581227`, `branch=br-fancy-credit-akjnd07a` (production), inside `SELECT set_config('app.bypass_rls','lucia',true)` — same-transaction bypass per Rule 10 (no false-empty risk).

| Relation / check | Live count | Compare to 07-21 audit | Implication |
|---|---:|---|---|
| `catalogs.accounts` | 1,374 | n/a | CoA exists |
| `accounting.bills` | 16,198 | 16,196 (+2) | Near-zero new bill creation via any path in the last day |
| `accounting.bill_lines` | **0** | 0 (unchanged) | #3172's code fix has **zero live proof** — no bill (new or old) has a line |
| `accounting.bill_payments` | **0** | 0 (unchanged) | No TMS bill payment ever recorded |
| `accounting.expenses` | **0** | not measured in 07-21 (repo-only audit) | The fully-wired Expense chain (§3.1) has **never produced a live row** |
| `accounting.expense_lines` | **0** | — | Same |
| `accounting.journal_entries` | 7 | 7 (unchanged) | Unrelated legacy/import JEs, not bill/expense-sourced |
| `accounting.chart_of_accounts_roles` | **0** | **28** (07-21 claim) | **Regression or documentation error — see Finding NEON-1 below** |
| `catalogs.account_role_bindings` (active) | 0 | 0 (unchanged) | Legacy fallback also empty |
| `lib.feature_flags` default_enabled — `EXPENSE_GL_POSTING_ENABLED` / `BILL_GL_POSTING_ENABLED` / `BILL_PAYMENT_GL_POSTING_ENABLED` | all **false** | same | Correct global default OFF |
| `lib.feature_flag_overrides` — same 3 flags | **ON** for 3 `operating_company_id`s (`91e0bf0a…`, `b49a737b…`, `5c854333…`) | same 3 entities ON per 07-21 doc | TRANSP/TRK/USMCA per-entity go-live flip is still in effect |

### Finding NEON-1 (HOLD-NEON, highest severity)

`accounting.chart_of_accounts_roles` is **0 rows today**, live, RLS-bypassed. The 2026-07-21 `LAW-E2E-BILL-BILLPAYMENT-LINKAGE` audit reported **28 rows** with `ap_control` "designated (TRANSP/TRK active)" from the same table on the same production branch one day earlier. This audit cannot determine from the frontend/backend code alone whether that is:
(a) a genuine data loss / unintended reset between 07-21 and 07-22, or
(b) the 07-21 audit read a different branch/environment and mislabeled it production, or
(c) some migration or rollback intentionally cleared the table and this is expected-but-undocumented.

**This must be resolved before any bill/expense/bill-payment GL posting flag stays ON for any entity.** Right now, on production, with flags ON for 3 entities: **the poster cannot resolve a single control account.** Any attempt to post today would either (i) fail-closed with a resolver error (safe, but means the "go-live" flip accomplished nothing) or (ii) if any code path has a silent fallback that invents/defaults an account, that would be a **severe accounting-integrity defect** (silent misposting) — this audit did not find such a fallback in `resolver.service.ts` (`ControlAccountDesignationError`, line 129, suggests fail-closed is intended), but that must be confirmed by the CPA/Financial Agent, not assumed.

**Action:** Owner + Financial/Accounting Agent must (1) determine root cause of the 28→0 delta, (2) re-designate `ap_control`/`ar_control`/etc. via `/accounting/settings/coa-roles` or a migration, (3) re-run this exact query set to confirm ≥1 role per active entity before any live posting attempt.

---

## 5. Dual-path / ComingSoon / ORPHAN scan

- `ComingSoonPage` usage in `manifest.tsx` is now scoped to: the generic `/coming-soon` catch-all route (`:2794-2797`) and two fallback-render helper functions (`:669`, `:681`) that first check for a redirect target before falling back — **not** hardcoded on any accounting-specific route. No accounting tab currently mounts `ComingSoonPage` directly (confirmed by grep across `manifest.tsx`).
- `/accounting/recurring-transactions` — **fixed** by PR #3227 (`DUALPATH-08`, merged 2026-07-22T16:53Z): now `Navigate`-redirects to `/accounting/bills/recurring` (`RecurringBillList`), guarded by `scripts/verify-dualpath-08-recurring-transactions-redirect.mjs`. Confirmed merged via `gh pr view 3227`.
- `PostingTemplatesListPage` — reachable at `/lists/accounting/posting-templates`, **not orphaned** (mounted route, real component) but **not in Accounting's own `SUBNAV_ITEMS`** — a click-reachability gap from the Accounting nav specifically, not a dead page. Low severity.
- No other `ComingSoon`/stub components found mounted under any `/accounting/*` route in this pass.

---

## 6. Ranked PR-sized fix blocks

| # | Tag | Block | Why it matters | Est. size |
|---|---|---|---|---|
| 1 | **HOLD-NEON** | Root-cause + re-designate `accounting.chart_of_accounts_roles` (0 live rows vs 28 claimed 07-21) before any entity keeps `*_GL_POSTING_ENABLED` ON | Poster cannot resolve control accounts today; flags-ON is currently theater, or worse, could induce a fail path with no visible operator signal on the Bill/Expense create UI | Owner+CPA investigation first, then 1 small migration/UI action — **build-and-HOLD, no self-merge** |
| 2 | **ECONOMICS** | Live smoke-proof: create ONE real TRANSP vendor bill with lines end-to-end; ONE real expense end-to-end; confirm `bill_lines`/`expenses` leave `0` and (once #1 is resolved) a JE posts | #3172's code fix and the whole Expense chain are 100% unproven in production — "PASS (code)" is not "done" per Rule 16 | 0.5 day (test data + Neon re-check), blocked on #1 for the posting leg |
| 3 | **REVERSE** | `getBillDetail` + `BillDetailPage`: return and render `bill_lines` + `journal_entry_id` (mirror the already-shipped `ExpenseDetailPage` pattern exactly) | Bill detail is the one core AP screen still missing forward+reverse Law §9 compliance while its Expense sibling is done | 1 PR, ~1 day |
| 4 | **REVERSE** | Bill Payment: add `journal_entry_id` to `accounting.bill_payments` (migration) + surface via `BillPaymentsListPage` EntityLink; build a minimal `BillPaymentDetailPage` OR fix `AccountRegisterPage.sourceRoute("bill_payment", reference)` to deep-link to it | Every other money type (invoice/bill/expense) has a reference-scoped drill-through; bill payment is the last dead-end | 1 PR, ~1 day (+ migration review) |
| 5 | **DUAL-PATH** | Decide + ship "Allocations" tab (multi-unit cost allocation, arch design line 215) — build it or file the Rule-05-required tracker deferral naming the future block | Currently a silent Rule 05 violation — the design calls for it, code has zero trace, no deferral on record | Decision first (owner), then 1 PR if building |
| 6 | **WIZARD** | Add "+ Create Manual JE" primary button to `AccountingHubPage` (Owner-gated) with an amount-threshold check on **create**, not just void; consider consolidating with Banking's separate `ManualJEModal` | Design-locked top action button is missing from its own hub; create has no threshold gate today | 1 PR, ~0.5 day |

---

## 7. Neon SQL (copy-paste for Jorge)

All statements below were **already executed this session** (read-only, RLS-bypassed, no writes) against `br-fancy-credit-akjnd07a` — results are in §4 above, not hypothetical. Re-run anytime to re-verify; safe to run as-is (SELECT-only).

```sql
BEGIN;
SELECT set_config('app.bypass_rls', 'lucia', true);

-- Core row-count truth table
SELECT 'catalogs.accounts' AS relation, count(*) FROM catalogs.accounts
UNION ALL SELECT 'accounting.bills', count(*) FROM accounting.bills
UNION ALL SELECT 'accounting.bill_lines', count(*) FROM accounting.bill_lines
UNION ALL SELECT 'accounting.bill_payments', count(*) FROM accounting.bill_payments
UNION ALL SELECT 'accounting.expenses', count(*) FROM accounting.expenses
UNION ALL SELECT 'accounting.expense_lines', count(*) FROM accounting.expense_lines
UNION ALL SELECT 'accounting.journal_entries', count(*) FROM accounting.journal_entries
UNION ALL SELECT 'accounting.chart_of_accounts_roles', count(*) FROM accounting.chart_of_accounts_roles
UNION ALL SELECT 'catalogs.account_role_bindings (active)', count(*) FROM catalogs.account_role_bindings WHERE deactivated_at IS NULL;

COMMIT;
```

```sql
-- CoA control-account designation detail (why the poster fails closed today)
BEGIN;
SELECT set_config('app.bypass_rls', 'lucia', true);

SELECT operating_company_id, role, account_id, is_active, created_at
FROM accounting.chart_of_accounts_roles
ORDER BY operating_company_id, role;

COMMIT;
```

```sql
-- Posting-flag live state: default + per-entity overrides for the 3 accounting posting flags
BEGIN;
SELECT set_config('app.bypass_rls', 'lucia', true);

SELECT flag_key, default_enabled
FROM lib.feature_flags
WHERE flag_key IN ('BILL_GL_POSTING_ENABLED', 'BILL_PAYMENT_GL_POSTING_ENABLED', 'EXPENSE_GL_POSTING_ENABLED');

SELECT flag_key, operating_company_id, enabled
FROM lib.feature_flag_overrides
WHERE flag_key IN ('BILL_GL_POSTING_ENABLED', 'BILL_PAYMENT_GL_POSTING_ENABLED', 'EXPENSE_GL_POSTING_ENABLED')
ORDER BY flag_key, operating_company_id;

COMMIT;
```

```sql
-- Once #1 (control-account re-designation) is resolved: smoke-proof query to confirm a bill/expense
-- actually produced a balanced JE (run AFTER a real test transaction, not before).
BEGIN;
SELECT set_config('app.bypass_rls', 'lucia', true);

SELECT je.id, je.status, jep.source_transaction_type, jep.source_transaction_id,
       jep.account_id, jep.debit_cents, jep.credit_cents
FROM accounting.journal_entries je
JOIN accounting.journal_entry_postings jep ON jep.journal_entry_id = je.id
WHERE jep.source_transaction_type IN ('bill', 'bill_payment', 'expense')
ORDER BY je.created_at DESC
LIMIT 50;

COMMIT;
```

**Not run (owner-gated, would mutate live financial state — do NOT run without JORGE-APPROVED + CPA sign-off):** any `INSERT`/`UPDATE` into `accounting.chart_of_accounts_roles`, any flag flip in `lib.feature_flags` / `lib.feature_flag_overrides`, any backfill of the 16,198 header-only bills. These remain **UNVERIFIED-BY-DESIGN** — this audit deliberately did not attempt them.

---

## 8. What NOT to re-flag (already fixed — credit due)

- Expense detail page + full both-way linkage (vendor/JE/load/unit/WO/driver) — **shipped**.
- JE detail page wired to `source-links` API — **shipped**.
- Account Register `sourceRoute` for expense — **shipped**.
- Vendor Detail → Expenses history tab — **shipped**.
- `/accounting/recurring-transactions` dual-path redirect (#3227) — **shipped, merged, CI-guarded**.
- Vendor Bill create `bill_lines` schema + insert (#3172) — **shipped in code**, just unproven live (see Finding #2 above — that's a live-proof gap, not a code gap).
- Boxes-in-boxes chrome on Expense/Bill create drawers — **fixed** (CHROME-10 marker present).
- Pay Bill real bank-account picker (not hardcoded) — **already correct**.

---

## Summary of top 5 blocks + file path

1. **HOLD-NEON** — root-cause + re-designate `accounting.chart_of_accounts_roles` (currently 0 live rows; poster cannot resolve control accounts for any entity despite 3 GL-posting flags being ON).
2. **ECONOMICS** — live smoke-proof of one real Bill-with-lines and one real Expense end-to-end (both chains are code-complete but have zero production rows: `bill_lines=0`, `expenses=0`, `bill_payments=0`).
3. **REVERSE** — `BillDetailPage` / `getBillDetail` still don't return or render `bill_lines` or `journal_entry_id` (Expense sibling already fixed this exact gap — mirror it).
4. **REVERSE** — Bill Payment has no detail page and no JE link; `AccountRegisterPage` still drops the reference id for `bill_payment` type.
5. **DUAL-PATH** — "Allocations" tab from the architectural design has zero implementation anywhere in the repo; needs a build decision or an explicit Rule-05 deferral tracker entry.

**Report written to:**
`/Users/jorgemunoz/Desktop/IH35-CURSOR-AUDIT/modules/accounting.md`
`/Users/jorgemunoz/IH35-TMS/.worktrees/dual-path-old-vs-new-20260722/docs/trackers/exports/accounting-deep-audit-2026-07-22.md`

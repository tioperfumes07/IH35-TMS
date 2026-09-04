# CASCADE — GO-23 ROW 26 CLOSE-OUT

Scope: reconcile the two rescued spreadsheets against the 67-row board; do not build; do not open a new register.

**Live DB used:** USMCA only (`5c854333-6ea5-4faa-af31-67cb272fef80`), direct Neon endpoint (non-pooler), `SET LOCAL app.bypass_rls = 'lucia'` and `app.operating_company_id`.

**Acknowledgement on file claims:** The previous `ReportsSubNav.tsx` lint error was from a dirty shared checkout. All file-level claims below were re-run against `git show origin/main:<path>` or the live DB, not the working tree.

---

## 1. Re-verified locked invariants (the 6 from the prior report)

| Invariant | Original spreadsheet status | Live finding | Verdict |
|---|---|---|---|---|
| **#14** Auto-deduct on load abandonment (alarm + escrow deduction) | NOT SHIPPED | Function `dispatch.auto_propose_escrow_on_abandonment()` exists as a trigger. It fires on `abandoned`, `driver_walkoff`, `driver_no_show` and inserts into `dispatch.load_abandonments` plus `driver_finance.escrow_deductions_pending`. | **IN PROD** |
| **#18** Diesel/over-the-road expenses MUST link to a load | NOT ENFORCED | Triggers `trg_bill_line_load_fk`, `trg_expense_line_load_fk`, `trg_fuel_txn_load_fk` all execute `accounting.enforce_load_fk_invariant()`. Table `accounting.line_category_load_required` lists 9 enforced categories (diesel, def, toll, scale, lumper, parking, roadside_repair, detention_paid, over_road_other). | **IN PROD** |
| **#20** Hover-dropdown sub-nav on top bar; sidebar = one main panel | NOT IN PROD | UI/UX invariant. **No DB object can prove it.** Requires CC-2 visual live check. | **NOT DB-PROVABLE — no row opened pending visual proof** |
| **#21** Back-arrow + breadcrumb on every drilled-in sub-page | NOT IN PROD | UI/UX invariant. **No DB object can prove it.** Requires CC-2 visual live check. | **NOT DB-PROVABLE — no row opened pending visual proof** |
| **#23** Single-line names/headings — no two-line wrapping | PARTIAL DRIFT | UI/UX invariant. **No DB object can prove it.** Requires CC-2 visual live check. | **NOT DB-PROVABLE — no row opened pending visual proof** |
| **#24** Page subtitles MUST NOT use middle-dot lists | CLAUDE RULE | UI/UX invariant. **No DB object can prove it.** Requires CC-2 visual live check. | **NOT DB-PROVABLE — no row opened pending visual proof** |

**Result:** Only two of the six were DB-provable; both are **IN PROD**. The other four are screen-level design-system claims and cannot be elevated to board rows without CC-2 Chrome proof. No new board rows opened.

### Live queries pasted

**INV-14 — abandonment function exists and what it does:**
```sql
SELECT p.oid::regprocedure AS signature,
       pg_get_functiondef(p.oid) AS def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'dispatch'
   AND p.proname = 'auto_propose_escrow_on_abandonment';
```
Result: 1 row. Signature `dispatch.auto_propose_escrow_on_abandonment()`. Definition includes insert into `driver_finance.escrow_deductions_pending` for load abandonment.

**INV-18 — load-link triggers and enforced categories:**
```sql
SELECT trigger_name, event_manipulation, event_object_table, action_statement
  FROM information_schema.triggers
 WHERE trigger_name IN ('trg_bill_line_load_fk','trg_expense_line_load_fk','trg_fuel_txn_load_fk')
 ORDER BY trigger_name;
```
Result: 6 triggers on `bill_lines`, `expense_lines`, `fuel_transactions` all execute `accounting.enforce_load_fk_invariant()`.

```sql
SELECT line_category, description
  FROM accounting.line_category_load_required
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'::uuid
 ORDER BY line_category;
```
Result: 9 rows — diesel, def, toll, scale, lumper, parking, roadside_repair, detention_paid, over_road_other.

---

## 2. Pending tasks and PARTIAL MUST rules — recorded as named source, not board rows

From the rescued spreadsheets, still-open items that are **not** on the 67-row board:

- **62 MUST rules** with status `PARTIAL` or `P3 BUILD`
  - 53 `PARTIAL` rows: Part 5 integration health/monitoring/credentials and Part 6 UI/notification rules
  - 9 `P3 BUILD` rows: Part 9 audit-event logging for Maintenance/Safety/Fuel
- **~113 All Tasks** not done (PENDING / NOT STARTED / NOT BUILT / ON DECK / PARTIAL / IN FLIGHT / ON HOLD / NEW / DISPATCHED)
  - Phase 4 cleanup/catalogs, Phase 5 banking/pay/dispatch, Data Sovereignty, Samsara capabilities, Accounting Blocks 20–43, EDI/mobile/compliance
- **262 Error Codes** are a defined vocabulary, not actionable board rows.

**These are NOT adopted into the 67-row board.** Per instruction, they remain a named source with counts only. Wave 1 is still open; no new register opened and no dispatch from this backlog.

---

## 3. DOCUMENTATION defect class: tasks marked DONE while the live surface is still broken

This is the actionable half. All three have frontend code and/or DB schema marked complete in the tracker, but the production surface is not actually working/linked.

### 3a. T11.11 — Cash advance (DONE)

**Tracker claim:** DONE.

**Live check:**
- Frontend pages exist on `origin/main`: `apps/frontend/src/pages/cash-advances/*`, `apps/frontend/src/pages/loans/LoansAdvancesPage.tsx`, `apps/frontend/src/pages/driver-finance/CashAdvanceRequestsPage.tsx`.
- DB tables exist: `driver_finance.driver_advances`, `driver_finance.cash_advance_requests`.
- Production row counts for USMCA:
  ```sql
  SELECT count(*) FROM driver_finance.driver_advances WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'::uuid;
  -- 0
  SELECT count(*) FROM driver_finance.cash_advance_requests WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'::uuid;
  -- 0
  ```

**Verdict:** The screen and schema were shipped, but no live cash advances have been created and the feature is not wired into the load/dispatch flow. Board row **B8** (cash/fuel advances not wired) remains valid. The tracker status `DONE` is stale documentation.

### 3b. T11.12 — Factoring detail (DONE)

**Tracker claim:** DONE.

**Live check:**
- Frontend pages exist on `origin/main`: `apps/frontend/src/pages/accounting/FactoringDetailPage.tsx`, `FactoringListPage.tsx`, etc.
- DB tables/views exist: `accounting.factoring_advances`, `views.factoring_*`.
- Production row count for USMCA:
  ```sql
  SELECT count(*) FROM accounting.factoring_advances WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'::uuid;
  -- 0
  ```

**Verdict:** Factoring detail surface exists but has no live data and is not integrated with the load cost flow. Board row **B8** and **E1** (duplicate settlements/factoring tab) remain valid. Tracker `DONE` is stale documentation.

### 3c. T11.20.5 — Factoring tracking (DONE)

**Tracker claim:** DONE.

**Live check:**
- Same factoring schema/views as above exist.
- `accounting.factoring_advances` = 0 rows.
- Board row **E1** specifically says “Settlements and factoring appear twice — two tab rows carrying the same information.”

**Verdict:** The factoring tracking data layer is built, but the live UI still renders duplicate tab rows with the same information. The tracker `DONE` captured the data model, not the duplicate-tab UI defect. Board row **E1** remains valid.

---

## 4. 67-row board status after this close-out

No new rows added. The board’s existing rows stay as-is because the live evidence supports them.

| Board row | Why it stays open |
|---|---|
| B8 | Cash/fuel advances: schema exists, zero live rows, not wired to load surface. |
| E1 | Factoring UI duplicates settlements tab; factoring data layer marked DONE but duplicate UI not fixed. |
| J1 (root cause: no design system) | The four UI invariants (#20, #21, #23, #24) cannot be proven by DB queries; CC-2 must verify in Chrome before they are closed. |

---

## 5. Recommended next action

Open a single documentation-defect finding to the owner/coordinator: the tracker `DONE` statuses for T11.11, T11.12, and T11.20.5 are being treated as shipped when the live surfaces are still broken. Suggest a rule: a tracker `DONE` on a UI/transaction feature requires either a live production row or a CC-2 Chrome pass before it can block a later defect row.

No code written. No new register opened.

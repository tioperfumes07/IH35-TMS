# GAP-EXPENSES Phase 2 — Expenses → GL posting + reversing-JE void (Design, reconciled to the 6 LOCKED decisions)

**Status:** DESIGN / DOCS ONLY. No code, no DDL, no migration run. **Reconciled** to the 6 locked decisions (this supersedes the original #1010 recs). GL-posting flag stays **OFF** until Jorge verifies each step.
**Date:** 2026-06-15 (Laredo/CST) · reconcile pass.
**Foundation (live on prod):** #1006 header + #1008 Phase 1.5 (`amount_cents bigint`, `ensure_expense_total_matches_lines()`, migration `202606151400` in ledger). The deferred gate fires on **`posting_status='posted'`**, no carve-out → inert until Phase 2 posts.
**Bar:** reach/surpass QuickBooks + McLeod + NetSuite — one integrated GL, every event drills to source, **balances-or-fails**, void **preserves the record**.
**Scope lock:** GL posting + reversing-JE void only. **No** Phase 3 (QBO sync). **No** advances (PR-3)/Section-B. Shared writer: **expense branch only**; bill path byte-unchanged (#1009 stays green).

---

## 0. ⚠️ COA-TABLE DRIFT — RESOLVED against real code + prod-mirror (was the #1 open item)
GUARD's decisions doc named the COA table `accounting.coa_account`. **Verified, that is the QBO mirror, not the posting CoA:**
- **`catalogs.accounts` is the canonical GL chart-of-accounts** the posting engine + roles use:
  - `journal_entry_postings.account_id` → `REFERENCES catalogs.accounts(id)` (0092:27, 0123:2465).
  - `chart_of_accounts_roles.account_id` → `REFERENCES catalogs.accounts(id)` (0223:21).
  - `resolveMappedRoleAccount` literally `JOIN catalogs.accounts a ON a.id = car.account_id`.
- **`accounting.coa_account` is the QBO mirror** (`0265_ps_mirror`: `qbo_id NUMERIC NOT NULL, UNIQUE(tenant_id, qbo_id)`) — Phase-3 sync territory, **not** where posting reads accounts.
- **`catalogs.accounts` is GLOBAL (no tenant column);** per-company-ness lives entirely in `chart_of_accounts_roles (operating_company_id, role, account_id)`. Verified on prod-mirror: `ap_control` for both TRANSP (`91e0bf0a`) and `b49a737b` points at the **same** "Accounts Payable" row (`distinct_accounts=1, companies=2`). Same for `ar_control`/`undeposited_funds`.

**→ The decision-#1 seed goes into `catalogs.accounts` (one global row) + a per-company role in `chart_of_accounts_roles`** — mirroring the existing `ap_control` pattern, NOT `accounting.coa_account` and NOT a per-company account row. **GUARD/Jorge: confirm this resolution.**

## 1. LOCKED DECISIONS (reconciled) — each mapped to verified code
| # | Locked decision | Verified anchor / how it lands |
|---|---|---|
| 1 | **Seed "Uncategorized Expenses" account + `uncategorized_expense` ROLE** (not reuse `expense_default`) | Seed one global row in `catalogs.accounts` (type `Expense`, postable) + per-company `uncategorized_expense` role (§2). Resolver = `resolveRoleAccountOptional(client, oci, "uncategorized_expense")`. *(Note: a generic `expense_default` role is already defined+unseeded and used as a bill fallback; GUARD chose the named role for QBO-style P&L visibility.)* |
| 2 | **DB feature-flag `EXPENSE_GL_POSTING_ENABLED`** (default OFF) | Mirror `VOID_FLAG_KEY`/`isEnabled` (`void.service.ts:104`, `lib/feature-flags/service.js`). Per-tenant, instantly reversible. |
| 3 | **Cash (`payment_account_uuid`) else AP-with-vendor; orphan guard; accountant sign-off** | CR resolves directly via the header `payment_account_uuid` (a `catalogs.accounts` id — **no cash role needed**, closing GUARD's open item); else AP via `resolveApAccountForCompany` **carrying the vendor**. No payment acct **and** no vendor → **FAIL LOUD** (§3). |
| 4 | **Owner + Accountant post** | Reuse `canVoid` role set (`void.service.ts:40`). |
| 5 | **Explicit "Post to GL" action** (not auto-post) | New gated `POST /api/v1/expenses/:id/post` → `postSourceTransaction({source_transaction_type:'expense'})`. |
| 6 | **Both direct AND WO-sourced** | One `buildExpenseLines` handles both (direct = header only → synthesize one uncategorized line; WO = real `expense_lines`). |

## 2. Decision #1 — the Uncategorized-Expenses seed (the safe foundation, STEP 2)
**Two parts, both idempotent, additive, per the verified pattern:**
1. One global account in `catalogs.accounts`: `account_name='Uncategorized Expenses'`, `account_type='Expense'`, `is_postable=true` — created only if absent.
2. A per-company `uncategorized_expense` role in `chart_of_accounts_roles` for each **active** company, pointing at that account (mirrors `ap_control`).
3. **CHECK widening:** `chart_of_accounts_roles_role_check` currently allows 11 roles (incl. `expense_default`) but **not `uncategorized_expense`** → the migration must DROP+re-ADD the CHECK with `uncategorized_expense` added. The typed `COA_ROLE_VALUES` (`coa-roles/resolver.service.ts`) must also gain `'uncategorized_expense'` (code, ships with the posting step).
4. **Fail-loud:** at posting time, if `uncategorized_expense` is unresolved for a company → `ACCOUNT_MAPPING_MISSING` (no silent default).

## 3. Decision #3 — credit side + orphan guard (needs accountant sign-off before the flag flips)
`buildExpenseLines` credit line:
- **Payment account set** (header `payment_account_uuid`) → CR that cash/bank `catalogs.accounts` id (QBO "Expense", paid).
- **Else** → CR **AP** (`resolveApAccountForCompany`) **and the posting must carry the vendor** (header `vendor_uuid`) so AP aging stays meaningful (QBO "Bill", owed).
- **Orphan guard (HARD):** no `payment_account_uuid` **and** no `vendor_uuid` → **FAIL LOUD** (`PostingEngineError`, no orphan payable).
- **Accountant sign-off required** on this DR/CR treatment before `EXPENSE_GL_POSTING_ENABLED` flips on (pure accounting policy).

## 4. POSTING FLOW (mirror `buildBillLines`) — STEP 3, behind the flag
`apps/backend/src/accounting/posting-engine.service.ts`:
- `PostingSourceType` (`:5`) **+= `"expense"`** (plain `text` at the DB layer — no enum/CHECK migration; verified).
- `buildPostingDraft` (`:923`) **+= `if (sourceType === "expense") return buildExpenseLines(...)`**.
- **NEW `buildExpenseLines`** (near-copy of `buildBillLines:492`):
  - DR one line per `expense_lines` row; account resolution chain: line `expense_category_uuid` → `resolveBillCategoryAccount`/`resolveAccountForCategory` → **`uncategorized_expense` role** (decision #1) → else **fail loud**. Amount = `expense_lines.amount_cents` directly.
  - **Direct (line-less) expense:** synthesize **one** line to the `uncategorized_expense` account for `total_amount_cents`, so `total = sum(lines)` holds before the `posting_status='posted'` flip (satisfies the Phase-1.5 gate).
  - CR per §3.
- `assertBalanced` (`:346`) + the JE balance trigger (`ensure_journal_entry_balanced`) → balances-or-fails. `ensureOpenPeriod` → closed-period aware.
- On success: set `posting_status='posted'`, `posted_at=now()`, `journal_entry_id`.
- **Idempotency:** `postSourceTransaction` already returns the existing batch on re-post (`getExistingPostingResultByIdempotencyKey`) → **no double JE**; the post action also hard-rejects `posting_status<>'unposted'`.

## 5. VOID = reversing JE (consequence of posting)
`reversePostedSourceTransaction` (`:1094`, source-type-agnostic, idempotent) produces the negating JE; original JE stays. `void.service.ts`: `VoidableEntityType += 'expense'`; `auditVoid` map += expense. Set `posting_status='reversed'`, `reversed_by_je_id`. Gated `VOID_ENFORCEMENT_ENABLED` (default OFF), **Owner+Accountant**, reason required, un-suppressable audit. **Block-if-linked** (Gate 3): WO-sourced (`expense_lines.linked_wo_line_uuid`) / bill-sourced (`expense_lines.parent_line_uuid`) / load-attributed (`expense_attribution.expense_load_links`) → void at source; direct un-sourced → directly voidable.

## 6. GATING — ships DARK (decision #2)
`EXPENSE_GL_POSTING_ENABLED` feature-flag key (mirror `VOID_FLAG_KEY` via `isEnabled`), default OFF. Behind it: the Post-to-GL action **and** the reversing-JE void. **OFF ⇒ byte-identical to today** (route creates header only; `posting_status` stays `'unposted'`; the Phase-1.5 gate stays inert). The seed (§2) is the only thing that lands first, and it changes no behavior on its own.

## 7. SEED MIGRATION SQL (STEP 2 — SHOWN, NOT RUN)
```sql
-- 2026MMDDHHMM_expense_uncategorized_account_and_role.sql  (number > main max at push)
BEGIN;

-- 1. widen the role CHECK to allow the new role (idempotent: drop + re-add full list)
ALTER TABLE accounting.chart_of_accounts_roles DROP CONSTRAINT IF EXISTS chart_of_accounts_roles_role_check;
ALTER TABLE accounting.chart_of_accounts_roles ADD CONSTRAINT chart_of_accounts_roles_role_check
  CHECK (role IN ('ar_control','ap_control','cash_clearing','undeposited_funds','revenue_default',
    'expense_default','factor_reserve_default','escrow_liability_default','sales_tax_payable',
    'cash_basis_adjustment_equity','retained_earnings','uncategorized_expense'));

-- 2. one global "Uncategorized Expenses" account in catalogs.accounts (the posting CoA), if absent
INSERT INTO catalogs.accounts (account_number, account_name, account_type, is_postable)
SELECT '6999', 'Uncategorized Expenses', 'Expense', true
WHERE NOT EXISTS (
  SELECT 1 FROM catalogs.accounts WHERE account_name = 'Uncategorized Expenses' AND account_type = 'Expense'
);   -- account_number '6999' illustrative; final picks a non-colliding expense-range number

-- 3. per-company uncategorized_expense role -> that account, for each active company (mirrors ap_control)
INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
SELECT c.id, 'uncategorized_expense', a.id, true
FROM org.companies c
CROSS JOIN (SELECT id FROM catalogs.accounts WHERE account_name='Uncategorized Expenses' AND account_type='Expense' LIMIT 1) a
WHERE c.is_active
-- VERIFIED unique key = PARTIAL index uq_coa_roles_company_role_active
--   (operating_company_id, role) WHERE is_active = true → the ON CONFLICT must carry that predicate:
ON CONFLICT (operating_company_id, role) WHERE is_active = true DO NOTHING;

COMMIT;
```
**Rollback (greenfield/additive):**
```sql
BEGIN;
DELETE FROM accounting.chart_of_accounts_roles WHERE role='uncategorized_expense';
DELETE FROM catalogs.accounts WHERE account_name='Uncategorized Expenses' AND account_type='Expense'
  AND NOT EXISTS (SELECT 1 FROM accounting.journal_entry_postings p WHERE p.account_id = catalogs.accounts.id);
-- (re-narrow the CHECK only if no rows use 'uncategorized_expense')
COMMIT;
```
- **GRANTs:** none new (`catalogs`/`accounting` covered by 0065 defaults). **No cash/bank role seed needed** (credit side uses `payment_account_uuid`). **Drift-capture:** none (additive). CI is the fresh-DB gate.

## 8. Process & open items
- **STEP 1 (this doc):** reconcile to locked decisions + resolve the COA drift. ✅
- **STEP 2:** the seed migration (§7), SHOWN — Jorge approves → branch-test on `ci-migration-test` via the existing runner → **builder STOPS** → GUARD verifies independently → Jorge merges. **No posting logic in Step 2.**
- **STEP 3 (only after Step 2 approved + verified):** posting engine (`'expense'` source, `buildExpenseLines`, balanced JE) + reversing-JE void, behind `EXPENSE_GL_POSTING_ENABLED` (OFF). Separate gated block.
- **Open items:** (a) ✅ **CONFIRMED** seed→`catalogs.accounts` (Jorge, 2026-06-15). (b) ⏳ **PENDING** accountant sign-off on §3 cash-else-AP + orphan guard — *design it, do not enable it.* (c) ✅ **VERIFIED** ON CONFLICT target = partial unique index `uq_coa_roles_company_role_active` `(operating_company_id, role) WHERE is_active = true`. (d) ⏳ **PENDING** final `account_number` (Jorge gives it to fit the COA numbering scheme; `'6999'` is a placeholder).
- **Process LOCKED:** design/SQL shown → Jorge approves → branch-test → builder STOPS → GUARD verifies independently → Jorge merges → deploy → GUARD verifies on prod. Flag flips ON only after Jorge's post-verify say-so. Never cleanup2-fresh; no credentials in chat.

## 9. TEST PLAN (built with each step)
Seed: account+role present per active company; idempotent re-run; CHECK widened. Posting (Step 3): balanced JE on post; direct-expense line synthesis → `total=sum` holds; uncategorized → `uncategorized_expense` account; cash-vs-AP credit; **orphan guard fails loud**; idempotent re-post (no double JE); reversing-JE void; block-if-linked; flag OFF = zero posting; bill-path non-regression (#1009). Each new behavior carries a static CI guard.

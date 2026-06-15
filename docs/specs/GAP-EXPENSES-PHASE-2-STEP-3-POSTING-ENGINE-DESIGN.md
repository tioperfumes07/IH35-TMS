# GAP-EXPENSES Phase 2 — Step 3: expense → GL posting engine + reversing-JE void (Design)

**Status:** DESIGN / DOCS ONLY. No code until Jorge approves. Everything ships behind **`EXPENSE_GL_POSTING_ENABLED` (default OFF)** — flag flips ON only after GUARD verifies on branch + prod and Jorge says so.
**Date:** 2026-06-15 (Laredo/CST).
**Foundation now LIVE on prod:** #1006 header · #1008 Phase-1.5 cents+gate · **#1015 Step-2 seed** (Uncategorized Expenses #6999 in `catalogs.accounts` + per-company `uncategorized_expense` role + `COA_ROLE_VALUES`). The Phase-1.5 deferred gate (`posting_status='posted' ⇒ total_amount_cents = SUM(expense_lines.amount_cents)`, no carve-out) is inert until this step posts.
**Basis (LOCKED, accountant-confirmed):** TRANSP = **cash basis** (books + MOR). Primary path = debit expense / **credit bank** (`payment_account_uuid`); AP is the rare accrual exception. See [[expense-gl-cash-basis-decision]].
**Scope lock:** GL posting + reversing-JE void only. **No** Phase 3 (QBO sync); `qbo_*` columns are the forward hook, build nothing. **No** advances (PR-3)/Section-B. Shared writer untouched (bill path byte-unchanged; #1009 stays green).

---

## 1. Posting engine — add `'expense'` (mirror `buildBillLines`, reuse everything)
`apps/backend/src/accounting/posting-engine.service.ts` (all anchors verified on main):
- `PostingSourceType` (`:5`) **+= `"expense"`** — TS-only; `source_transaction_type` is plain `text` at the DB (no enum/CHECK migration).
- `buildPostingDraft` (`:923`) **+= `if (sourceType === "expense") return buildExpenseLines(...)`**.
- **NEW `buildExpenseLines(client, operatingCompanyId, sourceId)`** — near-copy of `buildBillLines` (`:492`):
  - Load `accounting.expenses` header (`FOR UPDATE`); reject if `status='void'` or `posting_status<>'unposted'`.
  - **DEBIT lines** (one per `accounting.expense_lines` row, amount = `amount_cents` **directly** — already integer cents):
    account resolution chain → (1) line's explicit account if any → (2) `expense_category_uuid` via `resolveBillCategoryAccount` (`:473`) / `resolveAccountForCategory` (`expense_category_account_map`) → (3) **`uncategorized_expense` role** via `resolveRoleAccountOptional(client, oci, "uncategorized_expense")` (now seeded, #1015) → (4) **fail loud** `ACCOUNT_MAPPING_MISSING`.
  - **CREDIT line** (one, for the header total) — **cash-basis primary (§2)**.
  - Return `{ postingDate: transaction_date, memo, lines: [...debits, creditLine], accountResolutionTrace }`.
- **Balances-or-fails (both reused):** `assertBalanced(draft.lines)` (`:346`, app) **and** the DB JE-balance trigger `ensure_journal_entry_balanced`/`trg_check_journal_entry_balanced` on `journal_entry_postings`.
- **Closed-period aware:** `ensureOpenPeriod` (already in `postSourceTransaction:1003`).
- JE written to `accounting.journal_entries` + `journal_entry_postings` under a `posting_batches` row (existing).

## 2. Credit side — CASH-BASIS PRIMARY + orphan guard (decision #3)
- **PRIMARY / default (cash):** header `payment_account_uuid` set → **CR that bank/cash `catalogs.accounts` id**. Bank-feed-driven (a feed item is already paid). This is the dominant flow.
- **AP path (accrual exception, NOT default):** no payment account, vendor present → CR **AP** (`resolveApAccountForCompany`) carrying the vendor. Kept for the rare deferred case only.
- **Orphan guard (HARD):** no `payment_account_uuid` **and** no `vendor_uuid` → **fail loud** (`PostingEngineError`, no orphan payable). Rarely fires on the bank-feed path (feed items always carry a payment account).

## 3. Direct (line-less) expense — line synthesis so `total = sum` holds
A direct expense is header-only (`total_amount_cents>0`, 0 lines). Before the `posting_status='posted'` flip, `buildExpenseLines` **synthesizes one debit line** to the **`uncategorized_expense`** account (#1015) for `total_amount_cents`, so the Phase-1.5 gate (`total = sum(lines)`) is satisfied in the same transaction. Uncategorized lines surface on the P&L as the cleanup list (QBO behavior); categorize-then-recode later.

## 4. The "Post to GL" action (decision #5 — explicit, not auto-post)
- **NEW gated endpoint `POST /api/v1/expenses/:id/post`** (or extend `posting-engine.routes.ts:75`) → `postSourceTransaction({ source_transaction_type:'expense', source_transaction_id:id, operating_company_id }, actor)`.
- **Gated by `EXPENSE_GL_POSTING_ENABLED`** (feature flag, mirror `VOID_FLAG_KEY`/`isEnabled` — `void.service.ts:104`). Flag OFF → endpoint inert (`409 expense_posting_not_enabled`); route still creates header-only as today.
- **Role:** Owner + Accountant (reuse `canVoid` set, `:40`, or a sibling `canPost`).
- **On success:** set header `posting_status='posted'`, `posted_at=now()`, `journal_entry_id=<new JE>`.
- **Idempotency (no double JE):** `postSourceTransaction` already returns the existing batch via `getExistingPostingResultByIdempotencyKey` (`:986`); the action also hard-rejects `posting_status<>'unposted'`.

## 5. VOID = reversing JE (not a status flip)
- `void.service.ts`: `VoidableEntityType` (`:19`) **+= `"expense"`**; `auditVoid` map **+= expense → 'accounting.expenses'**; `postVoidReversal` (`:169`) handles it.
- The reversing JE = `reversePostedSourceTransaction` (`:1094`, source-type-agnostic, idempotent via the `reversal` purpose) — original JE **stays**, a negating JE is added.
- Set `posting_status='reversed'`, `reversed_by_je_id`. Gated `VOID_ENFORCEMENT_ENABLED` (OFF), **Owner+Accountant**, **reason required**, un-suppressable audit (logs original values + GL accounts). `'reversed'` is exempt from the Phase-1.5 gate (it only fires on `'posted'`).
- **Block-if-linked (Gate 3):** WO-sourced (`expense_lines.linked_wo_line_uuid`) / bill-sourced (`expense_lines.parent_line_uuid`) / load-attributed (`expense_attribution.expense_load_links`) → void at the source; direct un-sourced → directly voidable.

## 6. Gating — ships DARK
Behind `EXPENSE_GL_POSTING_ENABLED` (default OFF): the Post-to-GL action **and** the reversing-JE void. **OFF ⇒ byte-identical to today** (header-only creation; `posting_status` stays `'unposted'`; Phase-1.5 gate inert). No migration in this step (the source type is TS-only; the seed already shipped in #1015).

## 7. Test plan (DB tests mirror `expense-balance-invariant.db.test.ts`)
balanced JE on post (DR category/uncategorized, CR bank; debit==credit; header→posted) · **fail-loud on imbalance** · direct-expense synthesis → `total=sum` holds · uncategorized line → `uncategorized_expense` account · cash CR via `payment_account_uuid`; AP exception carries vendor · **orphan guard fails loud** · idempotent re-post (no double JE) · reversing-JE void (nets to zero, `posting_status='reversed'`) · block-if-linked redirects to source · **flag OFF = zero posting** (byte-identical) · bill-path non-regression (#1009). Static CI guard: `verify-expense-gl-posting.mjs` (asserts `'expense'` in enum+dispatcher; post flips `posting_status`/`journal_entry_id`; flag-gated; cash-primary CR).

## 8. Open items / process
- **Confirm:** (a) the Post-to-GL endpoint shape (new `:id/post` vs extend the generic route); (b) `canPost` = `canVoid` set or a dedicated check; (c) the cash-vs-AP selection precedence when *both* a payment account and a vendor are present (rec: cash wins on cash basis).
- **Process (LOCKED):** design → Jorge approves → (no migration this step) → branch-test the posting behind the flag on `ci-migration-test` (flag toggled in-test only) → **builder STOPS** → GUARD verifies independently → Jorge merges → deploy → GUARD verifies on prod. **The live flag flips ON only after GUARD verifies on prod and Jorge says so.** Never cleanup2-fresh; no credentials in chat.

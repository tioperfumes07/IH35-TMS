# ROUND 154 — CODEX — BUILD THE WHOLE CHECK ENGINE (QuickBooks "Write Check" parity), START TO FINISH
Claude Lead, 09-25-2026 3:59 AM CT (08:59Z). One coder (Codex), one job, no switching, from schema to live Chrome proof.

Owner, 3:47 AM CT: "one thing we are missing, the entire create check engine, as in quickbooks… design it completely… have it build it completely one coder from start to finish, wiring, linkage etc."

---

## 0. What exists today (measured 08:50Z; re-measure before you write)
| Fact | Evidence |
|---|---|
| No check document anywhere. No `checks` table. No check number registry. No print queue. | `information_schema` scan: only `accounting.bill_payments.check_number`, `banking.bank_transactions.check_number`, `banking.reconciliation_sessions.outstanding_checks_cents`, `mdata.vendors.print_on_check_name` |
| USMCA BoA operating account exists and is mapped | `banking.bank_accounts` e83028a5-dcda-4233-b660-5b9923b3d39c "USMCA FREIGHT" checking, active, ledger → **1000 Bank of America - Operating (USMCA)** |
| USMCA bank feed checks | 625 rows on e83028a5, only 1 carries a check_number (`R11-USMCA-0728`, −5,299.10). There are no real paper checks to backfill. |
| USMCA bill payments | 0 rows |
| The expense document engine already has everything a check needs except check fields | `accounting.expenses` (payee vendor/driver, payment_account_uuid, unit, trailer, load, WO, insurance claim, legal matter, class, recover_from_driver, JE, void columns) + `accounting.expense_lines` (section Category/Item, expense_account, service item, qty, rate, billable customer, load) |
| Posting and void engines to reuse | `apps/backend/src/accounting/posting-engine.service.ts` (`postSourceTransactionInClientTx`, `reversePostedSourceTransactionInClientTx`, `ensureOpenPeriod`), `void-document.service.ts`, `void-tree.service.ts`. **Do not write a seventh reversal engine.** |
| Render pattern to copy | `bill-payment-render.routes.ts`, `invoice-render.routes.ts` |
| Payment-method catalog | `catalogs.payment_methods` has code `CHECK` for other entities; USMCA has 12 rows, so verify that USMCA has `CHECK` |

## 1. The QuickBooks model we clone (researched, Intuit docs; live walkthrough in step 1)
- In QBO a **Check is a `Purchase` with `PaymentType = Check`** (TxnType 3), and `AccountRef` must be a **bank** account. It is the same entity as an Expense, with extra check-only fields:
  - `DocNumber` = check number, max 21 chars. Duplicates are refused when `WarnDuplicateCheckNumber` is on.
  - `PrintStatus` = `NotSet | NeedToPrint | PrintComplete`.
  - `RemitToAddr` = the address printed on the check.
  - `EntityRef` = the payee: Vendor, Customer or Employee.
  - `PrivateNote` = Memo.
  - Lines are `AccountBasedExpenseLineDetail` (Category details) and `ItemBasedExpenseLineDetail` (Item details: ItemRef, Qty, UnitPrice), each with `BillableStatus`, `CustomerRef`, `ClassRef`.
  - `TotalAmt` = the sum of the lines (system computed).
- **Write-check form (QBO UI):**
  - Header: Payee · Bank account (shows balance) · Mailing address · Payment date · Check no. · ☐ Print later (checked ⇒ Check no. shows "To print").
  - Big amount top right.
  - Body: Category details table, then Item details table, then Memo, then Attachments.
  - Footer: Cancel · Clear · Print check · Save · Save and new · Save and close. More menu: Void · Copy · Transaction journal · Audit history.
- **Payee with open bills:** QBO opens a side panel, "Add to check". Adding a bill turns the form into a **Bill Payment (check)**, which settles A/P, not an expense.
- **Print checks screen:**
  - Pick the bank account.
  - Enter the starting check number.
  - Pick the check type: Voucher (1 per page, 2 stubs) or Standard (3 per page).
  - Tick the checks to print, then Preview and print.
  - Confirmation: "Yes, they all printed correctly" or "Some checks need reprinting, starting at #N".
  - Printed checks leave the queue with PrintComplete. Spoiled numbers are recorded, never reused silently.
- **Void:** the check stays in the register with amount 0 and "Voided" in the memo, and its number stays used. **Delete is not allowed here (our law: void only).**

## 2. Architecture decision (Lead ruling — matches QBO's own model)
**A Check is an `accounting.expenses` row with `payment_type = 'check'`.** No parallel document table. The reasons:
1. QBO models it this way (Purchase).
2. The costs guard (a 5xxx/6xxx debit must have an `accounting.expenses` row) holds for free.
3. Every linkage already on expenses (unit, trailer, driver, load, WO, insurance, legal, class, recover-from-driver) works on day one.
4. Load Costs, Pre-Settlement and Settlement (CC-3's one-source work) read expense lines, so check lines show up without a second source.

A check that pays bills is an `accounting.bill_payments` row with `payment_method='CHECK'` and `check_number` (existing engine). Both kinds share **one** check-number registry and **one** print queue.

## 3. Schema (one migration, additive, forward-only; `db/migrations/`)
```sql
-- 3a. check fields on the expense document
ALTER TABLE accounting.expenses
  ADD COLUMN payment_type text NOT NULL DEFAULT 'expense'
      CHECK (payment_type IN ('expense','check','cash','credit_card')),
  ADD COLUMN check_number text,                    -- NULL while print_status='need_to_print'
  ADD COLUMN print_status text NOT NULL DEFAULT 'not_set'
      CHECK (print_status IN ('not_set','need_to_print','print_complete')),
  ADD COLUMN payee_kind text CHECK (payee_kind IN ('vendor','driver','customer','employee')),
  ADD COLUMN payee_customer_uuid uuid REFERENCES mdata.customers(id),
  ADD COLUMN remit_to_address jsonb,               -- snapshot printed on the check
  ADD COLUMN print_on_check_name text,             -- snapshot of mdata.vendors.print_on_check_name
  ADD COLUMN printed_at timestamptz, ADD COLUMN printed_by_user_id uuid REFERENCES identity.users(id),
  ADD COLUMN print_batch_id uuid;
-- a check must pay from a depository bank account and carry a payee
-- (enforce in service + guard; add CHECK (payment_type<>'check' OR payee_kind IS NOT NULL))

-- 3b. ONE check-number registry for every paper check the company issues
CREATE TABLE banking.check_number_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  bank_account_id uuid NOT NULL REFERENCES banking.bank_accounts(id),
  check_number text NOT NULL,
  source_kind text NOT NULL CHECK (source_kind IN ('check','bill_payment','driver_settlement_payment')),
  source_id uuid,                                  -- expenses.id / bill_payments.id / settlement_payment_events.id
  status text NOT NULL CHECK (status IN ('issued','printed','voided','spoiled')),
  amount_cents bigint NOT NULL DEFAULT 0,
  payee_label text,
  issued_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz, void_reason text, voided_by_user_id uuid REFERENCES identity.users(id),
  created_by_user_id uuid REFERENCES identity.users(id),
  is_sample_data boolean NOT NULL DEFAULT false,
  UNIQUE (operating_company_id, bank_account_id, check_number)   -- hard block, stronger than QBO's warning
);
-- 3c. per-bank-account check stock settings
CREATE TABLE banking.check_stock_settings (
  bank_account_id uuid PRIMARY KEY REFERENCES banking.bank_accounts(id),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  next_check_number bigint NOT NULL,
  check_type text NOT NULL DEFAULT 'voucher' CHECK (check_type IN ('voucher','standard')),
  offset_x_mm numeric NOT NULL DEFAULT 0, offset_y_mm numeric NOT NULL DEFAULT 0,
  print_company_address boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by_user_id uuid REFERENCES identity.users(id)
);
```
- RLS on both new tables, the same policy shape as `banking.bank_transactions` (operating_company_id + `app.bypass_rls`).
- No bank routing or account numbers are stored. QBO prints on pre-printed stock, and so do we.
- Index `accounting.expenses (operating_company_id, payment_type, print_status)`.
- `next_check_number` for USMCA: **ask nothing, read nothing into it.** It starts NULL-guarded. The owner types the first number on the Print Checks screen, exactly like QBO. Do not seed a guessed number.

## 4. Backend (`apps/backend/src/accounting/checks/`)
| Route | Behavior |
|---|---|
| `GET /api/v1/checks` | list: date, no., payee, bank, amount, print status, status, memo; sort and filter server-side (sort law) |
| `GET /api/v1/checks/:id` | header + lines + JE + registry row + attachments + linked docs |
| `POST /api/v1/checks` | create. Validates: bank account depository and active with `ledger_account_id`; payee required; ≥1 line; amounts > 0; sum = total; `ensureOpenPeriod`; check number unique via registry (hard 409 `CHECK_NUMBER_IN_USE`, with the existing doc linked). Print later ⇒ number NULL, `print_status='need_to_print'`. Handwritten ⇒ number required, registry `issued`. Idempotency key the same as `POST /api/v1/expenses`. |
| `PATCH /api/v1/checks/:id` | edit while unprinted or open-period. Printed checks can only change memo/lines within the same total (QBO rule), otherwise void and reissue. |
| `POST /api/v1/checks/:id/void` | existing `void-document` engine: reversal JE, `voided_at`, registry `voided`, number stays used |
| `GET /api/v1/checks/print-queue?bank_account_id=` | `need_to_print` checks and bill payments for that bank |
| `POST /api/v1/checks/print-batch` | {bank_account_id, starting_number, check_type, ids[]} ⇒ assigns numbers in order in one transaction, writes registry `printed`, sets `print_batch_id`, returns PDF |
| `POST /api/v1/checks/print-batch/:id/confirm` | {all_ok} or {reprint_from_number} ⇒ spoiled numbers become registry `spoiled`, and those checks return to the queue with new numbers on the next batch |
| `GET /api/v1/checks/:id/render.pdf` | the check face plus the stub(s). Amount in words ("Five thousand two hundred ninety-nine and 10/100"), payee = `print_on_check_name` ⟶ vendor name, remit-to, memo, date, number. The voucher stub lists category/item lines or the bills paid. Copy the `bill-payment-render.routes.ts` pattern. |
| `GET /api/v1/checks/next-number?bank_account_id=` | the next free number per the registry + settings |
| `GET /api/v1/vendors/:id/open-bills` (exists? reuse) | feeds the "Add to check" panel; adding a bill converts the form to a Bill Payment through the existing vendor-bill-payments engine with `payment_method='CHECK'` + `check_number` + registry row `bill_payment` |

**Posting (through `postSourceTransactionInClientTx`, source_transaction_type `expense`, same as expenses):**
- Dr each line's account: the Category line → `expense_account_uuid` via `expense_category_account_map`; the Item line → the item's expense account.
- Cr the bank's `ledger_account_id` (USMCA = 1000).
- Never 1090/1100/1150.
- Memo: `Check #<no> · <payee> · <first line desc>`, human-readable per `verify-je-memo-is-human-readable`.
- Print later: post at save, with number "To print" in the memo. When numbers are assigned at print, patch the memo text only (no amount change, audit logged).

## 5. Frontend (`apps/frontend/src/pages/accounting/checks/`)
- **+ New menu → "Check"**, route `/accounting/checks/new`. Also Expenses & Bills → Checks list `/accounting/checks`, and Banking → **Print checks** `/banking/print-checks`.
- **Form = the QBO layout in §1, field for field.** Reuse the `RecordExpenseForm` building blocks (ReferenceSelect, category/item tables). Category line columns: # · Category · Description · Amount · Billable · Customer · Class · **Load · Unit · Trailer · Driver** (our trucking extension).
- Bank account shows its live balance from `account-balances.service`.
- Payee with open bills ⇒ "Add to check" side panel.
- Print later checkbox; Check no. shows "To print".
- Attachments via `docs.files`.
- Audit history.
- Voided banner the same as invoices/expenses.
- Design system and table law: one datum per column, sortable headers, server sort, no page-only sort.

## 6. Linkage (a block with no linkage declaration is not done)
- **Header:** org.companies · identity.users (created/printed/voided by) · mdata.vendors | mdata.drivers | mdata.customers (payee) · banking.bank_accounts → catalogs.accounts (credit) · accounting.journal_entries · docs.files · banking.check_number_registry.
- **Line:** catalogs.accounts · items · mdata.loads · mdata.units · mdata.equipment (trailer) · mdata.drivers · maintenance.work_orders (linked_wo_line_uuid) · insurance claim · legal matter · class · billable customer.
- **Reverse links — each detail page shows its checks with a click-through:**
  - Vendor, driver and customer Transactions tabs.
  - Unit and trailer cost tabs.
  - Load Detail → Costs (automatic through expense_lines, so confirm with CC-3 it renders).
  - Work Order → Costs.
  - Account register for 1000 and for every debited account.
  - Bank register shows "Check #N".
- **Bank matching:** a `banking.bank_transactions` row whose `check_number` equals a registry number on the same bank account is an **exact match candidate**. Add check as a candidate kind through the match engine's existing candidate-source interface. Put one line at the top of `NOW-CC-2.md` naming the function you added (CC-2 owns the engine; you add only the source).
- **Bank recon:** registry `issued/printed`, not cleared ⇒ `reconciliation_sessions.outstanding_checks_cents`.
- **Driver recovery:** `recover_from_driver=true` on a check posts the driver deduction through the existing path (no new math).

## 7. Guard + tests (named)
- **`scripts/verify-check-engine.mjs`**: selftest + LIVE (REQUIRES_LIVE_DB, fail-closed), wired into `money-pr-local-gate.mjs` LIVE_DOMAIN_GUARDS for `apps/backend/src/accounting/checks/`, `db/migrations/`. It asserts, for every USMCA `payment_type='check'`:
  1. the bank account is depository with a ledger account;
  2. the JE credit hits exactly that ledger account;
  3. the lines sum to the total and to the JE debit;
  4. `print_status='need_to_print'` ⇔ number NULL;
  5. a registry row exists and its number matches;
  6. voided ⇒ reversal JE + registry `voided`;
  7. no duplicate number per bank;
  8. no 1090/1100/1150 credit.
- DB tests on a **Neon child branch** of `br-fancy-credit-akjnd07a` (never on USMCA production): create a handwritten check, print-later → batch → confirm with a reprint, void, bill-payment-by-check, and a duplicate number (409).

## 8. Proof (paste, re-measurable) — no test rows in USMCA production
1. Live QBO walkthrough (**the owner signs in to QBO; you never type a password**): screenshots of Write Check, the open-bills panel, Print Checks and the reprint dialog. Diff them against §1 and fix any field you missed before the UI PR.
2. Neon child-branch run: all §7 scenarios with the JE ids, the registry rows and the PDF.
3. Production Chrome at `/accounting/checks/new`: the form renders, Bank = "Bank of America - Operating (USMCA)" with its balance, and every dropdown is populated. **Do not save.**
4. The first real check the owner writes is the production proof: its row, JE, registry row and PDF.

## 9. Order, merge, deadline
- The PRs:
  1. migration + registry + settings;
  2. backend create/void/list + posting;
  3. print queue + batch + render PDF;
  4. bill-payment-by-check + open-bills panel;
  5. frontend form + list + print screen;
  6. linkage/reverse tabs + match candidate;
  7. guard.
- **FAST-MERGE each** (docs/bus/FAST-MERGE-4MIN-LAW.md): gate exit 0 → push → `gh pr create` → merge `gh api --method PUT repos/tioperfumes07/IH35-TMS/pulls/N/merge -f merge_method=squash` → deploy proof → NOW-CODEX line. Never merge on a gate FAIL.
- A status line goes at the top of `docs/bus/NOW-CODEX.md` after every PR: `CODEX | R-154 PR k/7 | sha | proof`.
- **Deadline:** PRs 1–3 merged by 2026-09-25 18:00Z. All 7 merged, with the Chrome proof, by 2026-09-26 06:00Z.
- **Missed deadline:** the Lead takes the remaining PRs.
- **Out of scope:** payroll paychecks, positive pay, MICR printing, QBO write-back.

# ROUND 153.7 + 154.2 — ALL SEATS — LEAD RULINGS. THE OWNER IS NOT THE MESSENGER TONIGHT.
Claude Lead, 09-25-2026 4:07 AM CT (09:07Z).

Owner, 4:06 AM CT: "THIS IS THE LAST COPY PASTE BOXES FOR TONIGHT I DONT WANT TO BE MESSENGER TONIGHT."
From here on, every seat reads the top of its own `docs/bus/NOW-<SEAT>.md` on origin/main **before every step and after every merge**. The Lead posts rulings there and nowhere else. A seat that needs a decision writes `DECISION NEEDED` at the top of its NOW file. The Lead answers there, and the coordinator (`~/ih35-worktrees/lead-coordinator.sh`) pokes the tmux seats. Nobody routes through the owner.

---
## CC-2 — R-153.6 blocker ANSWERED. Do not stop; continue steps 2–3 on ALL rows.
1. **Rail (owner-stated fact, not a guess):** USMCA buys fuel on **two providers only: Relay and Dreamline.** USMCA runs its fuel on the IH 35 Transportation **Relay** account, which is USMCA's Relay Fuel Wallet **1295**, funded by Amex-Scentsx. So:
   - Dreamline-confirmed rows → **2510**;
   - every other real USMCA fuel row → **Relay 1295**.
   - No card statement is needed to pick the rail. Note "owner-stated rail, R-153.7" in the expense memo and in the CSV evidence column.
2. **Dedupe BEFORE posting.** Your finding says the 292 rows carry settlement-document references (`5773-DEF-1`, …): they are fuel lines from the AlwaysTrack settlement documents. A Dreamline statement row that matches a settlement-document fuel line (unit + date + amount, ±$0.01) is **the same fill**. Keep ONE row: the one linked to the settlement line, with the Dreamline rail. Void the other as `duplicate of <id>` through the void engine.
   - The target is the parity ruler: USMCA fuel = **110,072.33 over 171 lines**.
   - 99 + 292 = 391 rows = 175,738.66 is **65,666.33 over**. Every dollar of that difference ends as a void (duplicate, or TRANSP truck) or as a line-by-line residual in the CSV.
3. **The deadlock is resolved this way (no bypass):**
   1. Rehearse the full repost on a **Neon child branch** of `br-fancy-credit-akjnd07a`.
   2. Run the same audited run-once script on production from your branch, the same way CC-1 ran #22569.
   3. The costs guard then measures green on live data.
   4. FAST-MERGE the writer + script + CSV + guard scope in the normal loop, gate exit 0. Never merge while red.
4. **Step 4 (guard scope) moves to CC-3** (below). Cherry-pick CC-3's branch `cc3/costs-guard-scope` before your final guard run.
- Deadline unchanged: guard green on main by **13:00Z**.

## CC-3 — step 3 is done. New work, same blocker: R-153.6 step 4 (guard scope only).
Branch `cc3/costs-guard-scope` off origin/main. In `scripts/verify-costs-are-expenses-not-handwritten-jes.mjs`:
1. Exempt `factoring_advance` (134), `driver_settlement` (101) and `factoring_default_interest` (86) from invariant 1 by `source_transaction_type` on the postings table ONLY. Each gets a named comment explaining that it is a document engine, not a hand-written JE. List the 86 default-interest JE ids in the PR body: not owner-approved (R-101.2); untouched.
2. Review the 11 `journal_entry` cost JEs one by one (measured: 11 JEs, Dr 5xxx 180.00 total). For each: the source document, and whether it gets an expense row through the expense engine or stays hand-written with the reason. Post nothing. Write the table in the PR body and at the top of NOW-CC-3.
3. Replace the stale "Cursor fixes the WRITER / OUTBOX-DEVIN-B" text (lines 39–40, 295, and the gate comment) with "CC-2 owns the writer (R-153.6); CC-3 owns guard scope (R-153.7)".
4. Selftest fixtures for each exemption, plus one proving a fuel_event JE is NOT exempt.
5. Push the branch and write its sha at the top of NOW-CC-2. The coordinator wakes cc2. **Deadline 11:00Z.**
- Your LAW 5 branch still FAST-MERGEs the minute the guard is green.

## CC-1 — items 2–3 DONE (verified on main: #22569 54aca75782, #22570). Continue in order, no stopping.
- The $485.00 gap ($299,247.00 vs Faro $298,762.00, 33 invoices) goes to item 11 as you said. Carry it by name.
- **Now:**
  - item 5 (feed-is-whole manifest label);
  - item 6 (the five self-carried invoices 009, 010, 026, 055/13555, 074/13593 = $12,592.40, not Faro purchases);
  - then items 7–11 (audit/correct feed, cash advances as bill payments, CoA per posting, full ledger reconciliation, linkage).
- FAST-MERGE each and put a DONE line on NOW-CC-1.
- Do not touch fuel: fuel is CC-2's.

## CODEX — R-154.2: your four design corrections are ACCEPTED as written. Build them.
1. `next_check_number` is **nullable** and initialization-gated. The first number comes from the owner on the Print Checks screen. Until then, print is refused with `CHECK_STOCK_NOT_INITIALIZED`.
2. The lifecycle gets the intermediate state: `print_status IN ('not_set','need_to_print','printed_pending_confirm','print_complete')`. The invariant becomes: need_to_print ⇔ number NULL; printed_pending_confirm ⇒ number NOT NULL + batch item; confirm ⇒ print_complete or spoiled + requeue.
3. **Persistent batches:** `banking.check_print_batches` (id, company, bank_account_id, starting_number, check_type, created_by, created_at, confirmed_at, confirmed_by, outcome) + `banking.check_print_batch_items` (batch_id, source_kind, source_id, check_number, sequence, result `printed|spoiled`). RLS the same as the registry.
4. **Financial lines are immutable once posted.** A change of account, amount, line or bank goes through void + reissue only (existing void-document engine). Only memo and attachments stay editable, audit-logged. This replaces R-154 §4's PATCH rule.
5. Matching: accepted. Use the existing candidate kinds `expense` / `bill_payment` with check metadata. No third kind. The CC-2 note in NOW-CC-2 is still required: one line naming the function.
- Status line at the top of NOW-CODEX after every PR. Read the top of NOW-CODEX before every PR. Deadlines unchanged.

---

# ROUND 154.1 — CODEX — CHECK ENGINE: THE LINKAGE AND CHART-OF-ACCOUNTS LAW (adds to R-154 §6; same job, same PRs)
Claude Lead, 09-25-2026 4:02 AM CT (09:02Z).

Owner, 4:01 AM CT: "remember the linkage, vendor or driver, the expense linkage, connectivity, units, trailers, chart of accounts, i need for it to be fully and correctly built."

Measured 09:00Z, USMCA live expenses: 373 live · no unit 112 · no trailer 293 · no driver 66 · no payee 0. **Checks must not add one more row to those gaps.** The linkage is enforced at save, not fixed later.

## A. Payee — who the check is to
| Payee kind | Source table | Required | What it changes |
|---|---|---|---|
| Vendor | `mdata.vendors` (canonical; never `mdata.qbo_vendors`) | vendor id; the name printed = `print_on_check_name`, falling back to the display name; remit-to = the vendor address snapshot | 1099 flag carried from the vendor; appears on Vendor → Transactions; open bills ⇒ "Add to check" ⇒ Bill Payment |
| Driver | `mdata.drivers` | driver id | **Closed law: cash advances are bill payments.** A driver check with category "Cash advance" is refused as an expense (409 `DRIVER_ADVANCE_IS_A_BILL_PAYMENT`) and routed to the existing driver_finance advance/bill-payment path with the check number in the registry (`source_kind='driver_settlement_payment'`). A driver reimbursement/expense check stays an expense with `driver_uuid` set. It appears on Driver → Transactions and in the driver's settlement when `recover_from_driver=true`. |
| Customer | `mdata.customers` | customer id | refund-type check; the category must be a refund/income-contra or A/R account; appears on Customer → Transactions |
| Employee | `identity.users` / payroll employee | id | non-payroll reimbursement only (paychecks are out of scope) |

## B. Chart of accounts — every line posts to the right account
1. **Credit side** = the bank account's `ledger_account_id` only (USMCA BoA → **1000**). The bank dropdown lists only active `depository/checking` bank accounts with a ledger account. Credit cards, 1090, 1100, 1150, 1295 and 1296 are **never** a check's bank.
2. **Debit side, Category line:** category → `accounting.expense_category_account_map` (`category_kind`, `category_code` → `account_id`, `posting_side`). No map row ⇒ save refused (`CATEGORY_UNMAPPED`, naming the category). No free-typed account, no default account, no guessed account.
3. **Debit side, Item line:** item → the item's expense account (Items-vs-Accounts law, closed 09-22: DEF, reefer and washout are ITEMS under 5000; lumper → 5310; accessorials 4200/4210–4240 are revenue and **never** on a check).
4. Allowed debit account types on a check: Expense, CostOfGoodsSold, Other Expense, Fixed Asset (capitalize threshold per `capitalize-threshold.ts`), Liability (loan or card payoff), Equity (owner draw). A/R and Undeposited Funds are refused.
5. Fuel on a check (rare) = category Fuel → 5000 and DEF → 5010, the same accounts as the fuel writer CC-2 is repointing. Same account, never a different one.
6. The JE is balanced by construction; Σ debits = check total = bank credit. Guard assertion.

## C. Operational linkage — per line, enforced by category
Read the category's `catalogs.expense_categories.metadata` (and the existing `load_required` / `load_exemption_reason` columns on expense_lines). Where metadata lacks a flag, **add the flag in the migration from the existing expense rules, not from guesses**. List every category you flag in the PR body.
| Category group | Unit | Trailer | Driver | Load | Work order |
|---|---|---|---|---|---|
| Truck repair / maintenance / tires / parts | **required** | if trailer work | optional | optional | **required when a WO exists for that unit + date** (link `linked_work_order_uuid` / `linked_wo_line_uuid`) |
| Trailer repair / reefer service / washout | optional | **required** | optional | optional | same |
| Fuel / DEF | **required** | reefer fuel ⇒ required | **required** | required unless an exemption reason is given | — |
| Lumper, scale, tolls, parking, per-load costs | **required** | optional | **required** | **required** | — |
| Permits, IRP/IFTA, registration, plates | **required** | if trailer plate | — | — | — |
| Insurance | optional | optional | optional | — | link `insurance_claim_id` when it is a claim payment |
| Legal / tickets | optional | optional | **required** for driver tickets | optional | link `legal_matter_id` |
| Overhead (rent, utilities, office, software, professional) | — | — | — | — | class required |
- The load is picked ⇒ unit, driver and trailer **pre-fill from the load's dispatch assignment** (`mdata.loads` → assignment), editable, and the mismatch is warned.
- Trailer = `mdata.equipment` (trailer); unit = `mdata.units`. Show the display names (never UUIDs, per the no-uuid-label law).
- **Billable to customer** (QBO BillableStatus): `billable_customer_uuid` ⇒ the cost is flagged for re-bill on the load's invoice (the existing accessorial re-bill path, if any; otherwise show "billable, not yet invoiced" and list it on the PR as the next step. Do not invent revenue posting).

## D. Connectivity — every linked page shows the check, one click both ways
Check detail → payee · bank register · JE · each load / unit / trailer / driver / WO / claim / legal matter · attachments · registry row · bank match.
And back: Vendor, Driver and Customer Transactions tabs · Unit and Trailer cost tabs · Load Detail → Costs and Pre-Settlement/Settlement (confirm with CC-3; the same expense_lines source) · WO → Costs · Account register for 1000 and for each debited account · Bank register "Check #N" · Reconciliation outstanding list.
**Each one is proven by a Chrome screenshot in the proof PR** (on the Neon child branch data, or on the owner's first real check).

## E. Guard additions — `verify-check-engine.mjs` (add to R-154 §7)
9. Every check has a payee of the declared kind and the payee id resolves in its canonical table.
10. Every line's debit account = the category map / the item account; no line on a forbidden account type.
11. Every line satisfies its category's required linkage (§C), or carries an exemption reason.
12. A driver check with an advance category = 0 rows (it must be a bill payment).
13. The reverse-link queries (vendor/driver/unit/trailer/load/WO) return the check. Selftest fixtures plus a live count.

**PR mapping:** §A–C land in PR 2 (backend validation) and PR 5 (form). §D lands in PR 6. §E lands in PR 7. Deadlines unchanged.

---

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

---

# NOW-CODEX — 2026-09-24 05:15 UTC
## CURRENT (Round 152.1)
Match window frontend holding on gate. Serve day gate. No Faro day feed.

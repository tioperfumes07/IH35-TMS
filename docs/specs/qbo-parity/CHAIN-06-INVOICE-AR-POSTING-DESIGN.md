# CHAIN-06 — Invoice → A/R Posting Engine (DESIGN DOC)

**Status:** `[HOLD-FOR-JORGE — TIER 1 FINANCIAL]` — design doc only. **No posting code, no migration, no
flag flip, no live post.** (§1.4 financial cluster: design docs + draft JE/SQL proofs only.)
**Entity:** TRANSP only (`operating_company_id = 91e0bf0a-133f-4ce8-a734-2586cfa66d96`). USMCA/TRK out of scope.
**Supersedes/extends:** `docs/blocks/HOLD-04-CHAIN-06-invoice-ar-receive-design.md` (the 2026-06-18 paper sketch).
This doc reconciles that sketch to what has since **actually been built** in the posting engine.

> **Load-bearing correction vs the old sketch:** the invoice→AR *engine* is **already implemented and
> tested** in `apps/backend/src/accounting/posting-engine.service.ts` (`buildInvoiceLines`), the
> payment side is wired, and the void reversal is wired. CHAIN-06 is therefore **NOT a green-field
> build** — it is (a) a **trigger-wiring + per-entity OFF-flag gate** at invoice issuance, (b) a
> **factoring reconciliation** so AR is not double-relieved, and (c) an owner cash-vs-accrual decision.
> Everything below cites exact file/symbol/column/migration names verified against the tree on this branch.

---

## 1. Purpose + gap

**Purpose.** When a customer invoice is *issued*, post the accrual A/R entry **DR Accounts Receivable /
CR Freight Revenue**, so `accounting.*` (the TMS ledger) becomes the authoritative source of A/R — a
prerequisite for QBO parity and eventually replacing QBO as system-of-record for AR. On customer
payment, post **DR Bank / CR Accounts Receivable**, relieving the receivable.

**Gap (live).**
- **QBO is system-of-record for A/R today.** Live QBO(TRANSP) A/R = **-$424,632.14 across 148
  customers** (net *credit* because invoices are sold to the factor Faro and advanced/reserved; the
  Faro→RTS migration is mid-flight — see memory `QBO Live Parity Ground Truth` + `docs/CLAUDE.md §3`).
- **TMS A/R is near-empty / not authoritative.** Per memory `QBO Live Parity Ground Truth`, TMS held
  ~1 invoice / 0 bills and ~4 net-zero GL postings — TMS was *not yet* the AR/AP source.
- **The invoice→AR posting engine EXISTS but is not triggered at issuance.** `buildInvoiceLines`
  posts DR `ar_control` / CR per-line income, but **no code path calls `postSourceTransaction` for a
  `source_transaction_type='invoice'` when an invoice is sent/issued** (verified: the only callers of
  `postSourceTransaction` are expenses, bill-GL draft, the generic posting-engine route, payment-apply,
  factoring poster, maintenance poster, recurring-bill generator, cash/driver advances — **none** in
  `invoices.routes.ts` at the send/issue transition). So AR only posts if someone hits the generic
  `POST /api/v1/accounting/posting-engine-mvp/post` route or the MVP backfill.
- **That generic route is role-gated but NOT feature-flag-gated** (`posting-engine.routes.ts`:
  `financeRoles = {Owner, Administrator, Manager, Accountant}`, no `isEnabled(...)` check) — so invoice AR
  can already post live with no per-entity OFF switch. CHAIN-06 must add the gate (§7).
- **Factoring complication.** Faro *buys* the invoice. If TMS posts DR AR / CR Revenue at issuance AND
  the existing factoring poster later relieves AR via a `customer_payment` JE, AR nets to ~0 — which is
  roughly what QBO shows. But the factoring **reserve** and **fee** legs are **not yet posted** (the
  factoring poster only emits the DR cash / CR AR payment JE; fee "lands in Block-25" per its own
  comment). So AR relief is modeled, reserve/fee are not. See §3 (factored path) + §10 (open decisions).

---

## 2. Trigger + inputs

### 2.1 Invoice issued (the AR debit)
- **Trigger point (to wire):** the invoice **draft → `sent`** (issue) transition in
  `apps/backend/src/accounting/invoices.routes.ts` (and the bulk send in `invoices-bulk.routes.ts`).
  Today that transition sets `status='sent'`, `sent_at`, but does **not** post. CHAIN-06 wires a
  flag-gated `postSourceTransaction({source_transaction_type:'invoice', source_transaction_id: <invoice.id>})`
  immediately after the status flip, on the same request.
- **Source table:** `accounting.invoices` (migration `0060_p3_t11_20_1_accounting_invoices_schema.sql`).
  Verified columns used by the poster: `id`, `operating_company_id`, `customer_id`, `display_id`
  (`INV-YYYY-NNNNN`), `status` CHECK `('draft','sent','partial','paid','void','factored')`,
  `source_load_id` (FK `mdata.loads`), `issue_date` (= JE `entry_date`), `subtotal_cents`, `tax_cents`,
  `total_cents`, `amount_paid_cents`, `amount_open_cents` (GENERATED = `total_cents - amount_paid_cents`),
  `voided_at`, `void_reason`, `factoring_advance_id` (nullable, from `202606120400_c2_factoring_profile.sql`).
- **Revenue source of truth (the CR side).** Per-line, **not** a single header account:
  - `accounting.invoice_lines` — `line_type` ∈ `('linehaul','fsc','detention','layover','lumper','tonu',
    'accessorial','tax','adjustment','other')`; `line_total_cents`; `display_order`; `description`;
    `qbo_item_id`; and **`account_id`** + `revenue_code` added by migration
    `0221_block_33_invoice_line_revenue_mapping.sql` (FK `invoice_lines.account_id → catalogs.accounts.id`).
  - The engine resolves each revenue line's income account as: **explicit `invoice_lines.account_id`**
    (Block 33) → else the line's Product/Service item income account
    (`catalogs.items.default_income_account_id`, joined via `qbo_item_id`, must be active + `is_postable`).
    **No default fallback** — a revenue line with no resolvable income account **fails closed**
    (`InvoiceRevenueAccountError` / `INVOICE_LINE_REVENUE_UNRESOLVED`, owner decision ACCOUNTING-1
    2026-06-30). The AR debit is the **sum of resolved revenue + header tax**, so the entry is balanced
    by construction regardless of `total_cents` drift.
  - **`mdata.loads.rate_total_cents` = GROSS customer rate** (memory + §4). It is the economic origin of
    invoice revenue; CHAIN-06 does **not** read `loads` directly for posting — it posts from
    `invoice_lines` (the invoice is the source document, `source_load_id` links back to the load).
- **Tax:** `invoices.tax_cents` > 0 → additional CR to the `sales_tax_payable` role account.

### 2.2 Customer payment (the AR credit) — already wired
- **Source table:** `accounting.payments` — `id`, `payment_date`, `amount_cents`, `display_id`,
  `deposited_to_account_id`, `voided_at`, `payment_method`, `customer_id`.
- **Application:** `accounting.payment_applications` (`payment_id`, `invoice_id`/`target_kind`+`target_id`,
  `amount_cents`) links receipt to invoice. `applyPayment` (`payments/apply.service.ts`) calls
  `postSourceTransaction('customer_payment', payment_id)` after applying — this is **already built**.

---

## 3. The JE template (explicit DR/CR; integer cents; TRANSP)

All amounts integer **cents**. Roles resolve via `resolveRoleAccountOptional(client, opco, <role>)`
(`coa-roles/resolver.service.ts`). `ar_control` and `ap_control` are **control roles → fail-closed** if
not uniquely designated. TRANSP `ar_control` = QBO-45 "Accounts Receivable (A/R)"
(migration `202606290072_ar_control_account_designation.sql`).

### JE-1 — Invoice issued (accrual). `source_transaction_type='invoice'`
| Line | Account (role / source) | DR | CR |
|---|---|---|---|
| 1 | **AR** — `ar_control` role (QBO-45) | `Σ revenue + tax` | |
| 2..n | **Freight Revenue** — per revenue line: `invoice_lines.account_id` → item `default_income_account_id` | | `line_total_cents` (each) |
| last | **Sales Tax Payable** — `sales_tax_payable` role (only if `tax_cents>0`) | | `tax_cents` |

*Matches QBO/NetSuite/GAAP: at invoice, **DR A/R, CR Income** (accrual recognition at delivery/issue).
Cash-basis note in §10.* Sources: QuickBooks A/R JE guidance; standard AR revenue recognition.

### JE-2 — Customer payment received (non-factored). `source_transaction_type='customer_payment'`
| Line | Account | DR | CR |
|---|---|---|---|
| 1 | **Bank / Cash** — `payments.deposited_to_account_id` → else `undeposited_funds` → `cash_clearing` role | `amount_cents` | |
| 2 | **AR** — `ar_control` role | | `amount_cents` |

*Matches QBO/NetSuite/GAAP: at receipt, **DR Cash/Bank, CR A/R**; P&L-neutral. Under strict cash basis
revenue would instead recognize here — see §10.* This is `buildCustomerPaymentLines` today.

### JE-3 — FACTORED invoice (Faro/RTS), GAAP factoring-**with-recourse**
Faro advances ~a % of face and holds a **reserve**, netting a **fee**. GAAP with-recourse pattern:
`DR Cash (advance)  +  DR Due-from-Factor / Factor Reserve Receivable  +  DR Factoring Fee Expense
(and, if a true sale, DR Loss on sale + CR Recourse liability)  /  CR Accounts Receivable (face)`.

**Target (full) factored settlement — one economic event, balanced:**
| Line | Account (role) | DR | CR |
|---|---|---|---|
| 1 | **Bank** — advance received (`cash_clearing` / bank) | `advance_cents` | |
| 2 | **Factor Reserve Receivable** — `factor_reserve_default` role (an **asset/receivable** — see §10 note) | `reserve_cents` | |
| 3 | **Factoring Fee Expense** — `expense_category_account_map` kind `factoring_fee` / code `default` | `fee_cents` | |
| 4 | **AR** — `ar_control` role | | `face_cents` (= advance + reserve + fee) |
| *(on reserve release)* | DR Bank / CR Factor Reserve Receivable for the released amount, net of any additional fee | | |

**What is built vs. not (critical, avoids double-post):**
- **Built:** `factoring-posting/poster.service.ts` (`postFactoringAdvanceEvent`,
  `postFactoringReleaseEvent`) creates `accounting.payments` rows (`payment_method='factoring_advance'`
  / `'factoring_reserve'`), applies them to the factored invoices via `payment_applications`
  (proportional allocation), then posts them as **`customer_payment`** JEs (JE-2 shape: DR cash /
  CR AR). So **AR relief on factoring is already modeled** as cash-like receipts.
- **NOT built:** the **reserve-receivable** and **fee-expense** legs (lines 2–3 above). The poster's
  `resolveFactoringPostingAccounts` *touches* `ar_control`, `factor_reserve_default`, `cash_clearing`,
  and the `factoring_fee` category **only to assert they resolve**; it does not yet emit reserve/fee
  postings ("Fee posting lands in Block-25" per its own comment). Net effect today: factoring relieves
  AR to ~0 via cash JEs, but reserve is treated as cash and fee is not expensed.
- **Double-post risk to resolve in §10:** if CHAIN-06 posts JE-1 at issuance **and** the factoring
  poster later posts `customer_payment` JEs for the same invoice, AR is correctly debited once (JE-1)
  and credited once per advance/release — **no double-post of AR**, provided JE-1 is the *only* AR debit.
  The risk is on the **reserve/fee economics**, not on AR itself. Do **not** add a second AR-debit path.

Sources (GAAP factoring): SuperfastCPA, Accounting-for-Management, Double-Entry-Bookkeeping,
CPA Journal (ASU 2016-15). Sources (QBO/AR): Intuit QuickBooks A/R help articles.

---

## 4. Exact reuse map (NO new GL math)

| Need | Reuse (verified symbol / file) |
|---|---|
| Post a source txn → balanced JE + batch + idempotency + audit spine | `postSourceTransaction(input, actor)` — `posting-engine.service.ts` |
| Build invoice AR+revenue+tax lines | `buildInvoiceLines()` (already handles per-line revenue + fail-closed) |
| Build payment DR bank / CR AR lines | `buildCustomerPaymentLines()` |
| AR control account (fail-closed, unique) | `resolveRoleAccountOptional(client, opco, "ar_control")` → `resolveControlRoleAccount` |
| Revenue account (per line) | `invoice_lines.account_id` → `catalogs.items.default_income_account_id` (in `buildInvoiceLines`) |
| Sales tax payable | `resolveRoleAccountOptional(..., "sales_tax_payable")` |
| Bank/cash for receipt | `payments.deposited_to_account_id` → `undeposited_funds` → `cash_clearing` |
| Factor reserve / fee roles | `factor_reserve_default` role; `resolveAccountForCategory(opco,"factoring_fee","default")` |
| Balance guarantee | `assertBalanced()` (DR==CR, both > 0) |
| Period lock | `ensureOpenPeriod()` → `accounting.closed_period_cutoff(opco)` |
| Idempotency key | `buildPostingMvpIdempotencyKey()` = `ih35:posting-mvp:v1:<opco>:<type>:<id>:<lineOrDash>:<purpose>` |
| Void/reverse | `postVoidReversal()` — `void.service.ts` (flips posted lines) / `reversePostedSourceTransaction()` |
| Feature flag | `isEnabled(client, KEY, {operating_company_id, user_uuid})` — `lib/feature-flags/service.js` |

**No new posting/GL math is written.** CHAIN-06 = trigger wiring + flag gate + factoring reconciliation.

---

## 5. Source-doc → JE → posting → reversal linkage

- **Source linkage:** `insertPostingLines` writes one `accounting.transaction_source_links` row per posted
  line (`journal_entry_posting_id`, `linked_object_type` = the source type e.g. `'invoice'`,
  `linked_object_id` = invoice id, `relationship_role` default `'source_transaction'`). Table:
  `0195_accounting_posting_backbone_schema.sql` (RLS company-scoped; unique idempotency added by
  `202606290001_uq_transaction_source_links_idempotency.sql`).
- **Ledger tables:** header `accounting.journal_entries` (`status='posted'`, `source='auto'`,
  `qbo_sync_pending=true`); lines `accounting.journal_entry_postings` (`account_id`, `debit_or_credit`,
  `amount_cents`, `source_transaction_type`, `source_transaction_id`, `posting_batch_id`,
  `idempotency_key`); batch `accounting.posting_batches` (`batch_status` queued→in_progress→posted).
- **`source_transaction_type` value = `'invoice'`** for the AR debit, `'customer_payment'` for the receipt.
- **Reversal:** invoice **void** (`invoices.routes.ts POST /:id/void`, gated `VOID_ENFORCEMENT_ENABLED`,
  Owner/Accountant only) calls `postVoidReversal(client,{entityType:'invoice', entityId, originalDate,...})`,
  which reads the posted lines by `source_transaction_type='invoice' AND source_transaction_id=<id>`,
  flips DR↔CR, and inserts a balanced standalone reversing JE (idempotency key `void:invoice:<id>` so a
  second void can't double-reverse). Closed-period → reversal dated in the current open period
  (`resolveReversalDate`). Alternatively `reversePostedSourceTransaction('invoice', id)` produces a
  batch-linked reversal (`posting_purpose='reversal'`). CHAIN-06 uses the existing void path — **no new
  reversal math.**

---

## 6. Idempotency + balance backstop

- **Idempotency:** the key `ih35:posting-mvp:v1:<opco>:invoice:<invoice_id>:-:initial_post` is unique per
  invoice; `getExistingPostingResultByIdempotencyKey` returns the prior result → re-issuing / re-triggering
  is a safe no-op (`result:'already_posted'`). `accounting.posting_batches (operating_company_id,
  idempotency_key)` has a partial unique index; `journal_entry_postings` has
  `uq_jep_company_idempotency_line`. Reversal uses a distinct `...:reversal` key.
- **Balance backstop:** `assertBalanced(draft.lines)` runs **before** any write (throws
  `UNBALANCED_ENTRY` if DR≠CR or either side ≤ 0). The AR debit is computed as `Σ revenue + tax`, so
  balance holds by construction. On error, `markBatchFailed` records a `'failed'` batch without masking
  the original error. **Design assumption to verify:** a DB-level trigger asserting per-JE debit=credit
  on `journal_entry_postings` is the belt-and-suspenders backstop — confirm it exists in
  `db/migrations/` (posting backbone) before flag-on; if absent, add it as a gated migration.

---

## 7. Flag-gating (per-entity, OFF, fail-closed)

- **New flag:** **`INVOICE_AR_GL_POSTING_ENABLED`** — per-entity, **default OFF**, resolved via
  `isEnabled(client, "INVOICE_AR_GL_POSTING_ENABLED", {operating_company_id, user_uuid})`, mirroring
  `EXPENSE_GL_POSTING_ENABLED` / `BILL_GL_POSTING_ENABLED`.
- **Gate points:** (a) the invoice issue/send transition in `invoices.routes.ts` +
  `invoices-bulk.routes.ts` — when OFF, the status flip proceeds but **no JE posts** (no-op, current
  behavior). (b) **Harden the generic route:** `posting-engine.routes.ts POST /posting-engine-mvp/post`
  currently posts invoices with **no flag check** — add the same gate for `source_transaction_type='invoice'`
  so there is a single per-entity kill switch. (The customer-payment leg stays as-is since it is already
  live via `applyPayment`; if Jorge wants payment posting also gated, add `CUSTOMER_PAYMENT_GL_POSTING_ENABLED`
  — surfaced in §10, not assumed.)
- **Fail-closed:** missing/ambiguous `ar_control` → `ControlAccountDesignationError`
  (`CONTROL_ACCOUNT_NOT_UNIQUELY_DESIGNATED`); unresolved revenue line →
  `InvoiceRevenueAccountError` (`INVOICE_LINE_REVENUE_UNRESOLVED`); missing `sales_tax_payable` when tax>0
  → `ACCOUNT_MAPPING_MISSING`. Refuse to post rather than post to a wrong/default account.
- **Rollout:** flag stays OFF in prod; enable on a **Neon test branch** first, run the exercise plan,
  tie AR to QBO, then Jorge flips per-entity for TRANSP. Never flip solo (§1.4).

---

## 8. Draft SQL proof (dry-run; commented; NOT for execution)

```sql
-- ============================================================================
-- CHAIN-06 DRAFT JE PROOF — DO NOT RUN. Illustrative of what the ENGINE emits.
-- Real posting is done ONLY by postSourceTransaction (never hand-written SQL).
-- opco = TRANSP 91e0bf0a-133f-4ce8-a734-2586cfa66d96 ; ar_control = QBO-45.
-- ============================================================================

-- (A) INVOICE ISSUED — $3,400.00 linehaul, no tax.  source_transaction_type='invoice'
--   JE header: accounting.journal_entries (entry_date=invoices.issue_date, source='auto')
--   Lines (accounting.journal_entry_postings):
--     seq1  DR ar_control(QBO-45)                    340000  -- Σ revenue + tax
--     seq2  CR <invoice_lines.account_id / item income> 340000  -- Freight Revenue (per line)
--   assertBalanced: DR 340000 == CR 340000  ✔  ;  each line → transaction_source_links(linked_object_type='invoice')

-- (B) CUSTOMER PAYMENT in full to ops bank.  source_transaction_type='customer_payment'
--     seq1  DR <payments.deposited_to_account_id | undeposited_funds | cash_clearing> 340000
--     seq2  CR ar_control(QBO-45)                    340000
--   assertBalanced ✔  ; invoice amount_open_cents 340000 -> 0 ; status sent -> paid.

-- (C) FACTORED invoice $10,000.00: advance 90% = 900000, reserve 8% = 80000, fee 2% = 20000.
--   TARGET full economic JE (reserve/fee legs = §3 lines 2-3, NOT YET BUILT):
--     seq1  DR bank (cash_clearing)                  900000   -- advance
--     seq2  DR factor_reserve_default (asset)         80000   -- reserve receivable
--     seq3  DR factoring_fee expense                  20000   -- fee
--     seq4  CR ar_control(QBO-45)                    1000000  -- face relieved
--   assertBalanced: DR 1000000 == CR 1000000 ✔
--   CURRENT BEHAVIOR (factoring poster): posts these as customer_payment JEs (DR cash / CR AR)
--   for advance + reserve amounts; fee not expensed, reserve booked as cash. Reconcile in §10.
```

---

## 9. Tests to write

1. **`posting-engine.service.test.ts` (extend):** invoice issue posts DR `ar_control` = Σ(revenue)+tax,
   CR each line's income account, CR `sales_tax_payable`; asserts balanced; asserts
   `transaction_source_links` rows (`linked_object_type='invoice'`).
2. **Fail-closed:** revenue line with no `account_id` and no item income account →
   `INVOICE_LINE_REVENUE_UNRESOLVED`; ambiguous/absent `ar_control` → `CONTROL_ACCOUNT_NOT_UNIQUELY_DESIGNATED`.
3. **Idempotency:** re-trigger same invoice → `already_posted`, exactly one batch/JE.
4. **Flag gate:** with `INVOICE_AR_GL_POSTING_ENABLED` OFF, issue transition writes no JE; ON → posts.
   Add a route test proving the generic `posting-engine-mvp/post` refuses invoice posting when OFF.
5. **Payment relief:** `applyPayment` → DR bank / CR AR; invoice `amount_open_cents`→0, status→`paid`.
6. **Void reversal:** issue → void → `postVoidReversal` inserts a flipped balanced JE; second void no-ops
   (idempotency `void:invoice:<id>`); closed-period void dates into current period.
7. **Factoring reconciliation:** factored invoice AR is relieved **exactly once** in total across
   advance+release (no double AR credit vs. JE-1's single AR debit).
8. **CI static guard:** `verify:invoice-ar-single-source` (mirror of `verify:bill-resolver-single-source`)
   — assert AR-debit resolution for invoices lives only in `buildInvoiceLines` + `ar_control` role; no
   second invoice-AR poster; the generic route is flag-gated for `invoice`.

---

## 10. OPEN DECISIONS for Jorge (surfaced, not resolved)

1. **Cash-basis vs accrual AR timing (drives JE-1's CR).** Memory `Expense GL Cash-Basis Decision`
   locks TRANSP as **cash basis** (books + MOR). Under strict cash basis, revenue recognizes at
   **receipt** (JE-2), and JE-1 would either be suppressed or carried as an accrual presentation with a
   `cash_basis_adjustment_equity` reversal. Options: **(A)** post accrual JE-1 at issue + rely on the
   existing cash-basis report transform (Block-20 `?basis=cash`) for MOR — AR is authoritative,
   cash-basis P&L derived; **(B)** defer revenue to JE-2 (pure cash) — then TMS AR balance is not a GL
   receivable. Recommendation to confirm: **(A)** (AR authoritative + report-time transform), consistent
   with how the engine already posts. **CPA/owner call.**
2. **Factoring posting model — is AR *sold* to the factor or *held*?** Faro is with-recourse
   factoring; GAAP allows sale vs. secured-borrowing treatment (ASU 2016-15). Decide: does relieving AR
   via the factoring `customer_payment` JE correctly represent a **sale**, or should factored AR move to
   a **"Factored AR / Due-from-Factor"** control and a **recourse liability** be booked? This determines
   whether the reserve/fee legs (§3 lines 2–3) are added and whether a loss-on-sale is recognized.
3. **`factor_reserve_default` role type.** `coa-roles/resolver.service.ts` fallback classifies
   `factor_reserve_default` as a **Liability** (`type:["Liability"]`). But the GAAP reserve is a
   **receivable/asset** (due-from-factor). Confirm the *actual designated account's* type for TRANSP —
   if it's a liability, the reserve leg would post to the wrong side. (Contrast memory
   `Driver Escrow = Liability`: escrow is a liability; the *factoring reserve is an asset* per
   `QBO Live Parity Ground Truth`.) **Do not post reserve until this is resolved.**
4. **Faro vs RTS treatment during migration.** Mid Faro→RTS (memory `QBO Live Parity Ground Truth`,
   `docs/CLAUDE.md §3`). Are both factors' advances/reserves modeled with the same roles, or does RTS get
   its own `factor` row (`factoring.factor`, migration `0289`) and distinct reserve/fee accounts? The
   `factoring.*` tables (`factoring.factor`, `customer_factor_assignment`, `reserve_movement`, `batch`,
   `bank_match_suggestion`, migrations `0286–0290`) already model this — CHAIN-06 must post **from**
   those events, not invent a parallel model.
5. **Double-post avoidance vs the `factoring.*` engine.** The existing `factoring-posting/poster.service.ts`
   already creates `accounting.payments` + `payment_applications` and posts `customer_payment` JEs from
   factoring advances/releases. Confirm CHAIN-06's invoice-issue JE-1 is the **single AR debit** and the
   factoring poster is the **single AR relief** for factored invoices — i.e. do NOT also mark factored
   invoices `paid` through a second (manual `applyPayment`) path, or AR would be over-relieved.
6. **Should customer-payment posting also be flag-gated?** It is currently **live** (no flag) via
   `applyPayment`. If invoice AR goes behind `INVOICE_AR_GL_POSTING_ENABLED` OFF but payments keep
   posting CR AR, AR could go negative for un-issued invoices. Recommend gating both with one flag, or
   sequencing flag-on so issuance posts before payments. **Owner call.**
7. **Duplicate A/R account cleanup.** `202606290072` designates QBO-45 as `ar_control` but deliberately
   left native account `1100 "Accounts Receivable"` (qbo_account_id NULL) active — a duplicate A/R pair.
   Owner-only decision whether to deactivate/merge `1100` before AR goes authoritative (§1.6).

---

### Guardrails (carry-forward)
Reuse existing engine + invoices/payments/factoring infra · **no new GL math** · flag **OFF** · no live
post · no migration in this doc · fail-closed on `ar_control`/revenue/tax · `[HOLD-FOR-JORGE — TIER 1]`,
never self-merged (§1.4). Definition of done for the eventual build: local + CI green, tie TMS AR to QBO
A/R on a Neon branch with the flag ON, then Jorge flips per-entity.

**Research sources.** GAAP factoring-with-recourse journal entries:
[SuperfastCPA](https://www.superfastcpa.com/example-journal-entries-for-factoring-trade-receivables/),
[Accounting For Management](https://www.accountingformanagement.org/factoring-accounts-receivable/),
[Double Entry Bookkeeping](https://www.double-entry-bookkeeping.com/accounts-receivable/factoring-receivables/),
[CPA Journal — Factor or Fiction under ASU 2016-15](https://www.cpajournal.com/2020/08/24/factor-fiction-under-asu-2016-15/).
QuickBooks A/R invoice/payment & cash-vs-accrual behavior:
[Intuit — Apply a JE credit to an invoice](https://quickbooks.intuit.com/learn-support/en-us/help-article/journal-entries/apply-journal-entry-credit-invoice/L6SrExcv1_US_en_US),
[Intuit — Resolve AR/AP on a cash-basis balance sheet](https://quickbooks.intuit.com/learn-support/en-us/help-article/list-management/resolve-r-p-balances-cash-basis-balance-sheet/L7hez2k07_US_en_US).

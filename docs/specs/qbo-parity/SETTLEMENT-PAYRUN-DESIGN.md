# Settlement Pay-Run / Batch Disbursement — Design Doc

**Lane:** Tier 3 — design only. Nothing ships behind this until Jorge reviews and a future build block is opened.
**Author:** CODER. **Date:** 2026-07-12 (Central).
**Status:** DRAFT for Jorge review. No app code, no migration, no posting, no flag flip is authored by this doc.

> Tracker task-ID: **TBD — assign at build phase** (do not invent one now).

---

## 0. Preview-from-live evidence (read before any design line)

### 0.1 Live `driver_finance.*` schema (Neon prod, project `tiny-field-89581227`, default branch, read-only `information_schema`, 2026-07-12)

**`driver_finance.driver_settlements`** (settlement header — VERIFIED live columns):
`id, operating_company_id, display_id, driver_id, period_start (date), period_end (date), status (text),
gross_pay (numeric), deductions_total (numeric), reimbursements_total (numeric), net_pay (numeric),
acknowledged_at, acknowledged_by_user_id, locked_at, paid_at, paid_via_bank_txn_id, payment_state (text),
payment_queued_at, payment_sent_at, payment_cleared_at, payment_bank_reference, payment_bounced_reason,
payment_method, first_load_id, first_load_number, last_load_id, last_load_number, trip_started_at,
trip_closed_at, settlement_model, pay_method, reversed_at, reversed_by_user_id, reversal_reason.`

**`driver_finance.settlement_lines`**: `id, settlement_id, line_type (text), description, amount (numeric),
team_id, source_driver_bill_id, created_at, operating_company_id, auto_deduction_policy_id.`

**`driver_finance.driver_advances`** (cash-advance infra ALREADY EXISTS): `id, operating_company_id,
display_id, driver_id, liability_id, amount (numeric), purpose, disbursement_method, disbursement_status,
recipient_type, recipient_name, linked_bill_id, linked_bill_payment_id, linked_bank_txn_id,
disbursement_reference, requires_owner_approval, created_by_user_id, disbursed_at, status,
outstanding_balance (numeric), memo, posting_date (date), linked_driver_bill_id, load_id.`

**`driver_finance.driver_settlement_deductions`**: `id, operating_company_id, driver_id, deduction_type,
amount_cents (bigint), reason, applied_to_settlement_id, source_pending_id, remaining_balance_cents (bigint),
status, load_id, bucket_id, source_expense_id, source_bank_transaction_id, created_by_user_id.`

**`driver_finance.driver_deduction_buckets`**: `total_obligation_cents, installments_total,
installments_applied, charged_to_date_cents, deducted_to_date_cents, remaining_balance_cents, status …` (cents).

**`driver_finance.driver_liabilities`**: `original_amount (numeric), current_balance, paid_to_date, type,
origin, origin_id, status …`.

**`driver_finance.driver_advance_accounts`**: `operating_company_id, driver_id, coa_account_id …` (per-driver
Cash-Advance ASSET sub-account bridge).

**Escrow infra (live):** `accounting.escrow_accounts`, `accounting.escrow_postings` (GL-backed, balance-conserving),
`driver_finance.escrow_balances`, `driver_finance.escrow_deductions_pending`, `driver_finance.escrow_ledger`,
`driver_finance.driver_escrow_separations` (the 90-day separation-return gate).

**Non-duplication proof (LINKAGE-LAW C2):** a live query for `driver_finance` tables matching
`batch|pay_run|payrun|disburse` returned **ZERO rows** — no pay-run/batch table exists on prod. The proposed
`driver_finance.settlement_batches` is genuinely new (no split-brain).

> ⚠️ **UNITS GOTCHA (must be reconciled in the build):** `driver_settlements.gross_pay / net_pay /
> deductions_total` and `settlement_lines.amount` are **`numeric` (dollars)**, while
> `driver_settlement_deductions.amount_cents` and `driver_deduction_buckets.*_cents` are **`bigint` cents**.
> The batch total must pick ONE unit and convert consistently. Recommend the batch store **`numeric` dollars**
> to match the settlement header it sums (net_pay), converting the cents-based deduction subledger on read.
> (My earlier WIP build used `total_cents bigint` — that is the WRONG unit vs `driver_settlements.net_pay`; the
> build must use numeric dollars.)

### 0.2 Current Settlements screen (read from source — live DOM/screenshot **UNVERIFIED**: the app can't run in this environment, backend deps won't install)
Source: `apps/frontend/src/pages/driver-finance/SettlementsPage.tsx`. The real current screen has:
- Two tabs: **Settlements** and **Disputes** (`?tab=`), and a `settlement_id` deep-link to `SettlementDetailPage`.
- A **"Payment Pipeline"** filter row of buttons: All / **unpaid / queued / sent_to_bank / cleared / bounced**
  (the live `payment_state` machine on `driver_settlements`).
- KPI counts: `total_unpaid` (status ≠ 'paid'), `held_deductions` (status = 'held').
- `SettlementsTable`, `SettlementDisputesTab`. A subnav includes "Pay Rate Templates".
The pay-run surface **builds on this existing screen** (a new tab / section under the same Settlements area) —
**NO new sidebar item** (18 locked).

### 0.3 Specs read
- `docs/specs/ARCHITECTURE-BLUEPRINT-2026-07-05.md §3` — **SETTLEMENT POSTING = Bill + BillPayment (LOCKED):**
  a driver settlement posts as a **Bill + BillPayment** (driver = a **vendor**, for A/P aging + **1099/W-8BEN**),
  **not** a single JE. Canonical engine = `driver_finance.driver_settlements` + `driver_settlement_deductions`
  (`payroll.*` retired). Example posting: `Bill (gross): Dr driver-pay expense / Cr A/P`; `BillPayment (net):
  Dr A/P 1,240 / Cr Wells Fargo — DIP (WF 6103) 1,240`.
- Same §: **money-posting flags are per-entity-only, default OFF**; `SETTLEMENT_GL_POSTING_ENABLED` is currently
  **OFF pending the settlement build**; **TRANSP first**, with a real Bill+BillPayment proof before each flip;
  **USMCA from 0, TRK < 30 txn/mo. No CPA gate — Jorge decides directly.**
- `docs/specs/SETTLEMENT-ENGINE-CANONICAL.md`, `docs/specs/ACCOUNTING-ARCHITECTURE.md` — canonical engine + the
  Faro factoring terms (factoring is **customer-side A/R**, see §5).

---

## 1. Standards-parity research (fresh, 2026-07-12 — cited)

| Capability | McLeod LoadMaster | Alvys | QuickBooks | NetSuite | IH35 today | Verdict for IH35 |
|---|---|---|---|---|---|---|
| Settlement close → statement | Automated pay (hourly/mile/trip/salary), doc-gated auto-rate→settlement (FlowLogix) | Real-time automated settlements, custom pay structures | n/a (GL only) | n/a | `driver_settlements` close + lock + acknowledge exist | **meets** on close; **gap** on batch pay-run |
| **Batch pay-run / check register** | "list of PAID settlements w/ check #, date, amount" (a check-run) | batch settlements | Pay Bills batch | **Electronic Bank Payments: payment BATCH = collection of outstanding vendor bills per bank account** | **NONE** (per-settlement payment state only) | **GAP → this block** |
| Advance issuance + recovery | driver advances recovered on settlement | advances | advance-to-supplier = **prepaid asset**; applied to bill | **vendor prepayment applied to bills oldest→newest**, reduces amount owed | `driver_advances` (outstanding_balance, load_id, linked bill/bill-payment, requires_owner_approval) **already exists** | **meets infra**; recovery-at-close needs wiring |
| Driver self-serve paystub | Driver portal: settlement PDF + check details | Driver Mobile App paystubs + "View Paystubs" permission | n/a | n/a | backend list/pdf/acknowledge exist; **no driver-PWA screen** | **gap** (separate driver-PWA block) |
| Void / reversal | reversing entry | reversal | reverse bill payment | reverse | `driver_settlements.reversed_at/by/reason` columns exist; JE-void model shipped (#2415/#2417) | **meets** (reuse reversing-JE model) |

**Net:** the pay-run/batch (NetSuite "payment batch" analogue) is the one **genuinely-missing best-in-class
primitive**. Advance issuance/recovery and void already have the canonical infra to reuse — **surpasses** parity
if we wire advance-recovery into the pay-run close cleanly. The driver-PWA paystub is a separate parity gap.

---

## 2. Locked frame (constraints — encoded, NOT re-decided)
- **Per-entity always.** A pay-run is scoped to ONE `operating_company_id`; never spans TRANSP/TRK/USMCA.
  `operating_company_id` + FORCED RLS on the batch header **and** every batch line. A cross-entity batch is a defect.
- **Canonical `driver_finance.*`** — new tables `driver_finance.settlement_batches` (+ line/member table). Do NOT
  create a second settlement ledger; do NOT undo CHAIN-07's redirect of the accounting settlements surface.
- **Reuse existing GL posters — NO new GL math.** Settlement posts **Bill + BillPayment** via the existing
  poster; the DB trigger `balance_to_cent_or_abort` already enforces cent-balance — reuse, don't rebuild.
- **Void = reversing entry** (consistent with #2415/#2417 JE-void model). Never a status flip. Void-not-delete
  everywhere (`is_active`/`reversed_at`; grants carry no DELETE).
- **Additive-only.** Surface under the existing Driver Finance / Settlements area. NO new sidebar item (18 locked).
- **Money flags default OFF.** `SETTLEMENT_GL_POSTING_ENABLED` (existing, per-entity, OFF) gates settlement
  posting; a new per-entity `SETTLEMENT_PAYRUN_DISBURSE_ENABLED` (default OFF) gates the disbursement RECORD.
  Flipping to live posting/disbursement is **Jorge's sole decision — no CPA gate**; QBO stays source of truth,
  TMS + QBO run parallel until Jorge judges the software trustworthy via Neon tie-out / balanced-JE proof.

---

## 3. Workflow spine (Jorge-confirmed — the design specifies each stage)

**TRIGGER — settlement close.** A driver is paid when his **settlement CLOSES**. The pay-run assembles
**CLOSED, APPROVED (acknowledged/locked), UNPAID** settlements for **one entity**.
→ *Grain is OPEN — see Issue I1.*

**CASH ADVANCES (issuance + recovery).**
- **Issuance (mid-trip):** money out to the driver BEFORE settlement = a **driver advance** — REUSE the existing
  `driver_finance.driver_advances` (`amount`, `outstanding_balance`, `load_id`, `liability_id`,
  `disbursement_method/status`, `requires_owner_approval`, `linked_bill_id/linked_bill_payment_id/linked_bank_txn_id`).
  GL design (behind OFF flag, nothing posts): advance issuance = **prepaid/receivable** to the per-driver
  Cash-Advance ASSET sub-account (`driver_advance_accounts.coa_account_id`) — Dr Driver-Advance asset / Cr bank.
  Distinct from Relay fuel — **never conflate** (Relay is a fuel-card funding path, not a driver AP advance).
- **Recovery (at close):** the advance is recovered as a **deduction** reducing net pay, written as a
  `driver_settlement_deductions` row (`deduction_type='advance_recovery'`, `applied_to_settlement_id`,
  `load_id`) with a **both-way link** to the `driver_advances` row; the advance's `outstanding_balance` is
  reduced and its `status` marked settled when zeroed. GL (OFF flag): recovery nets the Bill (reduces net A/P) —
  mirrors NetSuite "vendor prepayment applied to bill" / QBO "prepaid asset applied". No new GL math — the Bill
  already carries deduction lines.

**NET PAY per driver** = gross earnings − deductions − escrow holdback − cash advances − chargebacks, enforced by
`balance_to_cent_or_abort`. (All from live columns: `gross_pay`, `deductions_total`, escrow via `escrow_*`,
advances via `driver_advances`.) **Reconcile the numeric-dollars vs cents unit split (§0.1) at build.**

**APPROVAL GATE (Jorge-confirmed).** A pay-run is approved by **Owner, Administrator, or Accountant**.
**Maker ≠ checker** — the person who assembles the batch cannot be its sole approver; **approval is where the
per-entity money-flag resolves** (nothing posts/disburses until an authorized approver acts on a flag-ON entity).

**POST.** Each member settlement posts its **Bill + BillPayment** (payable + escrow holdback → escrow liability)
via the existing posters, gated by `SETTLEMENT_GL_POSTING_ENABLED` (per-entity, OFF).

**DISBURSE.** Batch → payment method. **TMS RECORDS the disbursement; it NEVER sends money** — the actual
payment is the owner's hand / an external rail (software-initiated payment is prohibited, constitution §1.6).
The bank transaction links back **both-way** to the batch (`driver_settlements.paid_via_bank_txn_id` already
exists per settlement; the batch adds a batch↔bank-txn link). Gated by `SETTLEMENT_PAYRUN_DISBURSE_ENABLED` (OFF).

**VOID / REVERSE.** Void-not-delete; a **reversing entry** (reuse the #2415/#2417 JE-void model and the existing
`driver_settlements.reversed_at/reversed_by_user_id/reversal_reason`). Never a status flip.

---

## 4. Proposed tables (design only — build block authors the migration)
- **`driver_finance.settlement_batches`** — `id, operating_company_id (NOT NULL, FORCED RLS), period_start,
  period_end, status (draft→approved→posted→disbursed→paid; void via reversed_*), total_amount (numeric dollars,
  matches net_pay), approved_by_user_id, approved_at, disbursed_at, disbursement_bank_txn_id, is_active, audit
  cols`. Void-not-delete; grants SELECT/INSERT/UPDATE (no DELETE).
- **`driver_finance.settlement_batch_members`** — `id, operating_company_id (FORCED RLS), batch_id FK,
  settlement_id FK → driver_settlements`, **UNIQUE (operating_company_id, settlement_id)** so a settlement joins
  ≤1 batch (no double-payment). Same-entity FK.
- Reuse (no new table): `driver_advances` (advance + recovery), `driver_settlement_deductions` (recovery line),
  `escrow_*` (holdback), `accounting.bills`/`bill_payments` (the Bill+BillPayment posting), the reversing-JE poster.

---

## 5. Linkage matrix (both-way — declare or explicit N/A)
- **batch ↔ member settlements** (`settlement_batch_members`, unique per settlement).
- **member settlement ↔ driver** (`driver_settlements.driver_id`), **↔ load(s)** (`first/last_load_id`,
  deduction/advance `load_id`), **↔ accounting** (Bill + BillPayment via the poster; `paid_via_bank_txn_id`).
- **member settlement ↔ escrow** (holdback → `escrow_*` liability; interplay with the 90-day separation gate — see I3).
- **member settlement ↔ cash-advance record(s)** (`driver_settlement_deductions.deduction_type='advance_recovery'`
  ⇄ `driver_advances` via `applied_to_settlement_id` + the advance's `liability_id`/`linked_bill_id`).
- **batch ↔ bank transaction** (disbursement RECORD; both-way link, TMS records only).
- **cash advance ↔ driver, trip/load (`load_id`), accounting (advance receivable via `driver_advance_accounts`),
  recovering settlement** (`applied_to_settlement_id`).
- **Factoring = N/A here.** Factoring (Faro/RTS) is **customer-side A/R secured-borrowing**, not driver A/P — it
  does not participate in a driver pay-run. Stated explicitly, not assumed.

---

## 6. OPEN ISSUES (for Jorge — do NOT guess)
- **I1. Batch grain.** Does a pay-run group **all settlements closed since the last run** (a weekly check-run,
  NetSuite "payment batch" style), or is it **per-settlement-on-close**? Trigger is settlement close either way.
  *(Recommendation to weigh: weekly batch per entity, matching McLeod's paid-settlement check register — but
  Jorge decides.)*
- **I2. Payment rail(s).** Bank ACH / Relay wallet / check — and confirm **TMS is record-only, never initiator**
  (this doc assumes record-only per §1.6). Which rails must the disbursement RECORD support at v1?
- **I3. Escrow holdback × the 90-day escrow-separation gate.** How does the pay-run compute the escrow holdback
  at pay-run time given `driver_escrow_separations` (the 90-day post-separation return path)? Does a pay-run ever
  release escrow, or only accrue it?
- **I4. Cash-advance issuance channel + authorizer.** Who authorizes a mid-trip advance — the same
  Owner/Admin/Accountant set, or also a **dispatcher**? (`driver_advances.requires_owner_approval` exists.)

---

## 7. Build prerequisites (blockers to the future build — NOT this doc)
- **settlement → `driver_finance` consolidation (#07)** — the canonical-engine consolidation must be landed so
  the pay-run reads one settlement ledger (not the retired `payroll.*`/`settlement.*`).
- **P1-ESCROW-DEBIT** — the escrow holdback → liability posting path must exist for the "POST" stage.
- **A real settlement posting a balanced Bill+BillPayment JE on a Neon branch** — the balanced-JE / Neon tie-out
  proof Jorge requires before flipping `SETTLEMENT_GL_POSTING_ENABLED` for TRANSP.

---

## 8. Acceptance (this block = the doc, not the feature)
This doc is complete when it contains — and it does — the preview-from-live evidence (real `driver_finance.*`
columns + live escrow tables + no-batch-table proof + the current screen from source, screenshot UNVERIFIED),
the standards-parity research with per-competitor verdicts, the workflow spine, the linkage matrix, the open
ISSUES, and the build prerequisites. **No code, no migration, no posting, no flag flip.** → STOP, hand back for
Jorge review.

**Sources (standards research):**
[McLeod Billing & Settlements Automation](https://www.mcleodsoftware.com/billing-and-settlements-automation-truckload-carriers/) ·
[McLeod Driver Settlements](https://www.mcleodsoftware.com/driver-settlements/) ·
[Alvys Trucking Payroll](https://alvys.com/features/trucking-payroll-software) ·
[Alvys Permissions Glossary](https://help.alvys.com/en/articles/14396232-user-permissions-glossary) ·
[NetSuite Processing Bills in Batches](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_N1665332.html) ·
[NetSuite Vendor Prepayments](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_156378588624.html) ·
[QuickBooks advance payment to vendor](https://quickbooks.intuit.com/learn-support/en-us/payments/how-to-record-advance-payment-to-vendor/00/1367379)

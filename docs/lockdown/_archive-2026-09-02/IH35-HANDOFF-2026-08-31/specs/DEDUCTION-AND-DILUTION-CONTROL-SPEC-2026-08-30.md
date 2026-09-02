# SPEC — CUSTOMER DEDUCTION / SHORT-PAY / FACTORING DILUTION CONTROL
**Owner ruling 2026-08-30: "I follow your recommendations but find the correct solution."**
**Author: Claude (claude-4d). Status: APPROVED BY OWNER, ready to build.**
**Supersedes the reason-code and COA sections of `GO-DILUTION-CONTROL-HOLE-2026-08-30.md`.**

## 1. THE REQUIREMENT, IN THE OWNER'S WORDS

> We need to be able to justify, when closing the books, or when the customer pays Faro,
> or Faro deducts from our reserves — if it was due to late payment, missing paperwork,
> late delivery, a penalization, or if we invoiced incorrectly. There can be many reasons.

Two requirements are hiding in that sentence and both must be built:
1. **Justify at close** — every dollar of dilution has a cause, an owner, and a document.
2. **"There can be many reasons"** — the list must be **extensible without a migration**.
   That is why reason codes below are a **catalog table, not a TypeScript enum**.

---

## 2. RESEARCH — WHAT THE INDUSTRY ACTUALLY DOES

**Finding: there is no universal freight short-pay reason-code standard.** Anyone who tells
you otherwise is selling something. What exists is three separate things, and the correct
design borrows from each rather than adopting any one whole.

**(a) X12 element 426 `Adjustment Reason Code`, ADX segment of the 820 Payment
Order/Remittance Advice** — the formal interchange standard for a payer telling a carrier
why it short-paid. Real codes in live carrier specs include `18` Billed to Company in Error,
`19` Duplicate Billing, `21` Rebill to Another Account, `22` Weight Error, `34` Declared
Value Incorrect, `37` Dimensions Incorrect, `38` Service Incorrect, `52` Credit for Previous
Overpayment, `53` Remittance for Previous Underpayment.
**Verdict: do NOT adopt wholesale.** The full 426 list runs 300+ codes and is mostly retail
and healthcare. **Do** carry it as an optional mapping column so an inbound broker 820
auto-codes and an outbound dispute speaks the standard. That is the interoperability win
without the 300-code mess.

**(b) AR deduction-management practice** (Billtrust, Gaviti, Emagia, Esker et al.) is
consistent on structure even though nobody publishes codes: split **valid/expected
deductions** from **invalid/disputed** ones, and run
`identify -> code -> research -> resolve -> recover or write off`.
**Verdict: adopt the workflow and the valid/invalid split. That is the disputed-vs-absorbed
axis below.**

**(c) Factoring accounting literature** (eCapital's CPA guide, Bankers Factoring) publishes
entries for **sale** treatment — `Dr Cash, Dr Factoring Expense, Cr A/R` — and for recourse
with an estimated recourse liability.
**Verdict: DO NOT COPY THOSE ENTRIES.** IH35 already locked **secured borrowing** under
ASC 860 (full recourse + mandatory repurchase + security interest + guaranty => retained
control), documented at `poster.service.ts:5` and enforced by `verify-factoring-treatment.mjs`.
Under secured borrowing the A/R **stays on book** and there is no `Cr A/R` at funding. The
published sale entries are wrong for this company. Entries in section 6 are built for
secured borrowing.

**What no vendor gives you, and what the owner actually asked for:** a **fault** dimension.
"Late delivery" and "unauthorized deduction" are both short-pays, but one is our operations
failing and one is a broker helping themselves. Only the fault axis answers *"was it us or
them"* at close, and only it tells you which department to go fix. **That axis is the
design's contribution and it is the reason this will actually stop the leak.**

---

## 3. THE MODEL — THREE AXES PER DEDUCTION

Every deduction carries three orthogonal attributes. All three are required. No defaults
that hide a decision.

| Axis | Values | What it drives |
|---|---|---|
| **fault** | `carrier` (ours) · `customer` (theirs) · `neutral` (agreed/administrative) · `unknown` | Who owns the fix. The close-the-books justification. The operational KPI. |
| **disposition** | `contra_revenue` (absorbed) · `claim_receivable` (we intend to recover) · `expense` (separate cargo claim) | Which GL account. Whether it hits revenue. |
| **recoverable** | `true` / `false` | Whether it enters the dispute queue and ages. |

**The rule that makes this honest:** `fault = unknown` forces `disposition = contra_revenue`
into the **Unknown** account **and** `recoverable = true`. Unknown money is never quietly
absorbed and never quietly written off — it ages in plain sight until somebody codes it.

---

## 4. REASON CODES — `catalogs.deduction_reason_codes` (SEED)

A **table**, not an enum. The owner adds "many reasons" himself without a deploy.
`code` is immutable; retire by `active=false`, never delete (WORM).

### Carrier fault — our operations failed. Absorbed. Contra-revenue.
| code | label | GL | x12_426 |
|---|---|---|---|
| `LATE_DELIVERY` | Late delivery / service failure penalty | 4910 | `38` |
| `LATE_PICKUP` | Late pickup / missed appointment | 4910 | `38` |
| `MISSING_POD` | Proof of delivery not provided | 4920 | `14` |
| `MISSING_LUMPER_RECEIPT` | Lumper receipt not provided | 4920 | `14` |
| `MISSING_PAPERWORK_OTHER` | BOL, scale ticket, other document missing | 4920 | `14` |
| `LATE_INVOICE_SUBMISSION` | Billed past the broker's submission window | 4920 | `14` |
| `BILLING_ERROR_OURS` | We invoiced incorrectly (rate, miles, accessorial) | 4950 | `01` |
| `DETENTION_NOT_SUPPORTED` | Detention billed without supporting proof | 4940 | `02` |
| `ACCESSORIAL_NOT_APPROVED` | Accessorial billed without authorization | 4940 | `02` |
| `OSD_DAMAGE` | Cargo damage deducted from the freight invoice | 4930 | `04` |
| `OSD_SHORTAGE` | Cargo shortage deducted from the freight invoice | 4930 | `05` |

### Customer fault — disputable. Recoverable. **Not** a revenue reduction yet.
| code | label | GL | x12_426 |
|---|---|---|---|
| `UNAUTHORIZED_DEDUCTION` | Deducted with no contractual basis | 1240 | — |
| `UNEARNED_DISCOUNT` | Took an early-pay discount they did not earn | 1240 | `08` |
| `RATE_UNDERPAID` | Paid below the signed rate confirmation | 1240 | `01` |
| `DUPLICATE_DEDUCTION` | Same deduction taken twice | 1240 | `19` |
| `DEDUCTION_NO_BACKUP` | Deducted and refused to provide backup | 1240 | `13` |

### Neutral — agreed or administrative. Absorbed, no fault.
| code | label | GL | x12_426 |
|---|---|---|---|
| `AGREED_RATE_ADJUSTMENT` | Rate change agreed in writing after billing | 4970 | `01` |
| `QUICK_PAY_DISCOUNT` | Contractual quick-pay discount | 4970 | `08` |
| `ROUNDING` | Sub-dollar rounding | 4970 | — |

### Unknown — **the default, and the most important code in the system**
| code | label | GL | x12_426 |
|---|---|---|---|
| `UNKNOWN_PENDING_BACKUP` | Deducted; cause not yet established | 4960 | — |

> **4960 is the leak gauge.** Its aging balance is the dollar answer to "we do not have
> control." It is supposed to be uncomfortable to look at. Nothing may be coded to a cause
> without the broker's or Faro's backup document attached (`docs.files`).

---

## 5. CHART OF ACCOUNTS — ADDITIONS

Contra-revenue accounts are `account_type='Income'`, `account_subtype='Discounts/Refunds Given'`
— the QBO-native way to carry a debit-balance revenue reduction, preserving COA↔QBO parity.

| # | Name | Type | Postable | `system_purpose` |
|---|---|---|---|---|
| 1240 | Freight Claims Receivable — Disputed Deductions | Asset / OtherCurrentAsset | yes | `disputed_deduction_receivable` |
| 4900 | Customer Deductions & Short-Pays | Income / Discounts-Refunds-Given | **no** (parent) | `customer_deduction_parent` |
| 4910 | Short-Pay — Service Failure | Income | yes | `shortpay_service_failure` |
| 4920 | Short-Pay — Paperwork & Documentation | Income | yes | `shortpay_paperwork` |
| 4930 | Short-Pay — OS&D Deducted from Freight | Income | yes | `shortpay_osd` |
| 4940 | Short-Pay — Accessorial Not Supported | Income | yes | `shortpay_accessorial` |
| 4950 | Short-Pay — Our Billing Error | Income | yes | `shortpay_billing_error` |
| 4960 | Short-Pay — UNKNOWN / Backup Not Received | Income | yes | `shortpay_unknown` |
| 4970 | Short-Pay — Agreed Concession / Quick-Pay | Income | yes | `shortpay_agreed` |

**Accounting basis.** A post-invoice deduction taken unilaterally by the customer reduces the
transaction price under **ASC 606 variable consideration** — it is contra-revenue, not an
operating expense. Keeping it in the revenue block preserves comparable gross freight revenue
period over period and makes dilution % a reportable KPI.
**Two deliberate exceptions:** (1) an OS&D claim settled *separately* from the freight invoice
— billed, insured, or litigated on its own — is a cargo-claim **expense**, routed to the
existing claims/insurance path (`6155 Insurance Claim Recovery`), **not** 4930; 4930 is only
for OS&D netted against the freight invoice itself. (2) A deduction we intend to recover is
**not** a revenue reduction yet — it is `1240`, an asset, and only becomes contra-revenue if
and when we give up on it.

**BLOCKING PRE-WORK — adjudicate before any migration.** `1200 "Factoring Reserve / Holdback"`
and `1230 "Factoring Reserves"` both exist, both `is_postable=true`, **both `system_purpose=NULL`**.
The TASK-4 tie-out names 1230. Two accounts for one balance will split it silently. One survives
with `system_purpose='factoring_reserve'`; the other is deactivated (never deleted) with a note.
Stamp `system_purpose` on `1210/1220/1230/2150/6400/6830` in the same migration — today the
poster resolves them by number or name, so a rename moves money quietly.

---

## 6. THE ENTRIES — SECURED BORROWING (ASC 860)

Owner's example: invoice 3,000 · advance 97% · fee 1.5% · reserve 1.5% · customer pays Faro 2,800.

**1 — Invoice**
```
DR 1210 A/R – Assigned to Faro          3,000
   CR 4000 Freight / Line-haul Income          3,000
```
**2 — Faro funds. A/R STAYS ON BOOK — no `Cr A/R` here. This is the secured-borrowing fork.**
```
DR 1296 Faro Factoring – USMCA          2,910
DR 1230 Factoring Reserves                 45
DR 6400 Factoring Fees                     45
   CR 2150 Factoring Advance                   3,000
```
**3a — Customer pays Faro 2,800. Faro charges the 200 shortfall to our reserve. CARRIER FAULT (late delivery):**
```
DR 2150 Factoring Advance               3,000    (borrowing retired: 2,800 cash + 200 reserve)
   CR 1210 A/R – Assigned to Faro              3,000    (receivable closed)

DR 4910 Short-Pay — Service Failure        200    (revenue conceded, cause named)
   CR 1230 Factoring Reserves                    200    (reserve absorbed it)
```
**3b — Same facts, but CUSTOMER FAULT and we intend to recover:**
```
DR 2150 Factoring Advance               3,000
   CR 1210 A/R – Assigned to Faro              3,000

DR 1240 Freight Claims Receivable          200    (an ASSET — we are chasing it)
   CR 1230 Factoring Reserves                    200
```
**3c — Recovery of a 3b claim:** `DR 1230 (or 1296) 200 / CR 1240 200`
**3d — Give up on a 3b claim (owner approval required):** `DR 49xx 200 / CR 1240 200`
**3e — Cause not yet known:** book 3a to **4960**, `recoverable=true`. Reclassify on backup —
by reversing and re-posting, never by editing. **WORM: reverse, never erase.**

> **CC-2 / Cursor: validate the reserve-charge leg against the executed Faro agreement**
> (`scripts/ops/fact-04-faro-owner-seed-2026-07-27.sql` + the agreement PDF) before merge.
> If Faro re-bills the shortfall instead of charging reserve, the credit leg changes from
> `1230` to a payable. Catch that here, not after posting.

---

## 7. DATA MODEL

**`catalogs.deduction_reason_codes`** — `id · operating_company_id · code (immutable) · label ·
fault · default_disposition · gl_account_id · x12_426_code · requires_backup (bool) ·
active · sort_order` + standard audit columns. Seeded from section 4. Owner-extensible.

**`accounting.invoice_deductions`** — one row per deduction event:
`id · operating_company_id · invoice_id · load_id · factoring_advance_id (nullable) ·
amount_cents · reason_code_id · fault · disposition · recoverable ·
discovered_via ('faro_reserve_statement' | 'customer_remittance' | 'broker_email' | 'manual') ·
source_document_ref · backup_file_id (docs.files, nullable) · backup_received (bool) ·
status ('open' | 'disputed' | 'recovered' | 'absorbed' | 'written_off') ·
journal_entry_id · created_by_user_id · created_at ·
resolved_at · resolved_by_user_id · resolution_notes ·
voided_at · voided_by_user_id · void_reason` **(WORM — void, never delete).**

**Linkage law (Rule 14).** Every row links both ways to: `mdata.loads` · `accounting.invoices` ·
`accounting.factoring_advances` · `accounting.journal_entries` · `mdata.customers` ·
`docs.files` · `org.companies` · `identity.users`. A deduction with no load is not a deduction,
it is an unexplained number — reject it.

---

## 8. THE DISCOVERY WORKFLOW — THIS IS THE ACTUAL FIX

The owner's words: *"We usually find out when they begin deducting from the reserves. Nobody
checks emails or adjusts invoices."* So the trigger cannot be a human remembering.

1. **Faro reserve statement import.** Every debit to the reserve is classified: known fee,
   known release, or **unexplained**.
2. **Unexplained reserve debit auto-creates an `invoice_deductions` row**, `status='open'`,
   `reason_code='UNKNOWN_PENDING_BACKUP'`, posting to **4960**. Nobody has to notice. The
   system notices.
3. **It appears in a Deductions work queue** with its load, invoice, customer, and age.
4. **Coding requires a backup document** for any code where `requires_backup=true`. No backup,
   no cause — it stays in 4960 and keeps aging.
5. **`fault='customer'` moves it to 1240** and into the dispute queue with a follow-up date.
6. **Write-off requires owner approval** and posts through 3d. Never silent.
7. **Month-end close is blocked** while any deduction older than N days sits uncoded.
   That is the "justify at close" requirement, enforced rather than requested.

---

## 9. GUARDS (Cursor authors; owner approves before merge)

| Guard | Fails when |
|---|---|
| `no-orphan-partial-invoice` | an invoice sits `partial` past the recourse window with no deduction row and no recourse |
| `no-uncoded-reserve-deduction` | an unexplained reserve debit is older than N days and still `UNKNOWN_PENDING_BACKUP` |
| `deduction-ties-to-reserve` | sum of deduction rows for a period ≠ the reserve debits on the Faro statement — **tolerance 0** |
| `deduction-linkage-complete` | any deduction row missing load / invoice / JE / customer linkage |
| `no-silent-writeoff` | a `written_off` row with no owner approval record |
| `one-load-one-open-invoice` | one revenue-recognized load maps to >1 open A/R document (already agreed) |

---

## 10. BUILD ORDER

1. **Adjudicate 1200 vs 1230.** Blocks everything. Cursor, report which and why.
2. COA migration: `1240` + `4900`–`4970` + `system_purpose` stamps.
3. `catalogs.deduction_reason_codes` + seed.
4. `accounting.invoice_deductions` + linkage.
5. **Fix `factoring-advances.routes.ts:375-398`** — pledge net of applied credits, reusing the
   expression `ar-aging.service.ts:110,146` already uses so the two cannot drift. **P0, and it
   blocks tonight's 016.**
6. Dilution close-out poster path — new source type `factoring_dilution`, own idempotency key.
   **Do not loosen `policy_partial_or_ambiguous_recourse`; recourse stays full-only.**
7. Reserve-statement import + auto-create unexplained rows.
8. Deductions work queue UI + coding + backup attach + dispute follow-up.
9. Guards from section 9.
10. Close-blocking rule.

**Steps 1, 2, 5 unblock tonight. The rest is the permanent fix.**

## 11. SOURCES
X12 element 426 `Adjustment Reason Code` (ADX/820) — FedEx 210/820 implementation guide;
Stedi X12 element 426 reference; FCA 820 Carrier Remittance Advice guide.
Deduction-management workflow — Billtrust, Gaviti, Emagia, GlobalPayEx.
Trucking factoring short-pays — Saint John Capital.
Factoring entries reviewed **and rejected as sale-treatment** — eCapital CPA guide,
Bankers Factoring. IH35 is secured borrowing per its own locked ruling.

---

# ADDENDUM — FULL ACCOUNTABILITY (owner 2026-08-30, after #18393 landed)

## The gap the owner caught
`202608301800` gave every cause a home except two he had named out loud:
**"or if we invoiced incorrectly"** and **"a penalization."** `4950` shipped as
Detention/Layover Denied, so a billing mistake had nowhere to go but `4960 UNKNOWN` —
which would have quietly inflated the leak gauge with money whose cause we actually knew.

## Accounts added — `db/migrations/202608302340_shortpay_accountability_close_the_gaps.sql`
| # | Name | Fault | Why it is its own account |
|---|---|---|---|
| 4955 | Short-Pay — Our Billing Error | carrier | A rating/mileage/accessorial mistake is a **billing** failure, not a service failure. Different department, different fix. Folding it into 4910 hides which team to go talk to. |
| 4980 | Short-Pay — Penalty / Fine Assessed by Customer | carrier | The owner's "penalization." A punitive fee (late tracking, missed check calls, no ELD visibility, fuel-advance fee) is not a price adjustment for service quality, and penalties are disputed far more often than netted deductions. |
| 4970 | Short-Pay — Agreed Concession / Quick-Pay Discount | **neutral** | No-fault money must never inflate a fault KPI. Segregating it is what keeps 4910/4955/4980 honest. |
| 1240 | Freight Claims Receivable — Disputed Deductions | customer | An **asset**. Without it, a deduction we intend to chase is written off the day it appears — and then nobody chases it. Its aging balance **is** the collections queue. |

Reason CHECK WORM-extended: `billing_error_ours`, `penalty_assessed`, `agreed_concession`,
`quick_pay_discount`, `unauthorized_deduction`, `unearned_discount`, `rate_underpaid`.
Every prior value kept.

## Accountability is not an account. It is four answers per dollar.
For every dollar Faro takes out of the reserve the system must answer:
**how much · why · whose fault · who specifically.** Accounts answer the first three.
The fourth is what the owner means by "full accountability," and an account cannot give it —
`4955 Our Billing Error` still does not say *who billed it wrong.*

## The design rule: DERIVE responsibility, never ask for it
If a human has to type who is at fault, nobody will, and we are back to the email problem
that started this. **The reason code already implies the source.** Add one column to the
reason catalog and the system fills responsibility in with zero extra typing:

`catalogs.deduction_reason_codes.responsible_source` ∈
`invoice_creator · load_dispatcher · assigned_driver · customer · none`

| Reason | responsible_source | Resolves to |
|---|---|---|
| `billing_error_ours` | `invoice_creator` | whoever created the invoice |
| `late_delivery` · `late_pickup` | `load_dispatcher` | the load's dispatcher (+ assigned driver, informational) |
| `missing_pod` · `lumper_receipt_missing` · `missing_paperwork` | `assigned_driver` | the driver on the load |
| `penalty_assessed` | `load_dispatcher` | override allowed with a documented reason |
| `unauthorized_deduction` · `unearned_discount` · `rate_underpaid` · `duplicate_billing` | `customer` | no internal owner — this is the 1240 chase list |
| `agreed_concession` · `quick_pay_discount` · `rounding` | `none` | no fault, by design |
| `unknown_pending_backup` | `none` **until coded** | stays unowned on purpose — that is the point |

`accounting.invoice_deductions` then carries `responsible_user_id` and
`responsible_department`, **populated automatically** from `responsible_source` against the
linked load and invoice. Overridable — but an override requires a note and is itself audited.
The data already exists: loads and invoices carry their creator, and the load carries its
dispatcher and assigned driver.

## The report that closes the books
**Dilution Accountability Report** — for any period, reconciled to the Faro reserve statement
at **tolerance 0**:
- by **cause** (which 49xx / 1240)
- by **fault** (ours / theirs / agreed / unknown)
- by **department** and by **person**
- by **customer** (which brokers deduct from us most — a rate-negotiation input)
- as **% of gross revenue** (the dilution rate, the single number that says whether this is getting better)

That report is the answer to "justify when closing the books." `4960` trending to zero and
`1240` actually getting collected is what "we have control" looks like in numbers.

## Guard
`deduction-has-owner` — fails when a deduction is coded to a `carrier`-fault reason and has
no `responsible_user_id`. A named fault with no name attached is not accountability.

---

# CORRECTION — THE FARO AGREEMENT ANSWERS IT, AND MY DRAFT ENTRY WAS WRONG

**Source: the executed agreement is embedded in `~/Desktop/CPA ANSWERS.docx`** (Faro Factoring LLC
& IH 35 Transportation LLC). It was reviewed earlier; I should not have kept asking for it.
Everything below is read off that document. **The section-6 draft entry is WITHDRAWN.**

## What I got wrong
I drafted `DR 2150 Factoring Advance 3,000 / CR 1210 A/R 3,000` at short-pay time — retiring the
whole Faro obligation and charging the $200 shortfall to the reserve. **The agreement says the
obligation is not retired.**

> **Repurchased Account, Example 2** — *"If the Net Amount of Seller's invoice comprising the
> Purchased Account is $1,250.00, if there are neither any Transaction Fees owed on the Purchased
> Account nor any Default Interest, and payment is received by Faro in the amount of $1,200.00,
> then the Purchased Account **remains a Purchased Account and does not become a Repurchased
> Account** at that time."*

That is the owner's exact scenario, written into his own contract, with the outcome stated.

## The controlling terms
| Term | Value / definition |
|---|---|
| **Security Reserve** | 1.5% of the Net Amount of each Purchased Account |
| **Purchase Price** | Net Amount − (Factoring Fee + Security Reserve) |
| **Purchase Price Proceeds** | Purchase Price − Transaction Fees |
| **Transaction Fees** | *All* out-of-pocket Faro costs: wire fees, NSF, credit-card fees, UCC filing and search, **costs of collection, attorneys fees, postage, court costs** |
| **Repurchase Price** | Net Amount **+** unpaid Transaction Fees **+** Default Interest **−** credits |
| **Repurchase Term** | 30 calendar days · **Grace Period** 5 days → interest starts day 35 |
| **Default Interest Rate** | **0.067% per day, compounded daily** |
| **Repurchase Deadline** | **95 calendar days** from Purchase Date |
| **Security Reserve release** | Only when Faro has been paid the Repurchase Price **and** Seller is not in default **and** Equity Holder is not in default. Faro has **no obligation** to release reserve on an account not converted to cash. |

**Seller's warranty (agreement, capitalized):** every account sold is **"FREE FROM ANY CLAIM,
DISPUTE, DEDUCTION AND/OR OFFSET."** So at the Faro layer a customer deduction is *always* IH35's
problem, regardless of who caused it. Fault matters for fixing operations and for chasing the
broker — it does **not** reduce what we owe Faro.

> ⚠️ **Do not "fix" the interest rate from the contract's own example.** The term sheet sets
> **0.067%/day**; the illustrative example computes with 0.066%. The operative rate is 0.067%,
> which is what `poster.service.ts` already uses (0.00067/day after day 35, compounded). Leave it.

## The corrected model — A/R and the Faro obligation are TWO separate truths
Owner's example: invoice 3,000 · reserve 45 · fee 45 · customer pays Faro 2,800.

**3a — Customer's 2,800 reaches Faro. It is a CREDIT, not a settlement.**
```
DR 2150 Factoring Advance            2,800
   CR 1210 A/R – Assigned to Faro           2,800
```
Both drop by 2,800. The Purchased Account **stays open** at a Repurchase Price of
200 + unpaid Transaction Fees + Default Interest.

**3b — The customer side closes separately, by reason code.** They owe us nothing more:
```
carrier fault / absorbed:   DR 49xx Short-Pay        200  / CR 1210 A/R  200
customer fault / chasing:   DR 1240 Claims Receivable 200 / CR 1210 A/R  200
```
A/R is now zero. **2150 still correctly shows 200 owed to Faro.**

**3c — Day 35+, if still unpaid:** `DR 6830 Factoring Default Interest / CR 2150` — daily,
0.067%, compounded, on the unpaid balance.

**3d — Repurchase (or Faro applies reserve at its discretion):**
`DR 2150 / CR 1230 Factoring Reserves` — or `CR` cash if we pay it.

## Why this is better than what I drafted
It stops pretending the debt is gone when it is not. **The old draft would have understated
liabilities and skipped default interest entirely** — a real misstatement, and exactly the kind an
auditor or lender would find. It also explains why the existing code is *right* to fail
`policy_partial_or_ambiguous_recourse` closed: under this agreement repurchase genuinely is
all-or-nothing. The missing piece was never "loosen recourse." It is **a partial-payment credit
path plus a repurchase-obligation tracker.**

## New required work this contract exposes
1. **Repurchase obligation tracker.** Every Purchased Account carries a live Repurchase Price =
   Net + unpaid Transaction Fees + Default Interest − credits. Nothing computes this today.
2. **Day-95 Repurchase Deadline guard.** The hard backstop where the money actually leaves.
   Nothing tracks it. **Guard: `no-purchased-account-past-repurchase-deadline`.**
3. **Transaction Fees are broader than the wire fee.** Collection costs, attorney fees, court
   costs, UCC and NSF fees are all chargeable to us and all reduce proceeds. Today only a
   `factor_wire_fee` role exists. These need to land somewhere named, not in a catch-all.
4. **Reserve release is conditional, not automatic.** Never accrue an expected reserve release —
   Faro owes nothing on an account not converted to cash. Recognize on receipt only.

## Corrected build order (replaces §10 items 6 and 7)
6. Partial-payment **credit** path (3a) — account stays open. Do **not** loosen recourse.
7. Repurchase-obligation tracker + default interest from day 35 + the day-95 deadline guard.
8. Then the reserve-statement import, work queue, and remaining guards as written.

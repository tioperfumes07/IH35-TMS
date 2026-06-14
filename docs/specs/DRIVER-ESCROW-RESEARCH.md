# Driver Escrow — Research & Accounting Findings (grounding spec)

**Status:** Research / Docs only (no code, no DDL).
**Audience:** Engineering + CFO/compliance reviewer.
**Purpose:** Ground a future per-driver escrow accounting engine for IH35 Dispatch (TMS). All amounts are stored as integer cents.
**Date:** 2026-06-14

---

## 0. Executive summary

**Driver escrow** is the driver's own money, withheld by the carrier from settlements and held in trust, to be used only for specifically-disclosed obligations (damages, fines, deductibles, etc.) and refunded when the lease ends. It is **legally and accounting-wise a LIABILITY of the carrier**, not revenue and not a carrier asset. This makes it categorically different from a **cash advance** (which is a *receivable* — the carrier is owed money back by the driver). Escrow = "we owe the driver"; advance = "the driver owes us."

For interstate owner-operator/lease arrangements, escrow is **federally regulated under the Truth-in-Leasing rules at 49 CFR § 376.12(k)**, which mandates lease disclosure of the amount and permitted uses, an accounting obligation (per-settlement line items or monthly statements, plus on-demand), **quarterly interest at no less than the 91-day Treasury-bill auction yield**, and **return of the balance no later than 45 days after lease termination**, less lawfully-deductible obligations, with a final accounting. ([eCFR § 376.12](https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-376/subpart-B/section-376.12), [Cornell LII § 376.12](https://www.law.cornell.edu/cfr/text/49/376.12))

Industry TMS platforms implement this as a **per-driver escrow sub-ledger** that accrues via recurring settlement deductions toward a target balance and reconciles to a single GL control (liability) account. McLeod LoadMaster ships an "Escrow Accounting System for Owner-Operators" that tracks multiple escrow balances, pays interest monthly, and provides a GL reconciliation report. Alvys offers a "customizable escrow savings account" with automatic deposits and deductions integrated to accounting. ([McLeod / CCJ](https://www.ccjdigital.com/business/article/14911638/mcleod-software-enhances-both-loadmaster-powerbroker), [Alvys blog](https://alvys.com/blog/maximizing-profits-how-accounting-integrations-revolutionize-trucking-company-finances))

---

## 1. Industry models — how McLeod and Alvys structure driver escrow

### 1.1 What "escrow" means in a TMS (vs. cash advance)

Across the industry the escrow account is a **maintenance/reserve/escrow fund** that the carrier withholds on the driver's behalf. The defining principle, repeated in industry guidance, is that **the money remains the owner-operator's money** until a specific, pre-disclosed event gives cause to withdraw it to pay a debt the driver is liable for:

> "Money placed in an escrow account remains the owner-operator's money until something happens that gives cause for a withdrawal to pay a debt they are liable for." ([Overdrive / Partners in Business](https://www.overdriveonline.com/partners-in-business/article/14890911/maintenance-escrow-savings-account-for-truck-maintenance))

This is the bright line vs. a **cash advance** (a.k.a. comdata/fuel advance or pay advance): an advance is carrier money *fronted* to the driver and recovered out of future settlements — it is a driver **receivable**. Escrow is driver money *held back* — a carrier **liability**. The two must never share a ledger account.

### 1.2 Deduction model (how it is funded)

Two funding cadences dominate:

- **Flat per-settlement / per-load deduction** — a fixed amount (e.g., $25) withheld each settlement until a target is reached. This is the cleanest model for IH35's planned `$25/load default (2500 cents, configurable)`.
- **Percent-of-gross or per-mile deduction** — commonly 1–10% of gross revenue, or a per-mile rate, used where weekly volume varies:

> "An escrow maintenance account works by having the carrier authorize a deduction of 1–10 percent of gross revenue… In lease-purchase situations, maintenance escrow accounts are typically mandatory and often funded from settlements on a per-mile basis to account for variability in weekly mileage." ([Non-Forced Dispatch](https://www.nonforceddispatch.com/truck-maintenance-fund/))

In all models the deduction appears as a **line item on the settlement sheet**, which is one of the two compliance-approved accounting methods (see §3).

### 1.3 Where held funds sit / how the balance accrues

- Funds accrue in a **per-driver escrow balance** that grows each settlement until a configured **target / cap** is met, after which deductions stop. Industry guidance describes funds that "accumulate" in anticipation of future maintenance/repairs/obligations. ([Arrow Truck Sales](https://www.arrowtruck.com/blog/escrow-rules-what-you-need-to-know))
- In the GL, the aggregate of all driver balances sits in **one liability control account**; the per-driver detail is a **sub-ledger** that must reconcile to that control at all times.

**McLeod LoadMaster** explicitly ships this as a product:

> McLeod LoadMaster includes an **Escrow Accounting System for Owner-Operators**, which keeps track of balances in **multiple escrow accounts**, allows **interest to be paid monthly**, and provides a **reconciliation report** to assist with **general-ledger account balance matching**. ([McLeod via CCJ](https://www.ccjdigital.com/business/article/14911638/mcleod-software-enhances-both-loadmaster-powerbroker); [McLeod billing/settlements](https://www.mcleodsoftware.com/billing-and-settlements-automation-truckload-carriers/))

**Alvys** offers the equivalent as a settlement add-on:

> Alvys offers a "**customizable escrow savings account** feature that integrates smoothly with accounting systems, featuring **automatic deposits and deductions** for efficient financial management." ([Alvys blog](https://alvys.com/blog/maximizing-profits-how-accounting-integrations-revolutionize-trucking-company-finances); [Alvys settlements](https://alvys.com/features/trucking-payroll-software))

### 1.4 Disbursement / refund

- **Draw / disbursement:** funds are withdrawn only for the disclosed items (cargo deductible, damages, fines, advances, base plates, licensing, repairs, taxes), often paid directly to the vendor/repair facility, and shown on the settlement. ([Arrow Truck Sales](https://www.arrowtruck.com/blog/escrow-rules-what-you-need-to-know), [Overdrive](https://www.overdriveonline.com/partners-in-business/article/14890911/maintenance-escrow-savings-account-for-truck-maintenance))
- **Refund on separation:** the remaining balance is returned at lease termination, frequently subject to a notice period (e.g., 30 days) and never later than the federal 45-day limit. ([Arrow Truck Sales](https://www.arrowtruck.com/blog/escrow-rules-what-you-need-to-know))

### 1.5 Configurable parameters observed in the market

| Parameter | Typical configuration |
|---|---|
| Deduction amount | Flat (e.g., $25) **or** % of gross (1–10%) **or** per-mile |
| Cadence | Per load / per settlement (weekly) |
| Target / cap balance | Fixed target; deductions stop at target, resume if balance drops |
| Permitted draw events | Damages, fines, cargo-claim deductibles, advances, licensing/plates, repairs, taxes |
| Interest | Paid periodically (McLeod: monthly); federally **required quarterly** for 376.12 leases |
| Refund | On separation, less lawful deductions, within 45 days |

---

## 2. Accounting treatment — escrow as a liability with a per-driver sub-ledger

### 2.1 Classification

- **Escrow held = current liability** ("Driver Escrow Payable" / "Owner-Operator Escrow Liability"). It is the driver's money in the carrier's custody.
- It is **not revenue** and **not** a reduction of payroll expense. The deduction does not reduce what the carrier *earned*; it converts part of *cash owed to the driver* into *a liability still owed to the driver*.
- Maintained as a **per-driver sub-ledger (control + subsidiary)**: one GL control account `2xxx Driver Escrow Payable` whose balance must equal the sum of every individual driver's escrow balance at all times.

### 2.2 Chart-of-accounts elements (illustrative; map to IH35 CoA later)

| Acct | Name | Type | Normal balance |
|---|---|---|---|
| 2400 | Driver Escrow Payable (control) | Liability | Credit |
| 1010 | Cash – Operating | Asset | Debit |
| 6xxx / 2xxx | Driver Settlement Payable / Net pay clearing | Liability/clearing | Credit |
| 7xxx | Interest Expense – Escrow | Expense | Debit |
| 1xxx | Damage/Claim Receivable or Expense offset (draw target) | varies | — |

> **Why credit escrow, not credit cash, at accrual:** at accrual no cash leaves the carrier. The settlement run is allocating the driver's **gross** between **net pay to the driver** and **amounts withheld**. Escrow withheld is reclassified from "payable to driver as cash" into "payable to driver as escrow." Both are liabilities; only the bucket changes.

### 2.3 Journal entries

**(A) Accrual — per-load $25 (2500 cents) escrow deduction inside a settlement.**
Within the settlement, the driver's gross is split. The escrow portion:

```
Dr  Driver Settlement Payable / Net Pay clearing   $25.00   (2500c)
    Cr  Driver Escrow Payable (control; sub = driver)    $25.00   (2500c)
```

Effect: driver's net cash pay is reduced by $25; escrow liability to that same driver increases by $25. No P&L impact. (This is the "addition to the escrow fund" that 376.12(k)(3) requires be shown on the settlement sheet.)

**(B) Draw against escrow — e.g., a $400 (40000c) cargo-claim deductible / damage / fine charged to the driver.**
The carrier uses the driver's escrow to satisfy a debt the driver is liable for:

```
Dr  Driver Escrow Payable (control; sub = driver)     $400.00   (40000c)
    Cr  Cash / Claim Payable / Damage-recovery offset      $400.00   (40000c)
```

Effect: escrow liability to the driver decreases; the carrier's obligation/expense for the damage is funded from the driver's own held money. Every draw carries an **audit record** (event reference, approver, disclosed-item category) because 376.12 only permits draws for **previously specified** items.

**(C) Interest credited to the driver (carrier expense).**

```
Dr  Interest Expense – Escrow                          $X
    Cr  Driver Escrow Payable (control; sub = driver)      $X
```

Effect: interest *increases the driver's escrow balance* (it is the driver's money) and is a carrier expense.

**(D) Refund of remaining balance on separation.**

```
Dr  Driver Escrow Payable (control; sub = driver)     [remaining balance]
    Cr  Cash – Operating                                  [remaining balance]
```

Effect: liability extinguished, cash paid out. Sub-ledger balance for that driver goes to $0.

### 2.4 Reconciliation

- **Control = Σ sub-ledgers.** At any close, `balance(2400 control) == Σ each driver's escrow balance`. A mismatch is a hard error (mirrors the IH35 "money audit spine" standing rule).
- McLeod ships exactly this: a **reconciliation report** for **general-ledger account balance matching** of escrow. ([McLeod via CCJ](https://www.ccjdigital.com/business/article/14911638/mcleod-software-enhances-both-loadmaster-powerbroker))
- Recommended invariant for the engine: **escrow balance can never go negative** for any driver; a draw that exceeds the balance must be blocked or split (the excess becomes an advance/receivable, never negative escrow).

---

## 3. Federal Truth-in-Leasing — 49 CFR § 376.12(k)

**Scope:** Part 376 governs the **lease and interchange of vehicles**; § 376.12 lists the provisions a written lease **must** contain. The lead-in:

> "Except as provided in the exemptions set forth in subpart C of this part, the written lease required under § 376.11(a) shall contain the following provisions…" ([Cornell LII § 376.12](https://www.law.cornell.edu/cfr/text/49/376.12))

Paragraph **(k) "Escrow funds"** applies **"if escrow funds are required"** and mandates the following be specified in the lease:

**(k)(1) — Amount disclosure.**
> "The amount of any escrow fund or performance bond required to be paid by the lessor to the authorized carrier or to a third party." ([Cornell LII](https://www.law.cornell.edu/cfr/text/49/376.12))

**(k)(2) — Permitted uses.**
> "The specific items to which the escrow fund can be applied." ([Cornell LII](https://www.law.cornell.edu/cfr/text/49/376.12))
*Implication: a draw is only lawful if the item was disclosed in the lease. The engine should enforce a closed list of disclosed draw categories.*

**(k)(3) — Accounting method while the carrier holds the fund.** The carrier must account in one of two ways:
> "(i) By clearly indicating in **individual settlement sheets** the amount and description of any deduction or addition made to the escrow fund; or (ii) By providing a **separate accounting** to the lessor of any transactions involving the escrow fund… on a **monthly** basis." ([Cornell LII](https://www.law.cornell.edu/cfr/text/49/376.12); [eCFR](https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-376/subpart-B/section-376.12))

**(k)(4) — On-demand accounting.**
> "The right of the lessor to demand to have an accounting for transactions involving the escrow fund **at any time**." ([Cornell LII](https://www.law.cornell.edu/cfr/text/49/376.12))

**(k)(5) — Interest (mandatory, quarterly, Treasury-pegged).**
> "While the escrow fund is under the control of the carrier, the carrier shall **pay interest on the escrow fund on at least a quarterly basis.** … The interest rate shall be established on the date the interest period begins and shall be **at least equal to the average yield or equivalent coupon issue yield on 91-day, 13-week Treasury bills as established in the weekly auction by the Department of Treasury.**" ([Cornell LII](https://www.law.cornell.edu/cfr/text/49/376.12); [eCFR](https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-376/subpart-B/section-376.12))

**(k)(6) — Return / termination refund (the 45-day rule).**
> The lease must specify the conditions the lessor must fulfill to have the escrow returned. "At the time of the return of the escrow fund, the authorized carrier **may deduct monies for those obligations incurred by the lessor which have been previously specified in the lease**, and shall provide a **final accounting** to the lessor of all such final deductions made to the escrow fund." The lease shall further specify that **"in no event shall the escrow fund be returned later than 45 days from the date of termination."** ([Cornell LII](https://www.law.cornell.edu/cfr/text/49/376.12); [eCFR](https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-376/subpart-B/section-376.12))

**Compliance crib for the engine:**

| Requirement | Rule | Engine obligation |
|---|---|---|
| Disclosure | Amount + permitted items in lease | Store per-driver escrow terms |
| Accounting | Settlement line items **or** monthly statement | Line-item every accrual/draw on settlement; monthly statement option |
| On-demand | Account "at any time" | Per-driver statement generable on demand |
| Interest | ≥ quarterly, ≥ 91-day T-bill yield | Accrue/credit interest at least quarterly |
| Refund | ≤ 45 days from termination, less specified deductions, with final accounting | Separation event opens a 45-day refund clock + final accounting artifact |

*Note: the federal regime applies to interstate leased owner-operators. Whether a given IH35 driver is W-2 company vs. leased owner-operator changes which obligations bind — but adopting the 376.12(k) discipline as the baseline is the safe, CFO-acceptable default. Litigation history (e.g., OOIDA enforcement actions under the truth-in-leasing rules) underscores that escrow accounting and refund failures are actively litigated. ([OOIDA v. Arctic Express](https://law.justia.com/cases/federal/district-courts/FSupp2/159/1067/2384261/))*

---

## 4. Full lifecycle — states and GL treatment at each transition

### 4.1 State diagram (text)

```
                  per-load deduction
                  (until target met)
   [NEW] ──────────────────────────────▶ [ACCRUING]
                                              │
                          target reached      │
                                              ▼
                                          [AT TARGET / HELD]
                                              │
                  ┌───────────── draw (fine/damage/fee) ──────────┐
                  │            (audited, disclosed item)          │
                  ▼                                               │
            [DRAW POSTED] ── balance < target ──▶ [ACCRUING] ◀────┘
                                              │
                  periodic accounting / interest (≥ quarterly)
                                              │ (no state change; statement + interest credit)
                                              ▼
                              ── lease termination event ──
                                              │
                                              ▼
                                   [SEPARATION / FINAL ACCOUNTING]
                                              │  (≤ 45 days; lawful final deductions)
                                              ▼
                                        [REFUNDED → CLOSED]
```

### 4.2 Transition-by-transition GL

| # | State / event | Trigger | Debit | Credit | Audit artifact |
|---|---|---|---|---|---|
| a | **Accrue per load** | Settlement run, balance < target | Driver Settlement Payable / Net pay clearing | Driver Escrow Payable (sub=driver) | Settlement line item (376.12(k)(3)(i)) |
| b | **Hold at target** | Balance == target | *no entry* — deduction suppressed | — | Config: deductions paused |
| c | **Draw for fine/damage** | Approved, disclosed-item event | Driver Escrow Payable (sub=driver) | Cash / Claim Payable / Damage offset | Event ref + approver + category; settlement line item |
| d | **Periodic accounting** | ≥ quarterly (and on demand) | Interest Expense – Escrow | Driver Escrow Payable (sub=driver) | Statement to driver; interest credit ≥ 91-day T-bill |
| e | **Refund on separation** | Lease termination; ≤ 45 days | Driver Escrow Payable (sub=driver) | Cash – Operating | **Final accounting** of all deductions (376.12(k)(6)) |

**Invariants enforced at every transition**
1. Σ(sub-ledger balances) == control account balance (hard gate).
2. Per-driver balance ≥ 0 (no negative escrow; over-draw routes to advances/receivable, not negative escrow).
3. Every draw references a disclosed permitted item and an approver.
4. Separation starts a 45-day clock; final accounting must be produced before/at refund.
5. Interest accrues at least quarterly while held.

---

## 5. Open questions for Jorge

1. **Deduction amount & cadence** — Confirm default **$25/load (2500 cents)**, configurable per driver. Per-load vs. per-settlement (weekly) — do we deduct once per settlement regardless of load count, or $25 × loads? Also: do we support % of gross / per-mile alternatives, or flat-only for v1?
2. **Target / cap balance** — Is there a target balance at which deductions stop (e.g., $500 / $1,000)? Per-driver configurable? Do deductions auto-resume after a draw drops the balance below target?
3. **Draw triggers** — Exact closed list of events that may draw against escrow (cargo-claim deductible, damages, fines/citations, fuel/cash-advance shortfall, equipment/repairs, plates/licensing, taxes). Each must be a **disclosed permitted item** per 376.12(k)(2). Which are in scope for v1?
4. **Refund-approval flow** — Who approves a separation refund and final accounting? One approver or dual control? What artifact constitutes the "final accounting" we hand the driver?
5. **Interest handling** — Do our drivers fall under 49 CFR 376.12(k) (interstate leased owner-operators), making **quarterly interest at ≥ 91-day T-bill yield mandatory**? If company W-2 drivers only, is interest waived? Any **state** escrow/interest rule on top of federal? Do we mirror McLeod and post interest **monthly** even though federal floor is quarterly?
6. **Separation detection** — What event marks "lease termination" / driver offboarding that starts the **45-day** refund clock (status flag, termination date field, last settlement)? Is there a contractual **notice period** (e.g., 30 days) before refund, and does it run concurrently with or before the 45-day federal cap?
7. **Company-vs-owner-operator scope** — Does escrow apply to all drivers or only leased owner-operators? This determines whether 376.12 binds and whether the same ledger serves both populations.
8. **Negative-balance / over-draw policy** — Confirm the rule that a draw exceeding the escrow balance is blocked or split to an advance/receivable, never recorded as negative escrow.

---

## 6. Sources

- 49 CFR § 376.12 — Lease requirements (escrow funds at (k)) — eCFR (current): https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-376/subpart-B/section-376.12
- 49 CFR § 376.12 — Cornell Legal Information Institute (e-CFR text): https://www.law.cornell.edu/cfr/text/49/376.12
- 49 CFR Part 376 Subpart B — Leasing Regulations (eCFR): https://www.ecfr.gov/current/title-49/subtitle-B/chapter-III/subchapter-B/part-376/subpart-B
- OOIDA v. Arctic Express, 159 F. Supp. 2d 1067 (S.D. Ohio 2001) — truth-in-leasing escrow litigation (Justia): https://law.justia.com/cases/federal/district-courts/FSupp2/159/1067/2384261/
- McLeod Software enhances LoadMaster/PowerBroker (Escrow Accounting System for Owner-Operators; interest paid monthly; GL reconciliation report) — Commercial Carrier Journal: https://www.ccjdigital.com/business/article/14911638/mcleod-software-enhances-both-loadmaster-powerbroker
- McLeod Software — Billing & Settlements Automation (Truckload): https://www.mcleodsoftware.com/billing-and-settlements-automation-truckload-carriers/
- McLeod Software — Driver Settlements / Driver Management: https://www.mcleodsoftware.com/driver-settlements/
- Alvys — How Accounting Integrations Revolutionize Trucking Finances (customizable escrow savings account; automatic deposits and deductions): https://alvys.com/blog/maximizing-profits-how-accounting-integrations-revolutionize-trucking-company-finances
- Alvys — Trucking Payroll / Settlements: https://alvys.com/features/trucking-payroll-software
- Overdrive (Partners in Business) — Maintenance escrow savings account (money remains the owner-operator's): https://www.overdriveonline.com/partners-in-business/article/14890911/maintenance-escrow-savings-account-for-truck-maintenance
- Non-Forced Dispatch — Owner Operators Need a Truck Maintenance Fund (1–10% of gross / per-mile funding): https://www.nonforceddispatch.com/truck-maintenance-fund/
- Arrow Truck Sales — Escrow Rules: What You Need to Know (permitted uses, return at termination, disclosure): https://www.arrowtruck.com/blog/escrow-rules-what-you-need-to-know

---

*Prepared as grounding research for the IH35 Dispatch driver-escrow accounting engine. No application code, schema, or DDL is implied or authorized by this document; it informs a later design/spec under Jorge's standing rules (money-audit spine, control = Σ sub-ledger, fresh branch per block). Mirrors the advance-side research that grounded the A3 capped-recovery engine.*

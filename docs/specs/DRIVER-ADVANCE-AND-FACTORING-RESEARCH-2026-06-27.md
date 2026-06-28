# Driver-Advance Recovery + Factoring — Investigative Research (cited, no guessing)

**Date:** 2026-06-27 · **Purpose:** real external data (McLeod/Alvys/QuickBooks/GAAP/FLSA + freight-factoring
sources) to ground Jorge's Block B (recovery policy) + Factoring (#1563) decisions. **Findings only — Jorge decides.**

---

## A. DRIVER ADVANCE / LOAN / DAMAGE RECOVERY  (Block B "it depends on the situation")

### A.1 Legal framework — FLSA + state (this is the constraint, not a preference)
- **Loan / cash-advance PRINCIPAL** may be deducted from wages **even below minimum wage** under the FLSA —
  BUT **if recovering the FULL advance in one check would drop an EMPLOYEE below minimum wage, the repayment
  MUST be spread across multiple paychecks** (amortized). Interest/admin fees may **never** cut into minimum
  wage. A **signed written agreement** is required. [Jimerson, McAfee&Taft, Homebase]
- **Employee vs owner-operator is the decisive fork:** the minimum-wage floor protects **W-2 employees**.
  **Owner-operators (1099 contractors) are not FLSA-minimum-wage-covered** → recovery is governed by the
  **contractor agreement** (full-at-next-settlement is permissible if the contract says so). [DGP, Workplace Fairness]
- **Damage / cargo-claim / equipment deductions are a DIFFERENT, stricter class** than advances: many states
  require **written consent**; **NY, NJ, DE prohibit pay-docking entirely**; **Arkansas forbids deducting a
  driver's pay for any reason**; never below minimum wage (employees). A driver is generally **not** liable for
  a deductible/damage **unless they signed** authorizing it. [Texas Payday Law, Paycom, dfwcounsel, devicerescue]

### A.2 Industry/TMS practice
- Advances appear on the settlement as a **negative line** or an **open/pending deduction carried until paid**;
  deductions are split **fixed** (truck note, insurance) vs **variable** (fuel, maintenance). [ATS]
- **McLeod** and **Alvys** both support **scheduled/recurring deductions AND one-time deductions**; the exact
  recover-in-full-vs-installment policy is **carrier-configured**, not hard-coded. [McLeod, Alvys]

### A.3 Conclusion (recommendation for Jorge — matches "depends on the situation")
Recovery should be **policy-driven per deduction TYPE × driver CLASS**, not one global rule:
| Deduction | Employee (W-2) | Owner-operator (1099) |
|---|---|---|
| **Cash/fuel(cash)/loan advance** | default **amortize with a net-pay floor** (legal when full would breach min wage); installment owner-configurable | **full-at-next** permissible per contract, or amortize — **owner's choice per situation** |
| **Damage / cargo / equipment** | **written consent required**, never below floor, **blocked in NY/NJ/DE/AR**; default amortize; **owner-approved, never auto** | per signed contract; still owner-approved + documented |
> IH35's existing **capped-ledger recovery path already does amortize-with-net-floor** — the right default for
> employees. **Add:** (1) a per-deduction `recovery_mode ∈ {amortize, full_at_next}` the **owner** sets at
> approval (so "deduct it all" is a deliberate, logged choice); (2) **driver-class awareness** (skip the
> min-wage floor only for owner-operators); (3) damage/equipment = **consent-gated, owner-approved, not auto**.

---

## B. FUEL ADVANCE vs FUEL CARD  (confirms Jorge's "fuel advance = cash, fuel card = card")
- **Fuel ADVANCE** = an **upfront CASH payment after pickup, before delivery/invoice**, issued via **Comchek
  (Comdata/Corpay) or ACH/wire**. It's a **cash advance** → recover from settlement (driver-advance rails). [CHC, FactoringExpress, OTR]
- **Fuel CARD** (**EFS/WEX**, **Comdata**) = a **payment card** that buys fuel (often at a discount network);
  it is a **card purchase/expense**, **not a driver advance**. [O Trucking, pfleet, RoadSync]
- **Conclusion:** the two-source model is correct and industry-standard. **Cash fuel advance → driver-advance
  rails (load_id-direct, recover via settlement). Fuel card → expense / vendor (Corpay) path**, with driver
  recovery only for flagged personal/over-limit charges. Exactly as Jorge stated.

---

## C. FACTORING (GAAP ASC 860)  — a MATERIAL finding for #1563 + the existing structure doc
### C.1 Sale vs secured borrowing (the classification that changes the JEs)
A transfer is a **true SALE** (derecognize AR) only if **all three** ASC 860 conditions hold: (1) legal
isolation (beyond your bankruptcy estate), (2) factor's unrestricted right to pledge/sell, (3) **you keep no
effective control**. **Recourse alone doesn't auto-fail** — but recourse **with mandatory repurchase / put /
recall** fails condition 3 → the whole thing is a **SECURED BORROWING** (AR **stays** on the books, a
**factoring liability** is recorded, and the fee is **interest expense over the life**, not a loss-on-sale).
[LegalClarity, KPMG, PwC, CPA Journal]

### C.2 Concrete JEs ($100k face, 3% fee, 10% holdback, $2k recourse estimate) [LegalClarity]
- **True sale (non-recourse):** `Dr Cash 87,000 · Dr Due-from-factor (reserve) 10,000 · Dr Loss-on-sale 3,000 · Cr AR 100,000`
- **Sale WITH recourse:** as above but `Dr Loss 5,000 · Cr Recourse Liability 2,000`
- **Secured borrowing:** `Dr Cash 87,000 · Cr Borrowing Payable 87,000` (AR stays; fee = interest over life)
- QuickBooks/industry contra-accounts: **FIS** (Factored Invoices Sold, contra-asset), **FIR** (reserve asset),
  **FFE** (fee expense); advance ~80–97%, reserve/holdback ~3–20%, fee ~1–5%; reserve released on debtor payment minus fees. [Bankers Factoring, Gateway CFS, comcapfactoring, eCapital]

### C.3 Conclusion / ⚠️ FLAG for #1563 + the CPA
- **FARO is RECOURSE.** If FARO's terms include mandatory repurchase/chargeback-on-default (typical recourse),
  **GAAP says SECURED BORROWING** — AR **stays on IH35's books** + a **factoring liability**, fee = interest.
- IH35's current `FACTORING-ACCOUNTING-STRUCTURE.md` books factoring like a **SALE** (it **credits/removes AR**
  and debits advances-receivable + reserve + fee). **That is the sale-treatment pattern, which may not match
  GAAP for a recourse facility.** This is a **real classification decision** — confirm with the bookkeeper/CPA
  whether FARO qualifies for sale treatment or must be a secured borrowing. The posting engine should be built
  to support **whichever the CPA confirms** (the role set already exists; the JE shape differs).
- **Eligible-invoice status** (the #1563 flag) is corroborated: factoring monetizes **issued/unpaid** invoices
  (cash before the debtor pays) — the live `status='paid'` filter excludes exactly what you factor. Recommend
  **issued/sent + POD-approved + not-yet-factored**.

---

## D. WHAT JORGE STILL DECIDES (these are ops/contract calls, now grounded)
1. **Recovery default cadence/amount** per type×class (e.g. employees: amortize weekly at X%/$ with net floor;
   owner-operators: full-at-next allowed). Damage = consent-gated owner-approval.
2. **FARO factoring GAAP classification** (sale vs secured borrowing) — bookkeeper/CPA confirm; drives the JE shape.
3. **FARO submission channel + AM/PM cutoffs + recourse/chargeback workflow** (per #1563 §7).

**Sources:** FLSA/wage law — jimersonfirm.com, mcafeetaft.com, dgpfirm.com, efte.twc.texas.gov, paycom.com,
dfwcounsel.com, devicerescue.com, joinhomebase.com, workplacefairness.org · Fuel advance/card — chcfactoring.com,
factoringexpress.com, otrucking.com, pfleet.com, roadsync.com, otrsolutions.com · TMS — mcleodsoftware.com,
alvys.com, blog.drive4ats.com · Factoring GAAP — legalclarity.org, kpmg.com, viewpoint.pwc.com, cpajournal.com,
bankersfactoring.com, comcapfactoring.com, ecapital.com, fundthrough.com, quickbooks.intuit.com.

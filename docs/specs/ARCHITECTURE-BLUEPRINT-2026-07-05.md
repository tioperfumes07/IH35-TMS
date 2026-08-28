# IH35-TMS — ARCHITECTURE & BLUEPRINT (GUARDRAIL)
**Version:** 2026-07-05 · **Status:** CANONICAL GUARDRAIL — every build block conforms to this. If any older doc, memory, or handoff disagrees, **this wins** (mirror of the in-repo `docs/specs/ACCOUNTING-ARCHITECTURE.md`).

> Purpose: one place that holds the locked decisions so nothing is re-asked, re-guessed, or forgotten, and so **every build block is checked for linkage** before it ships.

---

## 0. ★★★ LAW OF THE LAND — TOTAL CONNECTIVITY (supreme, overrides convenience)
**Everything must be wired, linked, and connected — always.** No record is an island.
Every module, tab, motion, and transaction connects to BOTH:
- **Its financial primitives:** the **vendor OR customer** it's with + the **expense / bill / bill-payment / invoice / journal-entry / liability-or-asset account** it posts to (+ audit link). No money event without a counterparty + a GL account + an audit trail.
- **Its operational context:** the **load / dispatch**, the **driver profile**, the **unit / asset**, and the **maintenance / safety / legal / insurance / customer / vendor** record that caused or relates to it.

Forward **AND** reverse drill-through, on every entity and every tab. From a bill → the load, driver, customer, JE, payment. From a driver → their loads, settlements, bills, escrow/advance accounts, safety events, maintenance, legal, insurance. **A screen or record missing a link is NOT done.**

**Owner-plain complete bar (2026-08-13):** `docs/lockdown/FULLY-WIRED-COMPLETE-BAR-2026-08-13.md` — create→canonical · money · F+R · matrix · **surface bar** (every control→matrix) · chrome · pickers · RLS · guard · **Live Chrome LAST**. That is what “fully wired” means.

---

## 1. HARDLINE QUALITY RULE
Never take the short/easy way, never defer a root problem, never patch, never guess, never fake-green, never claim done without proof — **fix the root cause.** Ground every decision in verified live state (repo/branch/prod/DB/PR) + accepted accounting principles + deep-dive research of **QuickBooks / NetSuite / McLeod / Alvys** — reach and surpass them. Build as if reviewed by a **CPA, auditor, attorney, insurer, lender, DOT/FMCSA reviewer, architect, or court.** Conflicts: speed<trust, easy<correct, guess<verify, move-forward<protect-the-company. Always check the architecture-of-record + blueprint + history before recommending.

---

## 2. DRIVER MODEL — hired contractors, NOT owner-operators
> **SUPERSEDED-BY (1099/withholding wording):** OWNER-DECISIONS-FINAL **E1**. Drivers remain Mexican-B1 contractors with **W-8BEN** on file. **No 1042-S/1099; no withholding.** The historical “1099 / W-8BEN” label below is contractor classification chrome, not a filing obligation.

IH35 drivers are **hired Mexican-B1 external contractors (W-8BEN on file)** — **not** owner-operators.
- Driver pay = a **per-LOAD fixed fee** (`driver_finance.driver_bills.gross_amount_cents`, one bill per load, sourced from the load's `accounting.bills.amount_cents`). The "$/mi" is derived display only.
- The **full customer linehaul is COMPANY revenue**; driver pay is a small independent labor line (**"Cost of Labor–Mexico Drivers"**), booked as **Contract Labor**, never "Purchased Transportation" (that's owner-ops) and never payroll-with-withholding.
- Net-pay floor = **5% EDITABLE** per settlement (code is stale at 10%/50% → FIX). Consent = the **hire contract** (no separate e-sign). Recovery ordering = **pay-first, then escrow**.

---

## 3. SETTLEMENT POSTING — Bill + BillPayment (LOCKED)
Driver settlements post as **Bill + BillPayment** (driver = a **vendor**, for A/P aging + W-8BEN on file) — **not** a single JE. Canonical engine = **`driver_finance.driver_settlements` + `driver_finance.driver_settlement_deductions`** (`payroll.*` retired). **Not** a 1099-filing requirement (E1).

**Bill per LOAD** (numbered by the load #, auto-linked to the settlement). Multiple per-load bills aggregate into ONE settlement (a trip). Worked example — Mecor, 3 loads, 1 settlement:
```
Bill 1 (Load L-1001):  Dr Driver-Pay Expense 525   Cr A/P (Mecor vendor) 525
Bill 2 (Load L-1002):  Dr Driver-Pay Expense 480   Cr A/P (Mecor vendor) 480
Bill 3 (Load L-1003):  Dr Driver-Pay Expense 510   Cr A/P (Mecor vendor) 510
Deductions (pay-first, then escrow):
  Advance recovery 200:  Dr A/P 200  Cr Mecor — Cash Advance (ASSET sub of "Driver Cash Advance")   200
  Escrow withhold   75:  Dr A/P  75  Cr Mecor — Driver Escrow  (LIAB sub of "Driver Escrow")          75
BillPayment (net):       Dr A/P 1,240   Cr Wells Fargo — DIP (WF 6103)   1,240
```
Deductions credit **that driver's OWN** sub-accounts (§4). Wire the orphaned deduction applier into the live close (fixes the driver-overpay bug). Seed the CoA role bindings (0 rows in prod today).

---

## 4. DRIVER ACCOUNTS — auto-provisioned on hire, WIRED
On driver hire the system auto-creates two per-driver CoA accounts and **stores + wires both ids** (no orphans):
1. **Cash-Advance ASSET** — sub-account of parent **"Driver Cash Advance"**, named per driver (advances receivable).
2. **Driver Escrow LIABILITY** — sub-account of a **year-agnostic** parent **"Driver Escrow"** (which sits under the **Damage Claim Escrow** family, QBO-1150040187), child named with **driver name + hire date** (e.g. `"Mecor Perez — Driver Escrow (hired 06/12/2026)"`). Year-agnostic on purpose: a driver's held-in-trust escrow is one continuous balance across employment — never re-parented by calendar year. Escrow returned 60–90 days post-separation, net of claims. The provisioned ids link via `accounting.escrow_accounts` (holder=driver) + a cash-advance link — reachable both directions.

---

## 5. CHART OF ACCOUNTS / ROLE MAPPINGS (locked)
A/R = **QBO-45** · A/P = **QBO-47** · Driver Escrow = **QBO-1150040187** (Damage Claim Escrow, liability) · Cash = **DIP only, Wells Fargo 6103** (never legacy BOA) · Driver-pay expense = "Cost of Labor–Mexico Drivers" · Net-pay clearing = `driver_payroll_clearing` · per-bucket deduction recovery = `{type}_recovery` (advance/damage/lease/insurance/fuel_advance/other). Role bindings live in `catalogs.account_role_bindings` (must be seeded).

---

## 6. FACTORING (Faro) — SECURED BORROWING (ASC 860)
Contract: **Faro Factoring LLC ↔ IH 35 TRANSPORTATION LLC** (eff 2024-12-02, TRANSP only). **With FULL recourse** (mandatory repurchase by day 95 + personal guaranty + UCC first-lien) → **GAAP secured borrowing**, despite the contract styling it a "sale." A/R **stays** on IH35's books (pledged).

**Exact terms:** Factoring Ratio (fee) **1.5% (Tier 1) / 2% (Tier 2)** of Net, at funding · Security Reserve **1.5%** held back · Purchase Price = Net − Fee − Reserve · Proceeds wired = Purchase Price − Transaction Fees (wire etc.) · Repurchase Term **30d** + Grace **5d** · **Default Interest 0.067%/day, compounded daily, after day 35** · Repurchase Deadline **95d** (recourse). Customer pays Faro directly (notification factoring).

**Posting (extend the existing `factoring-posting/poster.service.ts`):**
- **R1 Funding:** Dr Cash(DIP) + Dr Factor-Reserve-Held(asset) + Dr Factor-Fee-Expense / Cr Factoring-Advance-Liability (full Net). A/R untouched.
- **Daily after day 35:** Dr Default-Interest-Expense / Cr Factoring-Advance-Liability (accrual cron — NEW, not built).
- **Customer pays (repurchase):** Dr Factoring-Advance-Liability / Cr A/R; release reserve Dr Cash / Cr Reserve. **← wire this poster to the collection route (built but not called).**
- **Day-95 recourse:** Dr Liability + Dr Default-Interest / Cr Cash; Dr Factoring-Recoursed-AR / Cr A/R. (NEW auto-trigger.)
Open (Faro-contract confirm): exact tier assignment, whether interest/fees draw from reserve vs liability.

---

## 7. PARALLEL DOUBLE-BOOKS ARCHITECTURE
TMS posts its **OWN** journal entries to `catalogs.accounts` / `accounting.journal_entries`. **QBO is system-of-record through the cutover; TMS is NOT a mirror.** **NO write-back to QBO, no two-way sync.** Cutover is **event-gated** (final clone + to-the-cent tie-out + book-lock ceremony), not date-gated — 12/31/2025 passed; stay parallel until the ceremony. Reconciliation twice daily = a correctness test, not a sync.

---

## 8. POSTING FLAGS
All money-posting flags are **per-entity-only, default OFF** (global-enable is forbidden by design — protects USMCA-from-zero + prevents accidental cross-entity posting). **7 GL flags are ON; SETTLEMENT + LEASE are OFF** pending the settlement/lease builds. Re-enable per entity via `lib.feature_flag_overrides` rows (one per flag × entity). **TRANSP first**, with a real Bill+BillPayment / JE proof before each flip. **USMCA starts from 0 (no QBO); TRK < 30 txn/month.** No CPA gate — Jorge decides directly.

---

## 9. ★ PER-BUILD-BLOCK LINKAGE GUARDRAIL (every block must pass ALL)
Before any build block is "done", verify — on live data, forward AND reverse:
- [ ] Every **money transaction** links to a **vendor OR customer** + the **GL account** (expense/bill/bill-payment/invoice/JE/liability/asset) it posts to + an **audit** record.
- [ ] Every transaction links to its **load / dispatch** (where applicable) and the **driver / unit / asset** involved.
- [ ] Cross-module links present where relevant: **maintenance, safety, legal, insurance, customer, vendor** (e.g. a repair bill → unit + vendor + load(G18) + WO + expense acct + JE; a damage deduction → the claim → escrow liability; an insurance/legal event → the entity + its financial impact).
- [ ] **Forward + reverse** drill-through (no dead-end screen, no orphan row).
- [ ] **RLS** entity-scoped + **audit** on every table; verified on **live data**, not assumed.
- [ ] No orphaned created-but-unused id, no built-but-unwired poster/route, no unlinked sub-account.
**If any box is unchecked, the block is NOT done.**

---
*Maintained in lockstep with the auto-memory (`law-of-the-land-total-connectivity`, `finance-build-directive-and-driver-model`, `faro-factoring-contract-terms`) and the in-repo `docs/specs/ACCOUNTING-ARCHITECTURE.md`.*

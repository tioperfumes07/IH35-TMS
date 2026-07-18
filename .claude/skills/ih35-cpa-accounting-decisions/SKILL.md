---
name: ih35-cpa-accounting-decisions
description: >-
  The CPA/owner-LOCKED accounting decisions for IH35-TMS — the parallel double-books architecture, the
  opening-balance basis and cutover, factoring-as-secured-borrowing, driver escrow = liability, cash-basis
  mirroring, revenue recognition, the A/R and A/P account mapping, and the twice-daily reconciliation. Load
  this before building, reviewing, or reasoning about ANYTHING in accounting/finance (opening balances, GL
  posting, factoring, driver settlements, reconciliation, QBO import) so these settled decisions are treated
  as non-negotiable context, never re-derived or re-litigated. These are OWNER/CPA rulings; an agent NEVER
  posts opening/financial entries to prod and NEVER builds GL-posting math solo (design docs only).
---

# IH35-TMS — Locked CPA / accounting decisions

These are **settled** (owner + CPA). Do not re-derive or re-open them; build to them. When code disagrees
with a locked decision, the decision wins — fix the code. Bundled: `resources/locked-decisions-reference.md`
(a scannable decision card). Deeper: `docs/lockdown/00_LOCKED_DECISIONS.md`, `docs/specs/ACCOUNTING-ARCHITECTURE.md`,
`docs/specs/TMS-QBO-PARALLEL-BOOKS.md`, and the CPA Answers Integration Phase 1 section in
`docs/specs/IH35_UNIFIED_BLUEPRINT_ADDITIONS.md`.

## The one rule that governs all of this
**An agent never posts a financial/opening entry to prod, never moves money, and never writes GL-posting
math solo** (constitution §1.4/§1.6). Opening balances are **owner-entered**. You may build read-only engines,
design docs, draft JE/SQL proofs, and flag-OFF scaffolding — the actual posting/flip is the owner's hand + CPA
sign-off. Money-posting env flags stay **OFF** until CPA + Neon tie-out.

## 1. Architecture — PARALLEL double-books (not a sync)
- TMS and QBO run **independently**. **Clone-once + reconcile-only. NO write-back to QBO.**
- Reconciliation is the daily correctness test (see §7), not a data pipeline.
- Canonical parallel-books entry: `docs/specs/TMS-QBO-PARALLEL-BOOKS.md`.

## 2. Opening balance
- TMS parallel books **open 01-01-2025** → opening balance = QBO **Balance Sheet as of 12/31/2024**, **signed-actual**
  (not natural-side). TMS clones 2025-01-01 forward and runs 2025 in parallel while QBO stays SoR through 12/31/2025.
- **BS-only opening.** TRK gets **full equity**. **OBE → Retained Earnings** as a temporary clearing account —
  a permanent Opening Balance Equity balance is a **defect** (must net ≈ 0).
- **The QBO source is a MOVING TARGET:** the internal accountant (Martin) is still cleaning/reconciling. The
  opening JE is **DEFERRED until Martin finalizes the 2024 close** — never snapshot an opening off unstable data.
  Approach = **clone-as-is-then-adjust**: clone the 12/31/2024 balances faithfully (so TMS ties to QBO), then
  book reclasses as **post-opening adjusting entries** (or let Martin fix them at source) so tie-out never breaks.
- Multicurrency: **USD home currency**; MXN via FX gain/loss + home-currency adjustment (ASC 830).
- Ch.11 fresh-start line (owner-final 2026-07-16): opening balances as-of **03/31/2026**; TMS live parallel posting
  from **04/01/2026** per entity after opening tie-out — see `docs/lockdown/00_LOCKED_DECISIONS.md` §8.9.

## 3. Factoring = secured borrowing / recourse (NOT a sale)
Faro (current) → RTS (planned). Book as: **Factoring Advance** (liability) / **Factoring Reserves** (short-term
asset) / **Factoring Recoursed Invoices**. ASC 860 control-test nuance applies; it is financing, not revenue.

**Sanitized Faro commercial terms (owner/CPA verified; actual factor statements remain authoritative):**
- Revolving limit **$1,000,000**
- Tier 1 fee **1.5%**; Tier 2 fee **2%**
- Reserve **1.5%**
- Term **30 days** + grace **5 days**
- Repurchase deadline **95 days**
- Default interest **0.067% per day, compounded daily**
- Do **not** store or echo names, signatures, addresses, emails, personal-guaranty text, or executed-agreement text
  in decision docs. Statement figures win when they differ from summary terms.

## 4. Drivers (Mexican B1 — not W-2, not owner-op)
- Tax form **W-8BEN**, renewed **yearly** (not W-9). "Cost of Labor–Mexico Drivers".
- **5% net-pay floor** (driver keeps ≥5% of gross) + per-event override. Deductions bucketed + per-event, no auto-cap.
- **Driver Cash Advance = asset**; **Driver Escrow = LIABILITY** (held-in-trust, returned 60–90d post-separation
  net of damage/late-fee/fine deductions). Additive CoA account **Driver Damage Loss** for write-offs (do not
  rename/delete any existing damage-loss account). Net-pay clearing account.

## 5. Revenue & basis
- **Cash-basis** mirrored from QBO for TRANSP (books + MOR by the 20th, excl. own-transfers). AP is the rare
  accrual exception.
- Revenue is recognized at **canonical load delivery**, **not** at invoice creation.
- POD / invoice timing is **billing readiness** only — it does not move the recognition event.
- Uncategorized + daily cleanup remains the hygiene rule.

## 6. Chart of Accounts (additive structure — never delete/rename existing)
**Sales of Service** parent separates these children (additive):
- Line Haul
- Fuel Surcharge
- Accessorial Revenue → Detention, Layover, Lumper, TONU, Other

**Interest & Financing Expense** children (additive):
- Factoring Fees
- Factoring Default Interest
- Factoring Transaction/Wire Fees

**Also additive:** Driver Damage Loss.

**Verified CoA export facts (owner-local verification; snapshot for governance — not a live Neon claim):**
- **1,368** rows total · TRANSP **387** · TRK **947** · USMCA **34**
- **1,294** QBO-connected · **1,198** active
- **No** duplicate entity/account-number pairs
- **Zero** opening balances in the export

## 7. Account mapping
- **A/R = QBO-45, A/P = QBO-47** (the QBO-native A/R and A/P are turned off; TMS drives these).
- Receivables kept even when uncollectible-looking: e.g. the "Unauthorized Expenses" receivables (Ignacio,
  Anarely) are **receivables pursued in bankruptcy court — NOT written off, NOT reclassed to expense.**

## 8. Reconciliation (RECON-01) — the correctness spine
- Twice daily **Central**: AM bank count/sum **06:00 CT**, PM categorization diff **19:00 CT**.
- **Flag EVERY account-categorization divergence — no dollar threshold** (it's a correctness test, not
  materiality). Bank-txn match key = date + amount + normalized reference; each unmatched row = its own exception.
- **Read-only, NEVER auto-fixes.** Maker≠checker + written resolution note on every resolve. Runs behind
  `TMS_QBO_RECON_ENABLED` (default OFF), tables `accounting.recon_runs` / `recon_exceptions`.

## 9. Entities & tax
- `TRANSP` (operating carrier, QBO realm = "IH 35 Transportation LLC"), `TRK` (asset holder, owns/depreciates
  units — 5yr straight-line), `USMCA` (future; launches with **0 balances, TMS-only, isolated** July 2026).
- Entities maintain **separate entity books** with **reciprocal intercompany monitoring**.
- Retain existing **read-only consolidated reporting** additively for future reporting needs — never delete
  the consolidated surface; do not treat it as the books of record for a legal entity.
- **No sales tax on line-haul** — interstate/cross-border freight transportation is not TX-sales-taxable.
- Laredo tax entities; Ch.11 confirmed. Money posting stays **OFF** until CPA + Neon tie-out.

---
Cross-refs: [[accounting-architecture-parallel-clone-reconcile]], [[cpa-locked-decisions-2026-07-01]],
[[opening-balance-and-recon-decisions-2026-07-02]], [[driver-escrow-is-liability]],
[[finance-engine-decisions-locked]], [[expense-gl-cash-basis-decision]]. Build engines/design docs; never post solo.

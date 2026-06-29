# V1 — Cash Flow Page — Design

**Status:** Design / Docs only. No posting, no migration. Read-only reporting page. BUILD-AND-HOLD; Jorge merges.
**Date:** 2026-06-28
**Author:** Cascade (design lane)
**Grounding:** the existing journal/posting data model + standard ASC 230 cash-flow structure. The exact
QBO Cash Flow **page chrome** was NOT captured in the 2026-06-28 pass (Reclassify/CoA/Banking were the
priority) → those visual specifics are marked **`[LIVE-CONFIRM]`** (do NOT fabricate).
**Scope note (locked):** **V0 sidebar nav is BLOCKED on a guard conflict — this doc designs the PAGE
ONLY, not the sidebar entry.**

---

## 0. What V1 is
A **Cash Flow** reporting page (QBO parity) that reads existing journal/posting + account data and
presents cash movement for a period. Read-only; no posting. Per-entity.

## 1. Method — INDIRECT (chosen) + justification
**Choose the indirect method** for the default Cash Flow Statement:
- It is derivable from data we already have — **net income** (P&L) adjusted for **non-cash items**
  (depreciation/amortization — ties to FH-1/FH-3) and **changes in working capital** (Δ AR, Δ AP, Δ
  prepaid, Δ accrued) from period-over-period balance-sheet account movements.
- It matches how QuickBooks presents its default Statement of Cash Flows (indirect), so parity is clean.
- The **direct method** (actual cash receipts/payments by category) requires classifying every cash
  posting; offer it later as a secondary view once posting/classification is mature. Document direct as
  a Phase-2 toggle.

## 2. Structure (ASC 230, indirect)
Three sections, each summing to a net change, reconciling to the cash balance change:
1. **Operating activities:** Net income ± non-cash (depreciation, amortization, gain/loss on disposal) ±
   Δ working-capital accounts (AR, AP, prepaid, accrued, deferred revenue).
2. **Investing activities:** asset purchases/disposals (ties to FH-1 Fixed Assets), notes receivable.
3. **Financing activities:** loan proceeds/principal repayment (ties to FH-3 Amortization),
   owner contributions/distributions (equity).
- Footer: **Net change in cash = beginning cash → ending cash** (must reconcile to the bank/cash
  accounts' balance change for the period — a built-in check; show a discrepancy banner if it doesn't tie).

## 3. Data sources (read-only)
- `accounting.journal_entries` + `journal_entry_postings` (the posted GL), grouped by account
  type/detail type to classify into operating/investing/financing.
- Period-over-period balance comparison for working-capital deltas.
- RLS-scoped per `operating_company_id`; **per-entity** (TRK/TRANSP/USMCA separate, never consolidated
  here — consolidation is a separate design).

## 4. Honest empty / partial state (locked)
- When **posting is OFF / no posted data** for the period, the page shows an **honest empty state**
  ("No posted transactions for this period — cash flow will populate once posting is enabled"), NOT
  fabricated/zeroed figures presented as real.
- If only partial data exists (e.g., some modules gated OFF), show what's posted + a note on what's
  excluded. Never imply completeness that isn't there.

## 5. Controls (page only — NO sidebar change)
- Date-range picker (month/quarter/year/custom) · Basis (Accrual/Cash) · Compare-period (optional) ·
  Export/Print. Shared A1 grammar where applicable.
- `[LIVE-CONFIRM]` exact QBO Cash Flow page chrome (column layout, expand/collapse rows, "Customize"
  panel options) — capture from live QBO in a later pass before pixel-level build.

## 6. Acceptance
Indirect method chosen + justified; ASC 230 three-section structure reconciling to cash change; reads
existing posting data, RLS/per-entity; honest empty state when posting OFF; **V0 sidebar untouched**;
QBO-specific chrome marked `[LIVE-CONFIRM]` (not fabricated).

## 7. DO NOT
- DO NOT design or touch the V0 sidebar nav (blocked on a guard conflict).
- DO NOT fabricate QBO Cash Flow chrome — mark `[LIVE-CONFIRM]`.
- DO NOT present zeroed/empty data as real; honest empty state only.
- DO NOT consolidate across entities here (per-entity only).

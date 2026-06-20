# HOLD-01 · CHAIN-03 — Create Bill → GL auto-post (design + draft-only proof)

**Queue:** QUEUE 2 (HOLD / accumulate) · **Tier 1 — money posting**
**Tracker:** CHAIN-03 (row 1111) — the first money-posting proof
**Status:** `[HOLD-FOR-JORGE — TIER 1]` — **do not merge. no flag flip. no live post.**
**Date:** 2026-06-18

> **Why this is a design doc, not posting code.** CLAUDE.md §1.4: *"Never build finance/posting logic
> solo (design docs are fine). Reuse EXISTING posting/GL functions — write NO new GL math."* and §1.7
> (*"do not decide the scope of your own authority"*). §1 overrides the run spec. The GL math already
> exists; the remaining act — **wiring Create-Bill to invoke the poster (even in draft) and/or flipping
> the flag ON** — is the gated step that is Jorge's to authorize. This doc proves the chain on paper and
> hands him a ready, reviewed design. No new GL code, no migration, no flag change is introduced here.

## The posting backbone already exists (reuse targets — write NO new GL math)
- **Block-21 resolver** — `accounting/expense-category-map/resolver.service.ts` →
  `resolveAccountForCategory(operating_company_id, category_kind, category_code)` maps an expense
  category to the GL account (FK into `catalogs.accounts`).
- **Posting engine** — `accounting/posting-engine.service.ts` already has the **bill** path: it loads
  `accounting.bills` (`FOR UPDATE`), rejects voided/ineligible bills (`BILL_NOT_POSTING_ELIGIBLE`),
  resolves the AP account via `resolveApAccountForCompany(...)`, detects the bill-line account column,
  and reads `accounting.bill_lines` (each line's `expense_category_uuid` or a direct account id).
- **JE write** — the engine posts into `accounting.journal_entries` + `accounting.journal_entry_postings`
  (the same backbone trial-balance / balance-sheet / account-register read from). Reuse it as-is.
- **Existing OFF flag** — expense posting is gated behind `EXPENSE_GL_POSTING_ENABLED` /
  `EXPENSE_GL_POSTING_FLAG` (`accounting/expenses.routes.ts`), default **OFF**. CHAIN-03 must ride the
  **bill** analog of this flag (confirm/define the exact bill flag with Jorge) — **default OFF**.

## The chain (Create Bill → GL), proven on paper
1. Bill is created (`accounting.bills` + `accounting.bill_lines`) — **already shipped**, unchanged.
2. *(gated, not wired here)* On create, **if the bill-GL flag is ON**, invoke the existing posting-engine
   bill path in **draft/dry-run** mode.
3. For each bill line: account = the line's direct account id, else
   `resolveAccountForCategory(...)` from the line's `expense_category_uuid` (Block-21). AP account =
   `resolveApAccountForCompany(...)`.
4. Engine assembles a **balanced** JE and (when committed) writes
   `journal_entries` + `journal_entry_postings`.

## Draft JE proof (dry-run shape — Dr expense / Cr AP; balanced)
Example bill: vendor repair bill, total **$1,250.00** = 2 lines (Repair labor $800.00, Parts $450.00),
accrual (AP) recognition.

```
Journal Entry (DRAFT — not posted)
  operating_company_id : 91e0bf0a-… (TRANSP)
  source               : accounting.bills / <bill_id>
  memo                 : "Bill <bill_number> — <vendor>"
  basis                : accrual (AP recognition; cash-basis pays at Bill Payment — see CHAIN-04)

  Line  Dr/Cr  Account (catalogs.accounts)              Amount
  ----  -----  ---------------------------------------  ----------
   1    Dr     6xxx Repair & Maintenance (resolved)     $  800.00
   2    Dr     6xxx Parts/Supplies (resolved)           $  450.00
   3    Cr     2000 Accounts Payable (resolveAp…)        $1,250.00
                                                        ----------
         Σ Dr = $1,250.00   Σ Cr = $1,250.00   →  BALANCED ✔
```
Cents are integers throughout (`80000 + 45000 = 125000` Dr; `125000` Cr). The engine refuses to commit a
JE whose Dr≠Cr, so the dry-run either yields a balanced entry or a hard `ACCOUNT_MAPPING_MISSING` /
imbalance error (surface it, never force-balance).

## What Jorge decides (the gated step — NOT done here)
- Confirm the **exact bill-GL flag name** (bill analog of `EXPENSE_GL_POSTING_ENABLED`), default OFF.
- Authorize **wiring Create-Bill → posting-engine in draft**, then a staging dry-run, then (separately)
  flipping the flag ON for live posting.
- Cash vs. accrual: per the locked decision TRANSP books are **cash basis** (posting cash-primary; AP is
  the rare accrual exception). Confirm whether bill-create posts AP (accrual) now or defers recognition
  to Bill Payment (CHAIN-04). This basis call gates the Cr side.

## Guardrails honored
No new GL math · reuse posting-engine + Block-21 resolver · flag stays OFF · no live post · no migration ·
void-eligibility already enforced by the engine · `[HOLD-FOR-JORGE — TIER 1]`, never merged.

## Dependencies
Feeds CHAIN-04 (Bill Payment tie-out, HOLD-02) and CHAIN-05 (bank-feed post chain, HOLD-03).

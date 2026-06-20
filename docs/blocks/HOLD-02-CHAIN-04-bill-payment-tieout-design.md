# HOLD-02 · CHAIN-04 — Bill Payment tie-out (pay open bill → GL)

**Queue:** QUEUE 2 (HOLD / accumulate) · **Tier 1 — money posting (moves money)**
**Tracker:** CHAIN-04 (row 1112)
**Status:** `[HOLD-FOR-JORGE — TIER 1]` — **do not merge. no flag flip. no live payment.**
**Date:** 2026-06-18 · depends on HOLD-01 (CHAIN-03)

> **Design doc, not posting code** (CLAUDE.md §1.4 / §1.7). The payment-posting GL already exists; the
> gated act — wiring pay-bill to post and/or flipping the flag — is Jorge's. No new GL math, no migration,
> no flag change here.

## Reuse surface (existing — write NO new GL math)
- **Payment poster** — `posting-engine.service.ts` already has the bill-payment path. Per its own
  comment (line ~754): *"CREDIT side — CASH-BASIS PRIMARY: bank/cash when a payment account is set; else
  AP-with-vendor (accrual exception)."* AP resolved via `resolveApAccountForCompany`; the cash/bank
  account comes from the payment's `payment_account_uuid` (else the company-default cash-like account).
- **Payment routes / tables** — `accounting/vendor-bill-payments.routes.ts`,
  `accounting.bill_payments`, `accounting.payments`. Application against the open bill already exists
  (`payment_applications`).
- **Same OFF flag family** as CHAIN-03 (`EXPENSE_GL_POSTING` analog), default **OFF**.

## Tie-out chain (pay an open bill → GL), on paper
1. Open bill exists (status `open`/`partial`) — created in CHAIN-03's chain.
2. *(gated, not wired here)* Record a payment against it (`bill_payments` + `payment_applications`) —
   already shipped.
3. **If the flag is ON**, the engine posts the payment JE in **draft/dry-run**:
   - **Accrual world** (bill posted Dr expense / Cr AP at create): payment = **Dr AP / Cr Bank**.
   - **Cash-basis world** (TRANSP locked default — no AP at create): expense recognition happens here at
     payment: **Dr expense / Cr Bank** (cash-primary). The basis decision from CHAIN-03 selects which.

## Draft JE proof (dry-run — accrual tie-out; balanced)
Paying the $1,250.00 bill from CHAIN-03 in full from the operating bank:

```
Journal Entry (DRAFT — not posted)
  source : accounting.bill_payments / <payment_id>  (applied to bill <bill_id>)
  memo   : "Payment — Bill <bill_number> — <vendor>"

  Dr/Cr  Account (catalogs.accounts)            Amount
  -----  -------------------------------------  ----------
  Dr     2000 Accounts Payable (resolveAp…)     $1,250.00
  Cr     1010 Operating Bank (payment_account)  $1,250.00
                                               ----------
         Σ Dr = $1,250.00   Σ Cr = $1,250.00  → BALANCED ✔

  TIE-OUT after this payment:
    Bill <bill_id> AP balance:  $1,250.00 → $0.00  (status open → paid)
    Net P&L impact of payment:  $0 (expense already recognized at bill in accrual)
```
Cash-basis variant (no prior AP): `Dr 6xxx Expense $1,250.00 / Cr 1010 Bank $1,250.00` — expense lands
here. Either way Σ Dr = Σ Cr; the engine refuses an unbalanced commit.

## Tie-out assertions to verify in the dry-run (no live post)
- Open-bill AP balance **decreases by exactly the payment amount**; full payment → bill `paid`, AP → $0.
- Cash/bank credit equals the payment amount (cents-exact).
- No double-recognition: in accrual, the payment is P&L-neutral (expense was at the bill); in cash-basis,
  expense is recognized once, here.

## Gated for Jorge
Exact bill-payment flag (default OFF) · authorize wiring pay-bill → poster in draft → staging dry-run →
(separately) flag ON · confirm cash-vs-accrual recognition (drives Dr side) per the TRANSP cash-basis lock.

## Guardrails honored
Reuse posting-engine payment path · no new GL math · flag OFF · no live payment · no migration ·
`[HOLD-FOR-JORGE — TIER 1]`, never merged. Feeds CHAIN-05 (bank-feed post chain, HOLD-03).

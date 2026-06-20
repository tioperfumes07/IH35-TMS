# HOLD-03 · CHAIN-05 — Bank feed: categorize → match → post (chain proof)

**Queue:** QUEUE 2 (HOLD / accumulate) · **Tier 1 — money posting**
**Tracker:** CHAIN-05 (row 1113)
**Status:** `[HOLD-FOR-JORGE — TIER 1]` — **do not merge. no flag flip. no live GL write.**
**Date:** 2026-06-18 · depends on HOLD-01/02

> **Design doc, not posting code** (§1.4 / §1.7). Reuse existing GL/categorization; no new math, no
> migration, no flag flip.

## Reuse surface (existing)
- **Bank feed** — `banking.bank_transactions` (`is_credit` bool: credit = money in, debit = money out).
- **Categorization / rules** — `accounting.banking_rules`, vendor categorization
  (`vendor-category.routes.ts` / `.constants.ts`), `accounting/expenses.routes.ts` categorize path.
- **Matching** — reconciliation surface (`reconciliation.routes.ts`) ties a bank line to an existing
  bill/payment.
- **Poster** — `posting-engine.service.ts` (same backbone as CHAIN-03/04). Flag = `EXPENSE_GL_POSTING`
  analog, **OFF**.

## Chain (categorize → match → post), on paper
1. **Categorize** the bank transaction (rule or manual) → assigns an expense category / GL account.
2. **Match** against an existing bill/payment if one exists (avoid double-counting); else mark as a
   direct/standalone spend ("post-as-bill").
3. *(gated, not wired here)* **Post** in **draft** via the engine when the flag is ON.

## Draft entries (dry-run; balanced) — two cases
**A. Bank debit, no matching bill (direct expense, cash-basis primary):**
```
DRAFT JE — source: banking.bank_transactions / <txn_id> (is_credit=false, $420.00 fuel)
  Dr  6xxx Fuel/Diesel (categorized account)   $420.00
  Cr  1010 Operating Bank                       $420.00
  Σ Dr = Σ Cr = $420.00  → BALANCED ✔
```
**B. Bank debit matched to an existing open bill (settles AP):**
```
DRAFT JE — source: bank txn matched to bill <bill_id>  ($1,250.00)
  Dr  2000 Accounts Payable                    $1,250.00
  Cr  1010 Operating Bank                       $1,250.00
  Σ Dr = Σ Cr  → BALANCED ✔   (this is the CHAIN-04 payment, sourced from the bank feed)
```
**Match guard:** a bank line already represented by a posted bill payment must **not** post again —
the match step dedupes; the dry-run asserts no transaction posts twice.

## Gated for Jorge
Exact flag (OFF) · authorize categorize→match→post wiring in draft → staging dry-run → flag ON ·
confirm the dedupe/match rule so a bank line and its bill never double-post.

## Guardrails
Reuse engine + categorization · no new GL math · flag OFF · no live GL write · no migration ·
`[HOLD-FOR-JORGE — TIER 1]`, never merged.

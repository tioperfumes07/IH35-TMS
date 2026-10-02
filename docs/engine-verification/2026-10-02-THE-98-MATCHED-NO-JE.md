# THE 98 — matched bank lines with no journal entry

**Measured:** 2026-10-02 · Neon `br-fancy-credit-akjnd07a` · `SET LOCAL app.bypass_rls = 'lucia'` · USMCA `5c854333-6ea5-4faa-af31-67cb272fef80` · real rows only (`is_sample_data IS NOT TRUE`) · `voided_at IS NULL`

## One-query answer (owner decision input)

```
matched_total     = 98
matched_with_je   = 0
matched_no_je     = 98
matched_no_je_real= 98
```

**Verdict:** every USMCA bank line currently stamped `review_state = 'matched'` is a **half-write** — the match stamp is present, the JE pointer is null. This is **data**, not a tip-engine defect in the current match writer (tip survivors: match=`acceptMatchWithResolveDifference` + same-txn JE stamp; unmatch=`unmatchBankTransaction`). Historical stamps predate the one-writer / same-txn JE requirement.

## Pointer breakdown (same 98)

| pointer present | n |
|---|---:|
| fuel (`matched_fuel_transaction_id` OR `matched_relay_fuel_transaction_id`) | **69** |
| settlement (`matched_settlement_id`) | **21** |
| expense (`matched_expense_id`) | **8** |
| transfer / load / invoice / bill / bill_payment / payment / faro / advance | 0 |

| metric | value |
|---|---|
| abs amount sum | **$68,208.84** (`6820884` cents) |
| posted_date range | **2026-08-08 … 2026-09-11** |

## What this means for the owner

1. **Do not treat the 98 as live matched money.** Unmatch of a JE-less stamp clears `review_state → for_review` with `cleared_without_reversing_je=true` — there is nothing to reverse.
2. **Clearing path:** owner-authorized re-match (or categorize) through the tip engine so each line gets a real JE in the same transaction. Seats do not match/categorize in production.
3. **Fuel 69 of 98** aligns with the separate Relay unposted census ($20,942.94 / 44 txs) — overlapping class: fuel fills stamped matched without GL.

## Fork proof already on record (does not clear the 98)

`br-bitter-sunset-ak409eug` synthetic: match JE + stamp, then unmatch + reversing JE in **one** txid `14894119` — proves the **writer** when a JE exists. It does not heal the 98 historical half-writes.

## SQL (re-runnable)

```sql
SELECT set_config('app.bypass_rls','lucia',true);

SELECT
  count(*) FILTER (WHERE review_state = 'matched') AS matched_total,
  count(*) FILTER (WHERE review_state = 'matched' AND matched_journal_entry_id IS NULL) AS matched_no_je,
  count(*) FILTER (WHERE review_state = 'matched' AND matched_journal_entry_id IS NOT NULL) AS matched_with_je
FROM banking.bank_transactions
WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'
  AND voided_at IS NULL
  AND COALESCE(is_sample_data,false) = false;
```

NO production post / seed / feed / match / categorize by this seat.

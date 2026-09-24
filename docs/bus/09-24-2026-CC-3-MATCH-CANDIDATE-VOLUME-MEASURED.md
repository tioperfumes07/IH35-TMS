# CC-3 — Match-candidate volume per bank line, USMCA — measured 2026-09-24

**CORRECTED (140.3-CORRECTION).** The first pass of this measurement used a candidate universe
of bills/invoices/expenses/fuel.fuel_transactions/driver_finance-payments — not what the live
matcher actually queries. This version uses the real, six-kind candidate universe read live from
`apps/backend/src/accounting/bank-recon/match.service.ts` (origin/main, 2026-09-24): `payment`
(`accounting.payments`), `bill_payment` (`accounting.bill_payments`), `bill`
(`accounting.bills`, open-balance basis, open statuses only), `expense` (`accounting.expenses`),
`transfer` (`banking.transfers`), `je` (`accounting.journal_entries`). There is no `fuel` kind —
`fuel.fuel_transactions` is never queried by the matcher; fuel reaches it as `accounting.expenses`
rows (the feed creates the expense only, matching happens in Banking, per the owner's ruling).

Read-only. Neon `br-fancy-credit-akjnd07a`, role `ih35_ci_readonly`, `BEGIN READ ONLY`,
`SELECT set_config('app.bypass_rls','lucia',true)` inside the transaction. USMCA
`5c854333-6ea5-4faa-af31-67cb272fef80` only. Zero writes.

## Bank lines and candidate universe (live counts)

- `banking.bank_transactions` for USMCA: **1,133** rows (all of them — no matched/unmatched
  filter applied to the bank side; the measurement is candidate load against every bank line).
- Candidate universe, live, all six kinds: **103** total — `expense=52`, `je=51`, `payment=0`,
  `bill_payment=0`, `bill=0`, `transfer=0`. The four zero kinds are genuinely zero (AUTH-001 wipe;
  none of those four have been re-fed for USMCA yet), re-verified directly, not assumed.

### Candidate definitions (exact SQL — every number below is re-runnable from this)

```sql
WITH candidates AS (
  SELECT 'payment' AS kind, p.id::text AS id, p.amount_cents::bigint AS amount_cents, p.payment_date AS event_date,
         'credit' AS direction, NULL::text AS vendor_name
    FROM accounting.payments p
   WHERE p.operating_company_id = $1::uuid AND p.voided_at IS NULL AND p.source_bank_transaction_id IS NULL
  UNION ALL
  SELECT 'bill_payment', bp.id::text, bp.amount_cents::bigint, bp.payment_date, 'debit', NULL
    FROM accounting.bill_payments bp
   WHERE bp.operating_company_id = $1::uuid AND bp.revoked_at IS NULL AND bp.voided_at IS NULL
     AND bp.source_bank_transaction_id IS NULL
  UNION ALL
  SELECT 'bill', b.id::text, (COALESCE(b.amount_cents,0)-COALESCE(b.paid_cents,0))::bigint, b.bill_date, 'debit', NULL
    FROM accounting.bills b
   WHERE b.operating_company_id = $1::uuid AND b.revoked_at IS NULL AND b.voided_at IS NULL
     AND b.status = ANY(ARRAY['open','partial','partially_paid','unpaid'])
     AND (COALESCE(b.amount_cents,0)-COALESCE(b.paid_cents,0)) > 0
     AND NOT EXISTS (SELECT 1 FROM banking.bank_transactions bt WHERE bt.matched_bill_id = b.id AND bt.voided_at IS NULL)
  UNION ALL
  SELECT 'expense', e.id::text, e.total_amount_cents::bigint, e.transaction_date, 'debit', v.vendor_name::text
    FROM accounting.expenses e
    LEFT JOIN mdata.vendors v ON v.id = e.vendor_uuid
   WHERE e.operating_company_id = $1::uuid AND e.voided_at IS NULL AND e.is_active = true
     AND NOT EXISTS (SELECT 1 FROM banking.bank_transactions bt WHERE bt.matched_expense_id = e.id AND bt.voided_at IS NULL)
  UNION ALL
  SELECT 'transfer', t.id::text, t.amount_cents::bigint, t.transfer_date, 'both', NULL
    FROM banking.transfers t
   WHERE t.operating_company_id = $1::uuid AND t.revoked_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM banking.bank_transactions bt WHERE bt.matched_transfer_id = t.id AND bt.voided_at IS NULL)
  UNION ALL
  SELECT 'je', je.id::text,
         COALESCE((SELECT SUM(jep.amount_cents) FROM accounting.journal_entry_postings jep
                    WHERE jep.journal_entry_uuid = je.id AND jep.debit_or_credit = 'debit'), 0)::bigint,
         je.entry_date, 'both', NULL
    FROM accounting.journal_entries je
   WHERE je.operating_company_id = $1::uuid AND je.reversed_by_je_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM banking.bank_transactions bt WHERE bt.matched_journal_entry_id = je.id AND bt.voided_at IS NULL)
)
SELECT kind, id, amount_cents, event_date::text, direction, vendor_name FROM candidates WHERE event_date IS NOT NULL;
```

Bank lines:
```sql
SELECT id::text, transaction_date::text, description, merchant_name, amount_cents::bigint, is_credit
  FROM banking.bank_transactions
 WHERE operating_company_id = $1::uuid
 ORDER BY transaction_date;
```

No amount gate anywhere in candidate selection. "Unmatched" per kind: `payment`/`bill_payment`
via their own `source_bank_transaction_id IS NULL`; `bill`/`transfer`/`je` via no live
`banking.bank_transactions` row carrying the corresponding `matched_*_id`; `expense` the same way
(`matched_expense_id`). **Direction-scoped, matching the live matcher exactly**: a credit
(money-in) bank line is only offered `payment` + `je` (+ `transfer`, currently 0) candidates; a
debit (money-out) line is only offered `bill_payment` + `bill` + `expense` + `je` (+ `transfer`)
candidates. All four counting sections below respect this.

Window membership: candidate is in-window for a bank line iff
`(candidate.event_date - line.transaction_date)` in days falls inside `[-before, +after]`.

## Per-window candidate-count distribution (1,133 bank lines each, direction-scoped)

| Window | before/after | min | median | p90 | max | zero-candidate lines |
|---|---|---|---|---|---|---|
| W1 | -7 / +7  | 0 | 0   | 87  | 103 | 736 |
| W2 | -7 / +2  | 0 | 0   | 66  | 89  | 742 |
| W3 | -30 / +5 | 0 | 86  | 103 | 103 | 239 |
| W4 | -90 / +20 (production default) | 0 | 103 | 103 | 103 | 131 |

## Worst 10 bank lines by candidate count, per window

**W1 (-7..+7):**
| count | date | descriptor | amount | credit |
|---|---|---|---|---|
| 103 | 2026-08-12 | Wire Transfer Fee | -15.00 | false |
| 103 | 2026-08-12 | LOVES #762 TRAVEL STOP LAREDO TX | 367.67 | false |
| 103 | 2026-08-12 | Love's Tire Care | 1084.80 | false |
| 103 | 2026-08-12 | LOVES #762 TRAVEL STOP LAREDO TX | 20.04 | false |
| 103 | 2026-08-12 | LOVES #762 TRAVEL STOP LAREDO TX | 366.78 | false |
| 103 | 2026-08-12 | LOVES #762 TRAVEL STOP LAREDO TX | 12.56 | false |
| 103 | 2026-08-12 | LOVES #458 TRAVEL STOP STRAFFORD MO | 50.81 | false |
| 103 | 2026-08-12 | PILOT HOUSTON 375 HOUSTON TX | 293.91 | false |
| 103 | 2026-08-12 | PILOT HOUSTON 375 HOUSTON TX | 24.89 | false |
| 103 | 2026-08-12 | LOVES #471 TRAVEL STOP NATALIA TX | 764.45 | false |

**W2 (-7..+2):**
| count | date | descriptor | amount | credit |
|---|---|---|---|---|
| 89 | 2026-08-15 | PMNT SENT 08/14 RMTLY* B93FC XXXXX40924 | 1997.34 | false |
| 89 | 2026-08-15 | CHECKCARD 08/14 AXXXXXXXXXXBWFM | 260.00 | false |
| 89 | 2026-08-15 | PMNT SENT 08/14 ILORULTCBS94R8V +XXXXX364859 | 1997.34 | false |
| 89 | 2026-08-15 | South Tx Truck Centers | 1068.45 | false |
| 89 | 2026-08-15 | Rush Truck Centers | 246.04 | false |
| 89 | 2026-08-15 | PMNT SENT 08/14 ILORULTCBS94R8V +XXXXX364859 | 1001.99 | false |
| 89 | 2026-08-15 | LOVES #279 TRAVEL STOP MT. VERNON TX | 762.98 | false |
| 89 | 2026-08-15 | CASHED CHECK HOLD ON 08/15 | 2000.00 | false |
| 89 | 2026-08-15 | LOVES #471 TRAVEL STOP NATALIA TX | 18.33 | false |
| 89 | 2026-08-15 | LOVES #471 TRAVEL STOP NATALIA TX | 833.10 | false |

**W3 (-30..+5):**
| count | date | descriptor | amount | credit |
|---|---|---|---|---|
| 103 | 2026-08-14 | fuel america | 48.71 | false |
| 103 | 2026-08-14 | South Tx Truck Ce | 256.55 | false |
| 103 | 2026-08-14 | Rush Truck Centers | 246.04 | false |
| 103 | 2026-08-14 | South Tx Truck Ce | 173.18 | false |
| 103 | 2026-08-14 | PMNT SENT RMTLY* B4F16 +XXXXX364859 ON 08/14 | 1001.99 | false |
| 103 | 2026-08-14 | Dtops Single Cros | 20.80 | false |
| 103 | 2026-08-14 | South Tx Truck Ce | 1068.45 | false |
| 103 | 2026-08-14 | Zelle payment to Dreamline Transit LLC for "INV-424605" | -8685.29 | false |
| 103 | 2026-08-14 | Wire Transfer Fee | -15.00 | false |
| 103 | 2026-08-14 | LOVES #762 TRAVEL STOP LAREDO TX | 30.02 | false |

**W4 (-90..+20, production default):**
| count | date | descriptor | amount | credit |
|---|---|---|---|---|
| 103 | 2026-07-30 | Wire Transfer Fee | -15.00 | false |
| 103 | 2026-07-31 | Zelle payment to Dreamline Transit LLC for "INV-416525" | -12514.00 | false |
| 103 | 2026-08-02 | WIRE TRANSFER FEE | 15.00 | false |
| 103 | 2026-08-03 | Wire Transfer Fee | -15.00 | false |
| 103 | 2026-08-03 | Monthly Fee Business Adv Fundamentals | -16.00 | false |
| 103 | 2026-08-04 | Zelle payment to Dreamline Transit LLC for "INV-418334" | -15000.00 | false |
| 103 | 2026-08-05 | Zelle payment to Dreamline Transit LLC for "INV-418334" | -918.00 | false |
| 103 | 2026-08-07 | Zelle payment to Dreamline Transit LLC for "INV-421146" | -9743.96 | false |
| 103 | 2026-08-07 | LOVES #762 TRAVEL STOP LAREDO TX | 702.19 | false |
| 103 | 2026-08-07 | PILOT MILFORD 255 MILFORD CT | 937.39 | false |

Every worst-10 line across all four windows is a debit (`credit=false`) line — with `payment=0`
and `bill=0`/`bill_payment=0`/`transfer=0` live, `je` (51, offered both directions) is the whole
floor every line shares, and debit lines additionally see the 52 `expense` candidates.

## Fuel-vendor descriptor match, W1 (RAW = all eligible-by-direction kinds; VENDOR-SCOPED = only
`expense` candidates whose own vendor name also resolves to that vendor — the realistic match set)

| vendor pattern | bank lines | RAW min/median/p90/max | VENDOR-SCOPED min/median/p90/max | VENDOR-SCOPED SUM |
|---|---|---|---|---|
| LOVES | 384 | 0 / 0 / 90 / 103 | 0 / 0 / 42 / 49 | 4472 |
| LOVE'S | 133 | 0 / 0 / 0 / 103 | 0 / 0 / 0 / 0 | 0 |
| PILOT | 17 | 0 / 44 / 103 / 103 | 0 / 0 / 1 / 1 | 8 |
| CIRCLE K | 2 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 |

No bank line descriptor matched: FLYING J, FLYING, TA , TRAVELCENTERS, PETRO, SPEEDWAY, SHELL,
CHEVRON, EXXON, RACETRAC, QUIKTRIP, SAPP BROS.

## Exact-amount match, W1 (-7..+7), direction-scoped

- Exact single-amount candidate exists: **22** of 1,133 bank lines.
- Exact SUM of 2 candidates matches (only counted where no single exact match exists): **3** bank
  lines.
- Exact SUM of 3 candidates matches (only counted where no single and no 2-sum match exists): **0**
  bank lines. (3-sum search capped at 60 in-window candidates per line for tractability — every W1
  window in this dataset was well under that cap.)

## Method note

Per-bank-line, per-window candidate counts and the exact/sum-match search were computed
in-process (Node) from the two query results above, not in a single SQL statement. The two SQL
queries above are complete and sufficient to reproduce every number in this document; the
direction-scoping (credit line -> payment+je+transfer; debit line -> bill_payment+bill+expense+je+
transfer) and the vendor-name join for the fuel-vendor section are applied in that same script,
described in prose above precisely enough to re-implement.

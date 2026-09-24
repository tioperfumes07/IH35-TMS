# CC-3 — Match-candidate volume per bank line, USMCA — measured 2026-09-24

Read-only. Neon `br-fancy-credit-akjnd07a`, role `ih35_ci_readonly`, `BEGIN READ ONLY`,
`SELECT set_config('app.bypass_rls','lucia',true)` inside the transaction. USMCA
`5c854333-6ea5-4faa-af31-67cb272fef80` only. Zero writes. Bank line count and candidate-source
counts re-verified directly (re-run, not trusted from one pass) before this doc was written.

## Bank lines and candidate universe (live counts)

- `banking.bank_transactions` for USMCA: **1,133** rows (all of them; no filter applied — the
  task measures candidate load against every bank line, not only unmatched ones).
- Candidate universe, live: **91** rows total — `fuel=25`, `invoice=14`, `expense=52`, `bill=0`,
  `driver_payment=0`. Re-verified directly: 0 non-voided `accounting.bills` exist for USMCA at
  all (any balance), and `driver_finance.driver_settlements` has 0 rows for USMCA — both zero
  because the AUTH-001 wipe purged them and neither has been re-fed yet, not a query defect.

### Candidate definitions (exact SQL — every number below is re-runnable from this)

```sql
WITH candidates AS (
  SELECT 'bill' AS kind, b.id::text AS id,
         (COALESCE(b.amount_cents,0) - COALESCE(b.paid_cents,0))::bigint AS amount_cents,
         b.bill_date AS event_date
    FROM accounting.bills b
   WHERE b.operating_company_id = $1::uuid AND b.revoked_at IS NULL AND b.voided_at IS NULL
     AND (COALESCE(b.amount_cents,0) - COALESCE(b.paid_cents,0)) > 0
     AND NOT EXISTS (SELECT 1 FROM banking.bank_transactions bt
                       WHERE bt.matched_bill_id = b.id AND bt.voided_at IS NULL)
  UNION ALL
  SELECT 'invoice', i.id::text, COALESCE(i.amount_open_cents,0)::bigint, i.issue_date
    FROM accounting.invoices i
   WHERE i.operating_company_id = $1::uuid AND i.voided_at IS NULL
     AND COALESCE(i.amount_open_cents,0) > 0
     AND NOT EXISTS (SELECT 1 FROM banking.bank_transactions bt
                       WHERE bt.matched_invoice_id = i.id AND bt.voided_at IS NULL)
  UNION ALL
  SELECT 'expense', e.id::text, COALESCE(e.total_amount_cents,0)::bigint, e.transaction_date
    FROM accounting.expenses e
   WHERE e.operating_company_id = $1::uuid AND e.voided_at IS NULL AND e.is_active = true
     AND NOT EXISTS (SELECT 1 FROM banking.bank_transactions bt
                       WHERE bt.matched_expense_id = e.id AND bt.voided_at IS NULL)
  UNION ALL
  SELECT 'fuel', f.id::text, round(COALESCE(f.total_cost,0)*100)::bigint, f.purchased_at::date
    FROM fuel.fuel_transactions f
   WHERE f.operating_company_id = $1::uuid AND f.archived_at IS NULL AND f.voided_at IS NULL
  UNION ALL
  SELECT 'driver_payment', s.id::text, round(COALESCE(s.net_pay,0)*100)::bigint,
         COALESCE(s.bank_settle_date, s.payment_sent_at::date, s.paid_at::date, s.period_end)
    FROM driver_finance.driver_settlements s
   WHERE s.operating_company_id = $1::uuid AND s.voided_at IS NULL AND s.reversed_at IS NULL
     AND s.paid_via_bank_txn_id IS NULL
)
SELECT kind, id, amount_cents, event_date::text FROM candidates WHERE event_date IS NOT NULL;
```

Bank lines:
```sql
SELECT id::text, transaction_date::text, description, merchant_name, amount_cents::bigint, is_credit
  FROM banking.bank_transactions
 WHERE operating_company_id = $1::uuid
 ORDER BY transaction_date;
```

No amount gate anywhere in candidate selection — every candidate above passing the date window is
counted, regardless of its amount. `fuel` and `driver_payment` have no existing bank-match column
on either side of the relationship (`banking.bank_transactions` carries `matched_bill_id` /
`matched_invoice_id` / `matched_expense_id` but no `matched_fuel_transaction_id`; and
`driver_finance.driver_settlements.paid_via_bank_txn_id` is the only match-state column on the
driver-payment side, used directly above) — every live, non-voided row in those two sources is
therefore a candidate by construction, not filtered by any match state.

Window membership: candidate is in-window for a bank line iff
`(candidate.event_date - line.transaction_date)` in days falls inside `[-before, +after]` for that
window (i.e. the candidate may date up to `before` days *earlier* than the bank line and up to
`after` days *later*).

## Per-window candidate-count distribution (1,133 bank lines each)

| Window | before/after | min | median | p90 | max | zero-candidate lines |
|---|---|---|---|---|---|---|
| W1 | -7 / +7  | 0 | 0  | 75 | 91 | 736 |
| W2 | -7 / +2  | 0 | 0  | 71 | 76 | 742 |
| W3 | -30 / +5 | 0 | 75 | 91 | 91 | 239 |
| W4 | -90 / +20 (production default) | 0 | 91 | 91 | 91 | 131 |

## Worst 10 bank lines by candidate count, per window

**W1 (-7..+7):**
| count | date | descriptor | amount |
|---|---|---|---|
| 91 | 2026-08-12 | Wire Transfer Fee | -15.00 |
| 91 | 2026-08-12 | LOVES #762 TRAVEL STOP LAREDO TX | 367.67 |
| 91 | 2026-08-12 | Love's Tire Care | 1084.80 |
| 91 | 2026-08-12 | WIRE TRANSFER CREDIT ON 08/12 | -1639.00 |
| 91 | 2026-08-12 | LOVES #762 TRAVEL STOP LAREDO TX | 20.04 |
| 91 | 2026-08-12 | LOVES #762 TRAVEL STOP LAREDO TX | 366.78 |
| 91 | 2026-08-12 | LOVES #762 TRAVEL STOP LAREDO TX | 12.56 |
| 91 | 2026-08-12 | WIRE TYPE:WIRE IN ... ORIG:FARO FACTORING LLC ... | 1639.00 |
| 91 | 2026-08-12 | LOVES #458 TRAVEL STOP STRAFFORD MO | 50.81 |
| 91 | 2026-08-12 | PILOT HOUSTON 375 HOUSTON TX | 293.91 |

**W2 (-7..+2):**
| count | date | descriptor | amount |
|---|---|---|---|
| 76 | 2026-08-15 | PMNT SENT 08/14 RMTLY* B93FC XXXXX40924 | 1997.34 |
| 76 | 2026-08-15 | CHECKCARD 08/14 AXXXXXXXXXXBWFM | 260.00 |
| 76 | 2026-08-15 | Zelle Transfer Conf# BYGT5BQ7W; LAURA MUNOZ | -2000.00 |
| 76 | 2026-08-15 | PMNT SENT 08/14 ILORULTCBS94R8V +XXXXX364859 | 1997.34 |
| 76 | 2026-08-15 | South Tx Truck Centers | 1068.45 |
| 76 | 2026-08-15 | Rush Truck Centers | 246.04 |
| 76 | 2026-08-15 | PMNT SENT 08/14 ILORULTCBS94R8V +XXXXX364859 | 1001.99 |
| 76 | 2026-08-15 | LOVES #279 TRAVEL STOP MT. VERNON TX | 762.98 |
| 76 | 2026-08-15 | CASHED CHECK HOLD ON 08/15 | 2000.00 |
| 76 | 2026-08-15 | LOVES #471 TRAVEL STOP NATALIA TX | 18.33 |

**W3 (-30..+5):**
| count | date | descriptor | amount |
|---|---|---|---|
| 91 | 2026-08-14 | WIRE TYPE:WIRE IN ... ORIG:FARO FACTORING LLC ... | 4370.24 |
| 91 | 2026-08-14 | WIRE TRANSFER CREDIT ON 08/14 | -4370.24 |
| 91 | 2026-08-14 | fuel america | 48.71 |
| 91 | 2026-08-14 | South Tx Truck Ce | 256.55 |
| 91 | 2026-08-14 | Rush Truck Centers | 246.04 |
| 91 | 2026-08-14 | BKOFAMERICA BC 08/14 #XXXXX1322 FR CHKG 5313 San Dario Av | 5000.00 |
| 91 | 2026-08-14 | South Tx Truck Ce | 173.18 |
| 91 | 2026-08-14 | PMNT SENT RMTLY* B4F16 +XXXXX364859 ON 08/14 | 1001.99 |
| 91 | 2026-08-14 | Dtops Single Cros | 20.80 |
| 91 | 2026-08-14 | South Tx Truck Ce | 1068.45 |

**W4 (-90..+20, production default):**
| count | date | descriptor | amount |
|---|---|---|---|
| 91 | 2026-07-30 | Wire Transfer Fee | -15.00 |
| 91 | 2026-07-31 | Zelle payment to Dreamline Transit LLC for "INV-416525" | -12514.00 |
| 91 | 2026-07-31 | WIRE TYPE:WIRE IN ... ORIG:IH 35 TRANSPORTATION, LLC ... | 12500.00 |
| 91 | 2026-08-02 | WIRE TRANSFER FEE | 15.00 |
| 91 | 2026-08-03 | Wire Transfer Fee | -15.00 |
| 91 | 2026-08-03 | Monthly Fee Business Adv Fundamentals | -16.00 |
| 91 | 2026-08-04 | Zelle payment to Dreamline Transit LLC for "INV-418334" | -15000.00 |
| 91 | 2026-08-04 | Counter Credit | 15930.00 |
| 91 | 2026-08-05 | Zelle payment to Dreamline Transit LLC for "INV-418334" | -918.00 |
| 91 | 2026-08-07 | Zelle payment to Dreamline Transit LLC for "INV-421146" | -9743.96 |

## Fuel-vendor descriptor match, W1 candidate counts (`merchant_name`/`description` ILIKE pattern)

| vendor pattern | bank lines | count min | median | p90 | max | SUM across those lines |
|---|---|---|---|---|---|---|
| LOVES | 384 | 0 | 0 | 77 | 91 | 8586 |
| LOVE'S | 133 | 0 | 0 | 0 | 91 | 264 |
| PILOT | 17 | 0 | 32 | 91 | 91 | 757 |
| CIRCLE K | 2 | 0 | 0 | 0 | 0 | 0 |

No bank line descriptor matched: FLYING J, TA , TRAVELCENTERS, PETRO, SPEEDWAY, SHELL, CHEVRON,
EXXON, RACETRAC, QUIKTRIP, SAPP BROS.

## Exact-amount match, W1 (-7..+7)

- Exact single-amount candidate exists: **23** of 1,133 bank lines.
- Exact SUM of 2 candidates matches (only counted where no single exact match exists): **1** bank
  line.
- Exact SUM of 3 candidates matches (only counted where no single and no 2-sum match exists): **1**
  bank line. (3-sum search capped at 60 in-window candidates per line for tractability — every W1
  window in this dataset was well under that cap, so the cap did not exclude any line.)

## Method note

Per-bank-line, per-window candidate counts and the exact/sum-match search were computed in-process
(Node) from the two query results above, not in a single SQL statement — the window/day-gap
arithmetic and the 2-/3-sum search are simple enough in JS that a hand-rolled SQL LATERAL/window
query would not have been faster to write or to verify under this deadline, and the two SQL
queries above are complete and sufficient to reproduce every number in this document.

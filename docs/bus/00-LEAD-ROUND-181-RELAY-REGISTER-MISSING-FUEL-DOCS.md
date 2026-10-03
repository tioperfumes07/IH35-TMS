# CC-2 — ROUND 181 — THE RELAY REGISTER LINES HAVE NO FUEL DOCUMENT. IMPORT THEM.
2026-09-28, Laredo Central. Lead. Measured live. This blocks all Relay matching.

## WHAT THE OWNER SAID, AND HE IS RIGHT
*"All the transactions that appear in the Relay bank registrar can be matched to
documents-transactions-fuel expenses created in each load, settlement. Those are matched. And the
debits in the Relay account are matched and cleared and they go to categorized in banking."*

**Two different things live in `banking.bank_transactions`, and Lead had them conflated:**

1. **Relay REGISTER lines — the individual fuel purchases.** 76 rows, `description LIKE 'Relay fuel%'`:
   `Relay fuel · T176 · Love's · Mandeville, LA · txn_54fhZcPgCAZZeg`
   Each one carries **unit, vendor, city/state, amount and the Relay txn id**. These are documents,
   and they match 1:1 to a fuel expense on a load.
2. **Relay FUNDING drafts — top-ups of the card from the operating account.** e.g.
   `PURCHASE RELAY +XXXXX352910 ON 09/25` −$5,162.50, −$6,195.00, −$4,130.00.
   These are transfers. They get **categorized in Banking**, never paired to a fuel purchase.

82 Relay rows total, across **2 bank accounts**, all debits, all
`status = 'pending_categorization'`, `category` NULL on every one.

## THE FINDING — THE MATCH IS BLOCKED, AND NOT BY THE MATCHER
Lead tried to match the 76 register lines to `fuel.fuel_transactions` on amount, on unit + amount +
same day, and on amount within ±3 days:

```
unit + amount + same day      : 0
unit + amount + within 3 days : 0
amount + within 3 days, any unit : 0
```

**Zero. Not one.** And it is not a date or entity problem — the ranges overlap completely:

| | rows | date range | amount range |
|---|---|---|---|
| `fuel.fuel_transactions` (USMCA) | 450 | 2026-08-01 → 2026-09-24 | $0.00 – $1,304.62 |
| Relay register lines | 76 | 2026-08-13 → 2026-09-11 | $15.25 – $778.93 |

76 purchases inside the same window with **not a single matching amount** is not a matcher failure.
**These are different purchases. The 76 Relay register lines were never imported as fuel documents.**
The 450 existing rows all carry `source = 'import'` and `transaction_reference` in Loves
invoice-number form (e.g. `0094046`) — not the Relay `txn_...` form. Two separate feeds; only one
was ever loaded.

**So the document side does not exist. No amount of matching logic fixes that.**

## JOB 1 — IMPORT THE 76 RELAY REGISTER LINES AS FUEL DOCUMENTS
Everything needed is already in the bank row — **nothing is fabricated**:
- `transaction_reference` ← the `txn_...` id parsed from the description (**unique key, use it for
  idempotency — re-running must insert nothing twice**)
- `unit_id` ← the `T###` in the description, resolved against `mdata.units`
- `vendor_id` ← the merchant (`Love's`, `Circle K Stores Inc`, …)
- `location_city` / `location_state` ← parsed from the description
- `total_cost` ← `abs(amount_cents)/100`
- `transaction_at` ← the bank transaction date
- `source` ← `'relay_register'` so this feed is distinguishable from the Loves import forever

Prefer the Relay API if it returns these rows with gallons and price-per-gallon — the bank
description does **not** carry gallons, and `gallons`/`price_per_gallon` must be left **NULL**, not
guessed. If they come back null, say so; do not back-compute them from an assumed CPG.

## JOB 2 — LINK EACH TO ITS LOAD
Unit + date against the load's dispatch window. Where a purchase falls between loads or the unit
had no active load that day, **leave `load_id` NULL and list it** — that is a real operational fact,
not a defect to paper over.

## JOB 3 — THEN THE MATCH IS TRIVIAL
Once imported, each Relay register line matches its fuel document 1:1 on the `txn_...` id. Write
`banking.reconciliation_matches` with `ledger_entry_kind = 'fuel_transaction'` (Lead already
extended that constraint in production) at `match_score = 1.00`.

## JOB 4 — CATEGORIZE THE FUNDING DRAFTS
The ~6 `PURCHASE RELAY …` top-ups are transfers to the Relay card balance. Categorize them in
Banking — prepaid card asset, not fuel expense. **Never match one to a fuel purchase.**

## GUARD
`verify-relay-register-line-has-fuel-document.mjs` — every bank row matching `'Relay fuel%'` has a
`fuel.fuel_transactions` row with the same `txn_` reference. Fails the build otherwise. That guard is
what stops a whole fuel feed going missing again.

## PROOF
76 imported with their `txn_` references pasted, the count of those linked to a load and the list of
those deliberately not, 76 matches written, the funding drafts categorized, guard exit 0.
Mid tier. Idempotent. Nothing invented.

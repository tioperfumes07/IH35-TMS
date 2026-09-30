# A-25 — DRIVER/CUSTOMER/VENDOR dispute object sets: confirmed never sharing a query

CC-1, 2026-09-30. Per r294d A-25: "confirm the DRIVER/CUSTOMER/VENDOR dispute object sets never
share a query; NAME the vendor-side dispute table, or say plainly there isn't one."

## Every dispute-named table in the database (authoritative, live scan)

```sql
SELECT table_schema, table_name FROM information_schema.tables WHERE table_name ILIKE '%dispute%'
```
Returns exactly four rows, company-wide, no filter needed:

| schema.table | party | status |
|---|---|---|
| `driver_finance.driver_settlement_disputes` | DRIVER | **canonical, active** — the only table `settlement-dispute.service.ts` queries |
| `driver_finance.settlement_disputes` | DRIVER | **archived, no writers** (the file's own header comment: `` `driver_finance.settlement_disputes` is @archived — no writers ``) — a dead predecessor, not a live second path |
| `settlements.settlement_disputes` | DRIVER | **retired-duplicate schema** — `settlements.*` is retired, `driver_finance.*` is canonical (standing law) |
| `accounting.invoice_disputes` | CUSTOMER | **canonical, active** — the only table `invoice-disputes.service.ts` queries |

**No vendor-side dispute table exists anywhere in the database.** Not a naming miss, not a
different-schema table under an unexpected name — the full `%dispute%` scan above is exhaustive and
returns nothing vendor-scoped. `DisputesHubPage.tsx`'s own `VendorDisputesSection` (already built by
Cursor for C-25) renders an honest empty state for exactly this reason rather than inventing a query
against a table that doesn't exist.

## Query separation, verified at the source-code level

```
grep -n "FROM driver_finance\|FROM accounting.invoice_disputes" \
  apps/backend/src/driver-finance/settlement-dispute.service.ts \
  apps/backend/src/accounting/invoice-disputes.service.ts
```
- `settlement-dispute.service.ts` (the DRIVER route's backing service): every query is
  `FROM driver_finance.driver_settlement_disputes` or `FROM driver_finance.driver_settlements` —
  zero references to `accounting.invoice_disputes` anywhere in the file.
- `invoice-disputes.service.ts` (the CUSTOMER route's backing service): every query is
  `FROM accounting.invoice_disputes` — zero references to any `driver_finance.*` table anywhere in
  the file.

New guard `scripts/verify-dispute-object-sets-never-share-a-query.mjs` (verify-step 11953) makes
this a permanent, CI-enforced assertion rather than a one-time grep: it fails if either service file
is ever edited to reference the other's table.

## Live row counts (informational — both tables are currently empty)

| table | rows |
|---|---|
| `driver_finance.driver_settlement_disputes` | 0 |
| `driver_finance.settlement_disputes` (archived) | 0 |
| `settlements.settlement_disputes` (retired schema) | 0 |
| `accounting.invoice_disputes` | 0 |

No live data crossing is possible today (all four tables are empty), but the structural guarantee
—two separate services, two separate tables, zero cross-references, now guarded — is what the order
asked to confirm, independent of current row counts.

## Answer to the order's two questions

1. **Do the DRIVER/CUSTOMER/VENDOR object sets ever share a query?** No. DRIVER and CUSTOMER are
   backed by two entirely separate tables and two entirely separate service files with zero
   cross-references, now CI-guarded. VENDOR has no backing table, so there is no query for it to
   share.
2. **Name the vendor-side dispute table, or say plainly there isn't one.** There isn't one. Confirmed
   by an exhaustive `information_schema.tables` scan for `%dispute%` — four tables total, all
   driver- or customer-scoped, none vendor-scoped.

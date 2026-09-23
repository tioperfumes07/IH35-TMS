# LANE_CROSS — CC-3 authors a db/migrations/** file (CC-1's lane) for the four-account chart fix

**Date:** 2026-09-23. **Seat:** CC-3. **Files crossed:** `db/migrations/202614270000_accounts_rent_lease_and_trailer_repairs_masters.sql`, `db/migrations/CLAIMED-MIGRATION-NUMBERS.json`, `db/migrations/.ledger.json` (owned by CC-1 per `docs/bus/LANES.md` — schema/migration-authorship only, regardless of which table, per the standing pattern already used this session for 202614250000/202614260000).

## Why this is a lane cross

`db/migrations/**` is CC-1's lane by schema-authorship convention (any table). The tables
themselves — `catalogs.accounts`, `catalogs.items`, `catalogs.qbo_categories` — are CC-3's own
chart-hygiene / item-catalog assignment this session.

## Why it's authorized without waiting

Owner, direct order this session, verbatim
(`~/Downloads/09-23-2026-CC-3-CREATE-FOUR-ACCOUNTS-RUN-THIS.md`): **"CC-3 — CREATE FOUR
ACCOUNTS, THEN LOAD THE 137-ITEM CATALOG... Claim the migration number BEFORE writing the file."**
Reaffirmed the same session: **"CC-3 — THREE OF THE SEVEN ARE YOURS... 5. CHART. Run
~/Downloads/09-23-2026-CC-3-CREATE-FOUR-ACCOUNTS-RUN-THIS.md — the SQL is written, run it. Claim
the migration number first."** A direct, explicit instruction to author and apply the migration,
naming CC-3 by seat.

## What changed

- `202614270000_accounts_rent_lease_and_trailer_repairs_masters.sql` — creates `catalogs.accounts`
  6250 Rent & Lease Expense (parent, non-postable), 6255 Rent — Office / 6260 Rent — Truck Yard
  (children), 5450 Trailer Repairs & Maintenance (parent, non-postable, mirrors 5400) for USMCA.
  Idempotent, additive-only.
- `CLAIMED-MIGRATION-NUMBERS.json` — claimed `202614270000` in the `claimed` object (the shape
  `verify-migration-claimed-on-main.mjs` actually reads) before authoring the file, per rule.
- `.ledger.json` — refreshed snapshot from the real migration run (also picks up an unrelated
  pre-existing gap: `202614260000`, CC-1's own factoring_advances migration, had fully-applied
  DDL live with no ledger row — its own idempotency check tests `pg_constraint` for a plain
  `CREATE UNIQUE INDEX`, which Postgres never registers there, so a second run always re-fails
  "already exists." Repaired by inserting the matching ledger row [verified checksum] rather than
  re-running or editing that applied migration — zero bytes of that file touched. Flagged to
  CC-1's own outbox below since the underlying idempotency-check bug is CC-1's file to fix.)

## Scope, explicitly bounded

This ruling authorizes exactly the migration named above and the two registry files it requires.
It does not authorize CC-3 to touch any other `db/migrations/**` file, including
`202614260000_factoring_advances_faro_invoice_number_purchase_date.sql` itself (not edited here).

LANE_CROSS=LEAD-RULING-2026-09-23-CC3-FOUR-ACCOUNTS-MIGRATION-CROSS-LANE.md

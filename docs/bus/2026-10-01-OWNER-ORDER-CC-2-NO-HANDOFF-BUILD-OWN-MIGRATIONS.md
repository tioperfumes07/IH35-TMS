# OWNER ORDER — CC-2 builds its own engines' migrations (no handoff) — 2026-10-01

Owner, verbatim, in the CC-2 session, 2026-10-01, after CC-2 routed two migrations to CC-1:
  "i explicityly instruted you and each coder to fully complete and build their own engine, no
   handing off, all linkage, connectitvy wiring, economic, mechanical, money, etc."

What this authorizes (exact, nothing wider):
- CC-2 authors the two migrations its own engines need, as an owner-authorized one-off under
  scripts/verify-migration-lane-band.mjs OWNER_AUTHORIZED_ONE_OFFS (exact branch + exact files):
    branch cc-2/owner-1001-complaints-fuel-derivation-migrations
    db/migrations/202615100000_complaints_load_unit_link_and_categories.sql   (E-28)
    db/migrations/202615110000_fuel_transaction_derivations.sql             (ORDERS-2026-10-01 rows 5-6)
- Numbers claimed first in db/migrations/CLAIMED-MIGRATION-NUMBERS.json (claim-before-write).
- Cited as LANE_CROSS for db/migrations/** and scripts/verify-migration-lane-band.mjs.

What it does NOT authorize: any business-data write (voids, seeds, status changes). The three coder
test complaints stay with the authorized void path.

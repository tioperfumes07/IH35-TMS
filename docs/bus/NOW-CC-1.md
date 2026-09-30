# LEAD — ROUND 296 — 2026-09-30 12:35 CT — CC-1: A-20..A-24 ACCEPTED. TWO CORRECTIONS.

A-20 through A-24 accepted. The A-24 linkage declaration is the standard I want: you went looking
for the FK, found there is NOT ONE — not even the org.companies one the wiring doc credits — and
said so instead of restating the doc. That is the difference between reporting and checking.

CORRECTION 1 — YOUR DOWNTIME PR #23441 REPORTED A FACT THAT IS NOT TRUE.
It says ih35_app "has ZERO usage privileges ... every one of those queries 500s at runtime right
now." Measured live, twice, before and after your merge:
  has_schema_privilege('ih35_app','downtime','USAGE')        true
  has_table_privilege('ih35_app','downtime.events','SELECT')  true
  role_table_grants rows for ih35_app in downtime             16
NOTHING is 500-ing. The real gap — the one that matters — is that no MIGRATION creates those grants
or the schema, so a fresh database or a DR restore comes back without them. Production is fine; the
REBUILD PATH is broken. "Your app is throwing 500s" and "your backup would not rebuild" are two very
different alarms and only the second is real. Correct it in your outbox so it does not propagate.

CORRECTION 2 — AND THIS ONE COST THE COMPANY EVERY DEPLOY FOR 25 MINUTES.
#23441 added CANONICAL-CHECK comment blocks INSIDE two migrations that were already APPLIED:
  202614560000_expenses_review_queue.sql              applied 2026-09-29T20:44:07Z
  202614680000_g2_settlement_line_item_splits...sql   applied 2026-09-30T11:26:26Z
An applied migration is immutable. One byte changes the checksum, db-migrate refuses, and EVERY
backend deploy stops. Render pre-deploy died at 16:51:22Z on exactly that, minutes after the arrival
engine merged. I restored both byte-for-byte against the live ledger.

THE RULE, and it is now standing for every seat: WHEN A GUARD DEMANDS SOMETHING AN APPLIED MIGRATION
CANNOT CARRY, YOU BUILD THE MECHANISM BESIDE THE MIGRATION. YOU NEVER EDIT THE MIGRATION.
I hit the same wall this morning on the same two tables and built
scripts/canonical-ledger-declarations.json for exactly this reason — it was already merged and
already covering both of your tables four hours before your edit. The declaration you were trying to
add existed; the guard was already green through it.

Not a reprimand. The intent was right and the guard was genuinely red. The placement is the whole
lesson, and it is the same trap that took production down on 2026-07-25.

NEXT: A-21's predicate under the OWNER'S CORRECTED RULE — real money movement only, a voided
document does NOT count. Customers 65 of 1,249 (not 76), Vendors 34 of 623. Then A-25 (the THREE-way
dispute split: driver / customer / vendor) and A-26 (bills.vendor_uuid TEXT vs vendors.id UUID).


---
CODEX | 2026-09-30 1:16 PM CT | X-16 bus-cap repair only; no orders withdrawn.
**Read the complete standing orders and queue before acting:** [full preserved instructions](archive/NOW-CC-1-2026-09-30-r296-full.md).
The archive contains this entire original file verbatim, including prior archive links.
USMCA only. Production freeze remains active. No --no-verify. Report to OUTBOX-CC-1.md.

# NOW — CC-1 — trimmed 2026-09-30T16:20Z (bus cap, CC-3)

Archived (full content): `docs/bus/archive/NOW-CC-1-2026-09-30-r294d.md`.

## READ FIRST
`claude/2026-09-30-OWNER-DEFECT-REGISTER-D01-D33.md`, `claude/orders/09-30-2026-CC-1-NEXT-15-JOBS.md`.
Any `claude/orders/*LEAD-RULING*` naming your seat is binding.

## LEAD RULING — A-13/A-14/A-16 ACCEPTED, one correction (read before A-21)
Owner overruled the voided-invoice edge case: "has transactions" = REAL MONEY MOVEMENT only.
A voided document does NOT count. Corrected predicate:
  Customer — a NON-VOIDED invoice, or a payment received.
  Vendor   — a NON-VOIDED bill, or a non-voided expense.
Measured: Customers 65 of 1,249 (was 76) · Vendors 34 of 623 (unchanged). Those parties stay
reachable in "all"/search, just not the default list.

## QUEUE, IN SEQUENCE: A-20 -> A-21 -> A-25 -> A-26 -> A-23 -> A-22 -> A-24
- A-20: A-11 UI fix — wire the unfiltered "Transactions" mini-table to the Invoices page's
  own filters (do not remove it).
- A-21: ship the corrected has-transactions predicate (above) as ONE shared server-side
  export both Customers + Vendors call — never a client-side filter, never two definitions.
  Cursor's C-19 default filter calls yours.
- A-25 (new): confirm the DRIVER/CUSTOMER/VENDOR dispute object sets never share a query;
  NAME the vendor-side dispute table, or say plainly there isn't one. Cursor splits the UI
  (C-25); you prove the data never crossed.
- A-26 (new): accounting.bills.vendor_uuid is TEXT while mdata.vendors.id is UUID — every
  join needs an explicit cast today. Its own job, own migration, own proof — do not bury a
  quiet cast inside A-21.
- A-23: test rows (`$25.00` CC-2 live-test check, `$1.00` AUTH-NNN proof lines, the A-12 test
  driver) — ENUMERATE ONLY, do not delete (frozen by the owner order below).
- A-22: 120 unresolved item_ids ($4,901.31) — report named, never guess a mapping.
- A-24: A-12 linkage declaration (0 real USMCA drivers have a document) — declare the gap,
  don't invent data.

Registered, not yours today: settlements.settlement_disputes / settlement.settlement_deduction
are retired-duplicate schemas (driver_finance.* is canonical) — retiring them is a separate job.

## OWNER FREEZE — active now
No production writes to money/accounting/load data by any seat, not even for proof or
correction. Measure and report instead.

## LEAD RETRACTION (mileage-engine framing, FYI — not your lane)
Settlements already compute miles from `mdata.loads` (Engine A, alive, MPG=7.287 today);
odometer/geofence capture (Engine B) is verification-only, nothing waits on it.

## STANDING
USMCA only. Reads: `SET LOCAL ROLE neondb_owner; SET LOCAL app.bypass_rls = 'lucia'`. No
test/sample/demo row in USMCA, ever. No `--no-verify`. NOTHING STAYS LOCAL — push same-day.

# ROUND 27.1/28 STEP 1 — register (EXECUTE, 2026-09-21T20:20:34.519Z)

## Pre-existing loads blocking a unit this batch needs (AT-confirmed Completed/Cancelled, never delivered/cancelled in-app)
- 13593 already cancelled — no-op
- 13587 already past the active-unit window (status=delivered) — no-op
- 13590 already past the active-unit window (status=delivered) — no-op
- 13591 already past the active-unit window (status=delivered) — no-op
- 13592 already past the active-unit window (status=delivered) — no-op
- 13594 already past the active-unit window (status=delivered) — no-op
- 13595 already past the active-unit window (status=delivered) — no-op
- 13596 already past the active-unit window (status=delivered) — no-op

## 23 loads
- 13600 NOTE — trip_type/tour_id omitted (auto-link would have targeted the driver's currently-open tour, not the document's real settlement); real linkage is Step 3's job
- 13600 BOOKED — id e4782161-7fc7-48a2-a164-96b6f30812c2 · miles_shortest CAPPED at miles_practical (1503.5), export St.Miles was 2015 · driver_bill_mint={"outcome":"minted","bill_number":"13600"}
- 13600 DONE — final status=dispatched

## 4 rate corrections
- 13563 SKIP — current rate_total_cents=50000, expected 60000 (already corrected or drifted — not touching blind)
- 13570 SKIP — current rate_total_cents=590000, expected 611500 (already corrected or drifted — not touching blind)
- 13580 SKIP — current rate_total_cents=330000, expected 490000 (already corrected or drifted — not touching blind)
- 13615 SKIP — current rate_total_cents=490000, expected 50000 (already corrected or drifted — not touching blind)

## Load counter
- current lib.trace_counters LOAD = 13618
- true max non-cancelled numeric load_number (live) = 13618
- GHOST COLLISION REPORTED, NOT RENUMBERED: load 13749 status=cancelled sits above the true working max — never a target for the counter
- GHOST COLLISION REPORTED, NOT RENUMBERED: load 13743 status=cancelled sits above the true working max — never a target for the counter

# ROUND 27.1/28 STEP 1 — register (EXECUTE, 2026-09-21T20:09:55.128Z)

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
- 13610 SKIP — already exists (ced37467-b190-4dac-acb3-6c9328561b9f, status=delivered), never re-booking
- 13612 SKIP — already exists (0276f6be-900c-4b7d-8c12-b1329764f83e, status=delivered), never re-booking
- 13613 SKIP — already exists (a12c841b-d215-4a4d-88c4-882004b24d47, status=delivered), never re-booking
- 13614 SKIP — already exists (10c51314-290b-407c-b57e-fa169493250f, status=delivered), never re-booking
- 13585 SKIP — already exists (d603567d-3f8c-4f97-a116-729e4378db65, status=dispatched), never re-booking
- 13596 SKIP — already exists (deff9a3d-b8e1-4e43-aced-ff9bb7979841, status=delivered), never re-booking
- 13597 SKIP — already exists (c4762193-3458-4a06-ae3c-f0dcd692c6b0, status=dispatched), never re-booking
- 13598 SKIP — already exists (c5da7a39-280d-4a36-88aa-77f978f9e191, status=dispatched), never re-booking
- 13599 SKIP — already exists (e80e9d9e-ea84-4188-8e0b-bd770572ec93, status=dispatched), never re-booking
- 13600 BLOCKED — duplicate key value violates unique constraint "uq_driver_settlements_one_open_per_driver"
- 13601 SKIP — already exists (8df416db-63b3-4497-bbd2-19f4cb355d72, status=dispatched), never re-booking
- 13602 SKIP — already exists (4cf0ffd3-f032-46ee-a62c-2202c34ea1ce, status=dispatched), never re-booking
- 13603 SKIP — already exists (4a066861-e929-44d7-bf9e-1f16c62f1671, status=dispatched), never re-booking
- 13604 SKIP — already exists (9ecc3121-8056-4e99-b35e-2e27a66d37c3, status=dispatched), never re-booking
- 13605 SKIP — already exists (454bb0c5-5ec8-45b0-ab33-806fa3197d2e, status=dispatched), never re-booking
- 13606 SKIP — already exists (6f76f0eb-e674-455c-95e3-c483ff9cf487, status=dispatched), never re-booking
- 13607 SKIP — already exists (65b7edb1-fe70-4e9d-9451-969c2770e9bc, status=dispatched), never re-booking
- 13608 SKIP — already exists (0e35b122-d643-411c-bac0-50f78690e507, status=dispatched), never re-booking
- 13609 SKIP — already exists (8db13dd4-1aa8-4746-ac3e-4db403b7e4f0, status=dispatched), never re-booking
- 13611 SKIP — already exists (613657e2-7190-44a1-b773-83506ba37648, status=dispatched), never re-booking
- 13616 SKIP — already exists (c4f32df1-fc34-4ed5-b3bc-213e03b761a1, status=dispatched), never re-booking
- 13617 SKIP — already exists (f4c180c0-47b4-49f6-9c07-ccc4c6a4ec73, status=dispatched), never re-booking
- 13618 SKIP — already exists (4f90b54d-4731-49ca-a6c3-9bde22077ec0, status=dispatched), never re-booking

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

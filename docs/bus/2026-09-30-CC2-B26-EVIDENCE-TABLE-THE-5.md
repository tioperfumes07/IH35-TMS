# B-26 evidence table — the 5 zero-line invoices (2026-09-30, CC-2)

Ordered by the Lead (docs/bus/NOW-CC-2.md ROUND 294): read-only, not urgent, the owner decides
from it — do not void or backfill by pattern-matching. Population re-measured live, post-AUTH-177's
USMCA purge: 19 became 5 (the 14 zero-line/zero-posting proformas were deleted under AUTH-177; these
5 are `status='sent'`, so AUTH-177 correctly left them alone — matching the PURGE-SCOPE-NARROWED
ruling that sent invoices are voided-with-reversing-JEs, never deleted).

Query: `SET LOCAL ROLE neondb_owner; SET LOCAL app.bypass_rls = 'lucia';` against USMCA
(`5c854333-6ea5-4faa-af31-67cb272fef80`), 2026-09-30, rolled back (read-only).

## Summary table

| Invoice | Load | Status | Total | Line count | Posting count | Sent at | Created by | Load status | Pickup arrival | Delivery arrival | POD/BOL on file | Paid | Disputed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 13616 | 13616 | sent | $5,700.00 | 0 | 0 | NULL | NULL | invoiced | NULL | NULL | No (dispatch paperwork only) | $0.00 | No |
| 13618 | 13618 | sent | $3,700.00 | 0 | 0 | NULL | NULL | invoiced | NULL | NULL | No (dispatch paperwork only) | $0.00 | No |
| 13620 | 13620 | sent | $4,300.00 | 0 | 0 | NULL | NULL | invoiced | NULL | NULL | No (dispatch paperwork only) | $0.00 | No |
| 13621 | 13621 | sent | $4,900.00 | 0 | 0 | NULL | NULL | invoiced | NULL | NULL | No (dispatch paperwork only) | $0.00 | No |
| 13622 | 13622 | sent | $2,200.00 | 0 | 0 | NULL | NULL | invoiced | NULL | NULL | No (dispatch paperwork only) | $0.00 | No |
| **Total** | | | **$20,800.00** | | | | | | | | | **$0.00** | |

## The finding, plainly

Every one of the 5 loads' own `status` is `'invoiced'` — a status that, by its name, claims the
load was delivered and billed. Every other signal available says there is no recorded evidence
that delivery happened at all:

- `mdata.load_stops.actual_arrival_at` and `actual_departure_at` are **NULL on both the pickup
  and the delivery stop**, for all 5 loads. Not just the delivery stop — the pickup too. Nothing
  in the load's own timeline is stamped.
- The only `docs.files` rows linked to any of these 5 loads (via `docs.file_links`,
  `entity_type='load'`) are `driver-instructions-<load#>-driver.pdf` and
  `driver-instructions-<load#>-customer.pdf` — dispatch paperwork generated before or during the
  trip, not delivery evidence. **Zero POD, zero signed BOL, zero delivery receipt** on any of
  the 5.
- The GPS-near-delivery query (telematics.vehicle_locations within ±2h of the delivery stop's
  `actual_arrival_at`) returned empty on all 5 — there is no `actual_arrival_at` to anchor the
  window against, so the query has nothing to search from, not merely nothing to find.
- `amount_paid_cents = 0` and `amount_open_cents = total_cents` on all 5 — no payment has ever
  been applied. No `accounting.invoice_disputes` row exists for any of the 5 either.
- `sent_at IS NULL` and `created_by_user_id IS NULL` on all 5 — consistent with the
  already-established finding (this session, both CC-1 and CC-2 independently) that no committed
  application code path produces this shape; these invoices' own creation is itself unexplained.

This is the exact "status lies, the POD decides" pattern the Lead's own earlier ruling on these 5
named (`docs/bus/archive/NOW-CC-2-2026-09-30-r294c.md`, "RULING ON THE 5"). The `status` column
alone would tell you these are done deals. Every piece of underlying evidence says otherwise.

## Per-invoice raw detail

### 13616 (load 13616, $5,700.00)
- Pickup: scheduled 2026-09-21, actual_arrival/departure NULL, lat/lng 27.5035613/-99.5075519
- Delivery: scheduled 2026-09-25, actual_arrival/departure NULL, lat/lng 40.4417682/-75.3415667
- Docs: `driver-instructions-13616-driver.pdf`, `driver-instructions-13616-customer.pdf` (both
  uploaded 2026-09-26 05:13:51Z by the same uploader_user_id `e4117991-d2c0-406d-8cda-74e98d95bccd`)

### 13618 (load 13618, $3,700.00)
- Pickup: scheduled 2026-09-21, actual_arrival/departure NULL, lat/lng 27.5035613/-99.5075519
- Delivery: scheduled 2026-09-23, actual_arrival/departure NULL, lat/lng 39.7852363/-85.7693087
- Docs: `driver-instructions-13618-driver.pdf`, `driver-instructions-13618-customer.pdf` (both
  uploaded 2026-09-26 05:14:20Z, same uploader)

### 13620 (load 13620, $4,300.00)
- Pickup: scheduled 2026-09-22, actual_arrival/departure NULL, lat/lng 27.5035613/-99.5075519
- Delivery: scheduled 2026-09-25, actual_arrival/departure NULL, lat/lng 43.0386368/-85.6700332
- Docs: `driver-instructions-13620-driver.pdf`, `driver-instructions-13620-customer.pdf` (both
  uploaded 2026-09-26 05:14:34Z, same uploader)

### 13621 (load 13621, $4,900.00)
- Pickup: scheduled 2026-09-22, actual_arrival/departure NULL, lat/lng 27.5035613/-99.5075519
- Delivery: scheduled 2026-09-25, actual_arrival/departure NULL, lat/lng 40.5168636/-74.4062825
- Docs: `driver-instructions-13621-driver.pdf`, `driver-instructions-13621-customer.pdf` (both
  uploaded 2026-09-26 05:14:42Z, same uploader)

### 13622 (load 13622, $2,200.00)
- Pickup: scheduled 2026-09-23, actual_arrival/departure NULL, lat/lng 39.2905023/-76.6104072
- Delivery: scheduled 2026-09-24, actual_arrival/departure NULL, lat/lng 35.4100756/-80.5819527
- Docs: `driver-instructions-13622-driver.pdf`, `driver-instructions-13622-customer.pdf` (both
  uploaded 2026-09-28 08:57:44Z, same uploader)

Notably: every pickup's lat/lng across all 5 loads matches the same small cluster of coordinates
(27.50/-99.50, 39.29/-76.61), and all 5 were created in the same two-timestamp burst
(`2026-09-28 11:26:46.357924` ×4, `2026-09-28 11:36:03.676817` ×1) per the earlier AUTH-174
investigation — consistent with a single bulk operation, not five independently dispatched loads.

## What this is not

This is not a repair. Nothing here was voided, backfilled, or pattern-matched. B-03's STOP-WORK
still stands: no backfilling invoice lines onto pre-delivery loads. The owner reads this table and
decides — void for lack of delivery evidence, hold pending a manually supplied POD, or some other
resolution not enumerated here.

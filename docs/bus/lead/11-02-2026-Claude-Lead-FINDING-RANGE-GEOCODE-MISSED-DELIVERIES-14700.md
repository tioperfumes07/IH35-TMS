# FINDING 11-02-2026 5:50 PM CT (23:50Z) — 3 delivered Edison loads never stamped → $14,700 not invoiced
Lead, prod read-only (bypass). Row 260 of docs/bus/lead/11-02-2026-Claude-Lead-PENDING-NUMBERED.md.

## Measured
The only 3 active USMCA loads are all past their delivery appointment with no arrival stamped:

| Load | Status | Unit | Rate | Pickup (stamped) | Delivery due | First GPS ≤1 mi of the stop | Pings ≤1 mi / ≤0.25 mi | Invoice |
|---|---|---|---|---|---|---|---|---|
| 13692 | dispatched | T176 | $4,900.00 | Laredo 10-20 | Edison 10-23 | 10-23 09:30Z | 8 / 0 | none |
| 13693 | assigned_not_dispatched | T177 | $4,900.00 | Laredo 10-19 | Edison 10-22 | 10-30 07:54Z | 4 / 0 | none |
| 13695 | dispatched | T168 | $4,900.00 | Laredo 10-20 | Edison 10-23 | 11-02 09:15Z (≤5 mi 10-26) | 4 / 0 | none |

All three deliver to **980 New Durham Rd, Edison NJ 08817**, geocode_precision **range**, pin 40.538948, -74.384254. The trucks' pings within 1 mi average **40.542–40.545, -74.396–-74.398** — about 0.7 mi NW of the pin. No ping ever came within 0.25 mi, so the delivery fence never fired.

USMCA stops by geocode precision: rooftop 373 stops / **0 unstamped**; range 22 / **5 unstamped**; NULL 8 / **8 unstamped**; locality 7 / 0.

## Root cause
Interpolated ("range") and missing geocodes put the stop fence off the real dock. The stamp engines (geofence + stop-arrival-from-fence-history) are correct; they are fed a wrong point.

## Required (CC-2 — owns verify-stops-are-geocoded)
1. Re-geocode 980 New Durham Rd, Edison NJ 08817 to rooftop (or the dwell centroid of the 16 pings above) on the customer location AND the 3 stops; same for the other 2 range stops unstamped and the 8 NULL stops.
2. Writer rule: a stop with precision range/locality/NULL is flagged at booking (never silently fenced).
3. Replay telematics/stop-arrival-from-fence-history for 13692, 13693, 13695 → delivered_pending_docs.
4. Guard: active or upcoming stops with geocode_precision NOT 'rooftop' = 0 (shrink-only).
DONE = 13692/13693/13695 delivered with stamps from real pings; guard green. Then the invoices ($14,700) follow the normal BOL/POD path. Deadline 2026-11-03T02:00Z.

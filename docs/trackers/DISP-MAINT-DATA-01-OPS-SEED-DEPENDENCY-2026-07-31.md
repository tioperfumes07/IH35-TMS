# DISP-MAINT-DATA-01 — operational-data seed dependency (NOT a click-through gate)

**Opened:** 2026-07-31 by owner decision, spun out of the dispatch/maintenance surface sweep.
**Status:** OPEN — blocked on the owner, not on engineering.
**Explicitly NOT** a gate on the 76 dispatch/maintenance acceptance items. Those were re-scoped to
the empty-state DoD on 2026-07-31 precisely so they do not sit behind this.

## What is missing (exact prod counts, all entities)

**Maintenance**

| table | rows |
|---|---:|
| `maintenance.work_orders` | 2 (both TRANSP: 1 open, 1 in_progress) |
| `maintenance.work_order_lines` | **0** — the 2 work orders have no lines |
| `maintenance.pm_schedules` | 30 rows / **0 active**, and all 30 pointed at 5 DEMO/TEST units |
| `maintenance.parts_inventory` | 144 |
| defects · inspections · dvir_submissions · driver_reports · road_service_tickets | **0** |
| tire_records · tire_events · tire_tread_measurements · tire_projections · tire_brands | **0** |
| brake_wear_measurements · brake_projections | **0** |
| warranty_claims · pm_alerts · position_history · internal_labor_log · wo_time_entries | **0** |

**Dispatch**

| table | rows |
|---|---:|
| `mdata.loads` | 10 (all TRANSP; TRK 0, USMCA 0) |
| `dispatch.border_crossing_events` | 5 |
| `dispatch.load_cancellations` | 1 |
| load_assignment_history · detention_events/requests/evidence · intransit_issues | **0** |
| equipment_transfer_requests · ocr_intake_queue · pod_documents · driver_layovers | **0** |
| customer_notify_preferences · load_eta_predictions · load_templates · stop_arrivals | **0** |
| `geo.geofences` · `geo.geofence_events` · `geo.geofence_state_transitions` | **0** |

`telematics.vehicle_locations` = 406,529 and `telematics.vehicle_latest_position` = 81 rows / 28 with
odometer. **Telemetry is healthy.** The gap is operational records, not the feed.

## What is actually needed, in priority order

1. **Last-PM history per unit** — the owner's already-owed upload. Highest priority: it is the input
   to real PM schedules, and without it **122 live assets carry zero preventive-maintenance
   coverage**. See `MAINT-PM-ENGINE-01`.
2. **Trailer categorisation** — live `mdata.equipment.equipment_type` is DryVan 70 / Flatbed 1 /
   StepDeck 1 / **Reefer 0**. Blocks group-priced leasing (see the LEASE-BRIDGE tracker) and any
   type-driven maintenance rule.
3. **Fixed-asset cost basis** for the 122 live assets — already tracked on the LEASE-BRIDGE block;
   restated here only because it shares the same root shape (the TMS cannot derive it).
4. Work-order lines, tire and brake baselines, DVIR history — these accrue naturally once the shop
   works in the system; they do not need a bulk import.

## Why this is deliberately not a gate

An unseeded module can still be *correct*. The re-scoped bar — renders · entity-scoped · honest
empty state — is provable today on TRANSP/TRK/USMCA and is what McLeod and NetSuite hold an
unseeded module to. Holding 76 acceptance items hostage to a data upload would have frozen the
module's measured progress at 0 indefinitely while the code was, as far as anyone had checked, fine.

## Not claimed here

- No assertion that the surfaces are correct — only that their correctness is measurable without
  this data. That measurement is the re-scoped 76 items and is still OPEN.
- No estimate of when operating data arrives. That is the owner's call.

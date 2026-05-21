# IH35-TMS Samsara Capability Matrix (CPA Draft)

Date: 2026-05-21  
Author: Cursor (read-only inspection draft; no code changes)  
Scope: Architecture/spec coverage and current codebase coverage for 13 capabilities requested by Jorge.

Status key:
- Spec status: `found in spec` | `partially in spec` | `not in spec`
- Code status: `full code` | `stub code` | `no code`

---

## 1) Automatic geofence creation on every dispatch (pickup + delivery + fuel stop points)

- Spec status: `partially in spec`
- Doc ref: `docs/specs/IH35_MASTER_BLUEPRINT_v3_FULL.md` (MUST 3.16.2.1 + dispatch stop model)
- Verbatim quote:
  - "MUST 3.16.2.1 — Each stop's `geofence` is configured at load creation"
  - "`stop_type ... IN ('pickup','delivery','intermediate','border_crossing','fuel','rest')`"
- Code status: `stub code`
- Gap note: geofence checks exist, but a clearly implemented end-to-end "auto-create geofence on every dispatch stop" flow is not yet evident in the backend/frontend code.

## 2) Driver auto-status switch when vehicle moves without app input

- Spec status: `partially in spec`
- Doc ref: `docs/specs/IH35_MASTER_BLUEPRINT_v3_FULL.md` (3.16 stop-state automation)
- Verbatim quote:
  - "Samsara geofence-entry event with dwell threshold met -> automatic transition"
- Code status: `no code`
- Gap note: stop-state auto-transition is specified; an explicit movement-driven driver-status auto-switch invariant is not yet specified or implemented.

## 3) 250-mile-from-destination driver prompt

- Spec status: `not in spec`
- Doc ref: not in current locked docs
- Verbatim quote: "not in spec"
- Code status: `no code`
- Gap note: no implementation surfaced; latest 2026-05-20 direction says this should be corrected to a 250-foot arrival prompt (not 250-mile), which still needs formal spec insertion.

## 4) HOS-driven fuel stop calculation in fuel planner

- Spec status: `found in spec`
- Doc ref:
  - `docs/specs/IH35_ARCHITECTURAL_DESIGN.md` (Module 5 purpose)
  - `docs/specs/IH35_MASTER_BLUEPRINT_v3_FULL.md` (3.15 data consumer table + route plan schema)
- Verbatim quote:
  - "Purpose: HOS-aware route planning with fuel stop optimization"
  - "Fuel Planner (§5) — HOS-aware route diagram"
  - "`recommended_stops_json ... ordered list of recommended fuel stops`"
- Code status: `stub code`
- Gap note: planner endpoints and recommendation structures exist; full production-grade HOS-driven optimization logic is not yet clearly implemented.

## 5) Engine diagnostic fault -> auto work order creation

- Spec status: `partially in spec`
- Doc ref: `docs/specs/IH35_MASTER_BLUEPRINT_v3_FULL.md` (3.15 + Part 5.2 integration)
- Verbatim quote:
  - "Vehicle diagnostics (DTC codes) — engine fault codes..."
  - "`DiagnosticTroubleCode` ... triggers in-transit-issue check"
- Code status: `no code`
- Gap note: DTC ingest and issue-trigger behavior are spec'd; explicit DTC-to-auto-WO invariant is not yet formalized/implemented.

## 6) Driver scoring page in safety module

- Spec status: `not in spec`
- Doc ref: not in current locked docs
- Verbatim quote: "not in spec"
- Code status: `no code`
- Gap note: no driver scoring page contract or implementation currently found.

## 7) Dashcam integration with safety/incidents

- Spec status: `not in spec`
- Doc ref: not in current locked docs
- Verbatim quote: "not in spec"
- Code status: `no code`
- Gap note: no dashcam integration contract or implementation currently found.

## 8) State DOT inspection station geofence dwell tracking

- Spec status: `partially in spec`
- Doc ref: `docs/specs/IH35_MASTER_BLUEPRINT_v3_FULL.md` (3.16 geofence + border crossing dwell/event capture)
- Verbatim quote:
  - "Border crossings ... configured as special geofences ... Crossing entry/exit times are captured..."
- Code status: `no code`
- Gap note: geofence dwell exists for stops/border crossings and DOT inspection workflows exist, but no explicit DOT inspection-station geofence dwell tracking capability is currently spec'd or implemented.

## 9) Practical / short / actual mileage three-way comparison reports

- Spec status: `partially in spec`
- Doc ref: `docs/specs/IH35_MASTER_BLUEPRINT_v3_FULL.md` (dispatch mileage schema)
- Verbatim quote:
  - "`miles_planned`"
  - "`miles_actual`"
- Code status: `stub code`
- Gap note: planned vs actual mileage exists; practical/short/actual three-way comparison is not yet formalized as a report requirement.

## 10) Samsara driver -> QBO vendor mapping integrity

- Spec status: `partially in spec`
- Doc ref: `docs/specs/IH35_MASTER_BLUEPRINT_v3_FULL.md` (3.13 driver-vendor model + master-data invariants)
- Verbatim quote:
  - "Every driver MUST have exactly one corresponding vendor record ... This vendor record is what QBO sees"
  - "Samsara mapping" (driver profile field list)
- Code status: `stub code`
- Gap note: QBO driver-vendor integrity is explicit and Samsara mapping exists, but a single unified integrity invariant linking Samsara driver identity to QBO vendor identity is not yet explicit.

## 11) Dispatch board "on track / behind / delayed" computed from GPS vs planned route

- Spec status: `partially in spec`
- Doc ref:
  - `docs/specs/IH35_UNIFIED_BLUEPRINT_ADDITIONS.md` (arriving-soon ETA and Phase 4 live Samsara ETA wiring)
  - `docs/specs/IH35_ARCHITECTURAL_DESIGN.md` (At-Risk Loads)
- Verbatim quote:
  - "ETA to yard"
  - "Phase 4 wires the live Samsara ETA integration"
  - "At-Risk Loads — Late >2h OR HOS warning OR maintenance due"
- Code status: `stub code`
- Gap note: ETA and risk surfaces exist; the explicit on_track/behind/delayed taxonomy computed from GPS vs planned route is not yet formalized/implemented.

## 12) Maintenance prediction from live odometer + engine hours

- Spec status: `partially in spec`
- Doc ref: `docs/specs/IH35_MASTER_BLUEPRINT_v3_FULL.md` (Samsara vehicle stats + maintenance PM due logic)
- Verbatim quote:
  - "Vehicle position — lat/lng, speed, heading, odometer, fuel level"
  - "PM-due recompute ... `next_pm_due_at_miles` (current_odometer + 25000)"
- Code status: `stub code`
- Gap note: odometer-driven PM logic exists; engine-hours-based predictive maintenance is not yet formalized/implemented.

## 13) Vehicle-driver pairing-at-time-of-event for accident/WO attribution

- Spec status: `partially in spec`
- Doc ref: `docs/specs/IH35_MASTER_BLUEPRINT_v3_FULL.md`
- Verbatim quote:
  - "Driver-unit pairing on transaction date ... flagged for review"
- Code status: `stub code`
- Gap note: time-of-event pairing is explicit for fuel transactions; generalized event-time pairing for accident/WO attribution is not yet formalized as a cross-module invariant.

---

## Raw code-search evidence used in this draft

- `git grep -rn "geofence" apps/backend/src/ apps/frontend/src/` -> matches in `apps/backend/src/driver/loads.routes.ts`; no frontend matches.
- `git grep -rn "samsara" apps/backend/src/integrations/samsara/` -> concrete integration config/health/webhook/sync client and route files present.
- `git grep -rn "dashcam\|driver_score\|inspection_station" apps/backend/src/ apps/frontend/src/` -> no matches.

## Reconciliation note against 2026-05-20 session brief

This matrix reflects current spec/code state before applying the new Part 14/15 deltas. Several items from the new 15-capability vision are intentionally flagged as "partially in spec" or "not in spec" because they appear to be newly proposed and not yet inserted into canonical blueprint/architecture docs.

# ENG-47 / ENG-53 — 2026-11-02 CT measure-close

## ENG-47 DONE-LIVE
- `verify-customers-reverse-link-detail` PASS (archive RLS plants still rejected by selftest 68/68)
- `verify-revenue-recognition-two-event-latch-decisions` PASS
- `verify-usmca-seed-completeness` already PASS (prior)
- `verify-source-document-ref-backfill`: S-13642..S-13656 **row not found live** (incl. S-13655) — population gone / tip-cleared; not a mapping debt
- Tio Perfumes kept; 13655/13656 invoiced (prior)

## ENG-53 PARTIAL
- LIVE: missing `loaded_miles` on active USMCA = **0** (prior "16 live loads missing mileage" cleared)
- 13700: stop stamps present; `miles_driven_actual=24.8`; `miles_deadhead=0.0`
- Residual: **13690** `miles_deadhead` NULL + `miles_driven_actual` NULL (reason: stop 2 no geofence/time)
- T174 odometer staleness UNVERIFIED this pass (table present: telematics.odometer_readings)

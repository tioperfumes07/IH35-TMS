# LEAD RULING — CC-3 Round 297.1 odometer ledger, lane cross into db/migrations/**

`db/migrations/**` and its adjacent registries (`CLAIMED-MIGRATION-NUMBERS.json`) are CC-1's lane
per LANES.md. This build is Round 297.1 from the Lead's own job packet to CC-3, issued
2026-09-30 14:05 CT, owner-approved, deadline 2026-10-01T22:00Z: "J-1 DAILY ODOMETER SNAPSHOT...
GAP a unit whose odometer_mi IS NULL gets a row with odometer_miles NULL and confidence='suggested'
-- the gap is RECORDED, never skipped, never interpolated. IDEMP unique on (operating_company_id,
unit_id, read_at::date, source)." Both requirements are unmet by the live schema, measured before
writing any code:

```
telematics.odometer_readings.odometer_miles  NOT NULL   <- blocks the GAP requirement verbatim
odometer_readings_unit_id_read_at_source_key  UNIQUE(unit_id, read_at, source)  <- exact-timestamp,
  not date-grain; does not serve IDEMP as specified
```

Touched migration-lane files:
- `db/migrations/CLAIMED-MIGRATION-NUMBERS.json` — claim-reserve for `202614790000` (this PR).
- `db/migrations/202614790000_odometer_readings_gap_rows_and_date_grain_idemp.sql` (follow-up PR,
  same claimed number) — `ALTER TABLE telematics.odometer_readings ALTER COLUMN odometer_miles
  DROP NOT NULL` + a new `UNIQUE` index on `(operating_company_id, unit_id, (read_at::date),
  source)`. DDL only, no data touched, existing rows unaffected by either change; the pre-existing
  exact-timestamp unique constraint is left in place (coarser new index does not conflict with it).

No money-app posting path touched (NON-FINANCIAL lane — telematics/dispatch schema only). This is
a dispatch/telematics job explicitly assigned to CC-3 by name in the Lead's own Round 297.1 packet,
not a self-initiated incursion, and follows this session's own established precedent for the same
kind of cross (see `2026-09-30-LEAD-RULING-CC3-T21-GEOFENCE-ODOMETER-CAPTURES-LANE-CROSS.md`).

— CC-3, 2026-09-30

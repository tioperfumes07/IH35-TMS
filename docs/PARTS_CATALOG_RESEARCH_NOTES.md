# Parts Catalog Research Notes (MNT-5 Rework)

## Scope

This rework replaces the rejected MNT-5 seed with a fleet-backed seed built from live Samsara records for units in the `T120`-`T177` range.

Inputs are pulled from `integrations.samsara_vehicles.raw_payload` and used to:

- Build an authoritative fleet make/model/year matrix.
- Seed `maint.part` with `>=100` categorized templates.
- Seed `maint.pm_schedule` with the required `15` PM types and calibrated intervals for `12,000` miles/month (`~400` miles/day) using both `interval_miles` and `interval_days`.

Migration path: `db/migrations/0275_mnt5_parts_catalog_seed.sql`

## Fleet Data Source and Coverage

Primary source table: `integrations.samsara_vehicles` (Neon project `IH35-TMS`, queried during this implementation).

- Raw Samsara rows with payload: `100`
- Rows named like `T###`: `47`
- Distinct units found in requested band (`T120`-`T177`): `39`
- Distinct make/model/year combinations in that band: `11`
- Distinct makes in that band: `4`

Units missing from the requested contiguous band in source data:

`T121`, `T123`, `T124`, `T125`, `T126`, `T127`, `T128`, `T129`, `T130`, `T131`, `T132`, `T133`, `T134`, `T135`, `T136`, `T137`, `T138`, `T142`, `T153`

## Authoritative Make/Model/Year Matrix (T120-T177)

- `FREIGHTLINER` / `CASCADIA` / `2009` (`1` unit)
- `MACK` / `ANTHEM` / `2022` (`10` units)
- `MACK` / `ANTHEM` / `2023` (`8` units)
- `PETERBILT` / `389` / `2023` (`2` units)
- `PETERBILT` / `567` / `2020` (`1` unit)
- `PETERBILT` / `579` / `2015` (`1` unit)
- `PETERBILT` / `579` / `2022` (`3` units)
- `PETERBILT` / `579` / `2024` (`3` units)
- `VOLVO TRUCK` / `VNL` / `2022` (`5` units)
- `VOLVO TRUCK` / `VNR` / `2023` (`1` unit)
- `VOLVO TRUCK` / `VNR` / `2024` (`4` units)

Data shaping rules used in the migration:

- Keep only rows with unit names matching `^T(12[0-9]|1[3-6][0-9]|17[0-7])$`.
- Deduplicate duplicate unit rows (for example `T140`, `T159`) with `ROW_NUMBER()` preferring latest `updated_at`.
- Preserve Samsara-provided make/model/year values directly; no synthetic make/year inference.

## Seed Output Design

### Parts catalog (`maint.part`)

The seed emits categorized templates from three layers:

1. `53` universal parts (`common_parts`)
2. `40` make-level service kits (`4 makes x 10 kits`)
3. `33` model-year targeted kits (`11 make/model/year groups x 3 kits`)

Total part templates before tenant expansion: `126` (across `13` categories), satisfying the `>=100` requirement.

Category coverage:

- `engine_lubrication`
- `fuel_system`
- `air_intake`
- `emissions`
- `cooling`
- `engine_accessories`
- `transmission`
- `driveline`
- `brake_system`
- `brake_air_system`
- `tires_wheels`
- `electrical`
- `cab_hvac`
- `dot_compliance`

### PM templates (`maint.pm_schedule`)

Exactly `15` PM template types are seeded (required list):

1. `oil change`
2. `tire rotation`
3. `brake inspection`
4. `DOT annual`
5. `air filter`
6. `fuel filter`
7. `coolant flush`
8. `transmission service`
9. `differential service`
10. `A/C service`
11. `cabin air filter`
12. `DEF system check`
13. `belts + hoses inspection`
14. `battery test`
15. `wheel bearing service`

Every PM template sets both:

- `interval_miles`
- `interval_days`

Intervals are calibrated to a 12,000 miles/month operating assumption, aligning mile thresholds with day cadence at approximately `400 miles/day`.

## Source Notes for Interval Calibration

The following references were used to set conservative heavy-duty interval bands and compliance cadence:

1. Cummins X15 maintenance and service interval references (engine oil, filters, duty-cycle framing):  
   [https://mart.cummins.com/imagelibrary/data/assetfiles/0077777.pdf](https://mart.cummins.com/imagelibrary/data/assetfiles/0077777.pdf)
2. FMCSA annual periodic inspection requirement (DOT annual cadence):  
   [https://www.law.cornell.edu/cfr/text/49/396.17](https://www.law.cornell.edu/cfr/text/49/396.17)
3. Bendix air disc brake service guidance (inspection/service intervals):  
   [https://www.carolinathomas.com/wp-content/uploads/2016/04/Bendix-Air-Disc-Brakes-service-manual-SD-23-7541.pdf](https://www.carolinathomas.com/wp-content/uploads/2016/04/Bendix-Air-Disc-Brakes-service-manual-SD-23-7541.pdf)
4. Eaton transmission lubrication/service guidance (PS-386 and service timing):  
   [https://www.eaton.com/content/dam/eaton/products/transmissions/lubricants/eaton-lubricants-product-specification-manual-tcmt0021.pdf](https://www.eaton.com/content/dam/eaton/products/transmissions/lubricants/eaton-lubricants-product-specification-manual-tcmt0021.pdf)
5. Michelin tire maintenance rotation guidance (rotation baseline):  
   [https://www.michelinman.com/auto/auto-tips-and-advice/tire-maintenance/tire-rotation](https://www.michelinman.com/auto/auto-tips-and-advice/tire-maintenance/tire-rotation)

## Make/Year Mapping Rationale

- `PETERBILT` (`389`, `567`, `579`; `2015`-`2024`): class-8 long-haul duty intervals anchored to Cummins/Eaton + DOT cadence.
- `MACK` (`ANTHEM`; `2022`-`2023`): class-8 severe-duty cadence mapped to frequent brake/DEF checks with annual DOT requirement.
- `VOLVO TRUCK` (`VNL`, `VNR`; `2022`-`2024`): modern class-8 cadence aligned with transmission, coolant, and emissions service intervals.
- `FREIGHTLINER` (`CASCADIA`; `2009`): conservative heavy-duty cadence with tighter inspection windows for older equipment.

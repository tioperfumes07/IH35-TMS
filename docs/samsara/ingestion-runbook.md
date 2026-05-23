# Samsara to `mdata.units` Ingestion Runbook

## Purpose

`scripts/ingest-samsara-to-mdata-units.mjs` replaces placeholder test units in `mdata.units` with real fleet records from `integrations.samsara_vehicles`, then re-links `integrations.samsara_vehicles.local_unit_id` through `scripts/link-samsara-to-units.mjs`.

This is data-level remediation (no schema migration).

## Safety and Idempotency

- The script is idempotent by VIN via `INSERT ... ON CONFLICT (vin) DO UPDATE`.
- A strict pre-check runs before any write:
  - It expects exactly 4 test rows.
  - Every candidate row must match:
    - `unit_number LIKE 'TEST-TRUCK-%'`
    - `vin LIKE 'TESTTRUCKVIN%'`
  - If this pattern does not match, the script refuses to delete anything.
- The test-row delete is limited to:
  - `DELETE FROM mdata.units WHERE unit_number LIKE 'TEST-TRUCK-%' AND vin LIKE 'TESTTRUCKVIN%'`.
- The script fails if Samsara vehicle volume is unexpectedly low/high (`<10` or `>200` VIN-bearing vehicles).

## Attribution Config

Carrier attribution is deterministic and versioned in:

- `config/samsara-carrier-attribution.json`

Current model:

- `owner_company_id_for_all` = TRK (asset owner)
- `lease_assignment_rules` map Samsara tags to lease company assignment
- `default_lease` = TRANSP
- USMCA lease rule is date-gated for July 2026 launch (`active: false`, `active_from: 2026-07-01`)

Update process:

1. Edit `config/samsara-carrier-attribution.json`.
2. Commit the config change.
3. Re-run ingestion script.
4. Verify output counters and linkage summary.

## How to Run

From repo root:

```bash
node scripts/ingest-samsara-to-mdata-units.mjs
```

Required env:

- `DATABASE_URL` or `DATABASE_DIRECT_URL`

Expected summary output includes:

- `tenants_attributed`
- `units_created`
- `units_updated`
- `test_units_deleted`
- `conflicts_handled`
- `matched_vehicle_links`
- `test_units_remaining`

## Post-Run Verification (Neon SQL)

```sql
SELECT COUNT(*) AS test_units_remaining
FROM mdata.units
WHERE unit_number LIKE 'TEST-%' OR vin LIKE 'TEST%';
```

```sql
SELECT owner_company_id, currently_leased_to_company_id, COUNT(*) AS units
FROM mdata.units
GROUP BY owner_company_id, currently_leased_to_company_id
ORDER BY units DESC;
```

```sql
SELECT operating_company_id, COUNT(*) FILTER (WHERE local_unit_id IS NOT NULL) AS linked, COUNT(*) AS total
FROM integrations.samsara_vehicles
GROUP BY operating_company_id
ORDER BY operating_company_id;
```

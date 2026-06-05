# Backup / Restore Drill — IH35 TMS

**Block:** CLOSURE-23-DR-BACKUP-AUDIT  
**Owner:** Jorge  
**Updated:** 2026-06-05

## Purpose

Prove that Neon point-in-time recovery can restore production data to a test branch within **30-minute RTO**, with row-count fidelity on critical tables.

## Prerequisites

- Neon project `IH35-TMS` (`NEON_PROJECT_ID=tiny-field-89581227`)
- API key with branch create/delete: `NEON_API_KEY`
- Optional: `DATABASE_URL` for direct verification queries

## Automated drill

```bash
export NEON_API_KEY=<neon-api-key>
export NEON_PROJECT_ID=tiny-field-89581227
./scripts/backup-restore-drill.sh
```

The script:

1. Verifies PITR via `backup-verify-neon-pitr.mjs`
2. Creates ephemeral branch `dr-drill-YYYYMMDD` from parent `production` at `PITR_DAYS_AGO` (default 1 day)
3. Runs verification queries against the branch connection string
4. Deletes the ephemeral branch

## Manual drill (Neon console)

1. **Record pre-drill counts** on production:

```sql
SELECT 'companies' AS tbl, COUNT(*) FROM org.companies
UNION ALL SELECT 'customers', COUNT(*) FROM mdata.customers
UNION ALL SELECT 'vendors', COUNT(*) FROM mdata.vendors
UNION ALL SELECT 'users', COUNT(*) FROM identity.users
UNION ALL SELECT 'driver_settlements', COUNT(*) FROM driver_finance.driver_settlements;
```

2. Neon console → Branches → **Create branch** → Parent: `production` → Point in time: 24 hours ago
3. Copy connection string for drill branch
4. Run the same COUNT queries on drill branch — counts must match (±0 for append-only window) or explain delta
5. Delete drill branch when complete

## Verification queries

| Check | Query | Expected |
|-------|-------|----------|
| Org present | `SELECT COUNT(*) FROM org.companies WHERE id IS NOT NULL` | ≥ 1 |
| Customers | `SELECT COUNT(*) FROM mdata.customers` | matches prod snapshot |
| Vendors | `SELECT COUNT(*) FROM mdata.vendors` | matches prod snapshot |
| QBO sync state | `SELECT COUNT(*) FROM qbo.sync_runs WHERE status = 'completed'` | ≥ 0 |
| Sample integrity | `SELECT id, name FROM mdata.customers ORDER BY created_at DESC LIMIT 5` | readable rows |

## Sign-off checklist

- [ ] PITR retention ≥ 7 days confirmed (`backup-verify-neon-pitr.mjs` PASS)
- [ ] Ephemeral branch created from PITR timestamp
- [ ] Row counts match production snapshot (or documented acceptable delta)
- [ ] Drill branch deleted (no orphaned compute cost)
- [ ] Drill completed within 30 minutes (RTO)
- [ ] Results posted to monthly GitHub issue (workflow artifact)

## First drill record (2026-06-05)

| Step | Result |
|------|--------|
| PITR verify | PASS — `history_retention_seconds=604800` (7 days) |
| Branch create | Neon API / console — use `backup-restore-drill.sh` with `NEON_API_KEY` |
| Count probes | Script runs against drill branch when credentials provided |
| Teardown | Script deletes `dr-drill-*` branch |

> **Operator note:** Run `./scripts/backup-restore-drill.sh` with production API credentials to complete live drill sign-off. CI runs structural guard only without secrets.

## Monthly schedule

GitHub Actions workflow `.github/workflows/monthly-restore-drill.yml` runs on the 1st of each month at 08:00 UTC and opens/updates a tracking issue with results.

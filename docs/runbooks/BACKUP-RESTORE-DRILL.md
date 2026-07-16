# Backup / Restore Drill — IH35 TMS

**Block:** CLOSURE-23-DR-BACKUP-AUDIT · **Updated:** 2026-06-05

## Automated drill
```bash
export NEON_API_KEY=<key>
export NEON_PROJECT_ID=tiny-field-89581227
# Prefer pointing integrity at the restored/ephemeral copy:
export RESTORED_DATABASE_URL=<restored-branch-connection>
./scripts/backup-restore-drill.sh
```

## B-D3 data-integrity assertion
After restore, `scripts/restore-drill-integrity.mjs` fails the drill (loudly) unless:
- hub-table row counts are non-zero (and within ±5% of baseline when `RESTORE_BASELINE_COUNTS` / latest `docs/audits/backup-checksums-*.json` is present)
- `verify-balanced-ledger` assertions pass on the restored data
- migration ledger (`_system._schema_migrations`) is complete vs `db/migrations/*.sql`
- audit hash-chain linkage intact
- critical FK orphan checks pass
- required financial columns have no NULLs

```bash
npm run restore-drill:integrity:selftest
RESTORED_DATABASE_URL=… npm run restore-drill:integrity
```

Optional attestation write: `ops.daily_attestations` with `check_key='restore_drill'` when that table exists (B-D1).

## Verification queries
```sql
SELECT 'customers', COUNT(*) FROM mdata.customers
UNION ALL SELECT 'vendors', COUNT(*) FROM mdata.vendors
UNION ALL SELECT 'users', COUNT(*) FROM identity.users
UNION ALL SELECT 'driver_settlements', COUNT(*) FROM driver_finance.driver_settlements;
```

## Sign-off
- [ ] PITR ≥ 7 days (`backup-verify-neon-pitr.mjs`)
- [ ] Ephemeral branch from PITR timestamp
- [ ] Row counts match prod snapshot
- [ ] Data-integrity assertion PASS (`restore-drill-integrity.mjs`)
- [ ] Branch deleted within 30 min RTO

**2026-06-05:** PITR verified via Neon MCP (`history_retention_seconds=604800`).

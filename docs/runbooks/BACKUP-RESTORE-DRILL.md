# Backup / Restore Drill — IH35 TMS

**Block:** CLOSURE-23-DR-BACKUP-AUDIT · **Updated:** 2026-06-05

## Automated drill
```bash
export NEON_API_KEY=<key>
export NEON_PROJECT_ID=tiny-field-89581227
./scripts/backup-restore-drill.sh
```

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
- [ ] Branch deleted within 30 min RTO

**2026-06-05:** PITR verified via Neon MCP (`history_retention_seconds=604800`).

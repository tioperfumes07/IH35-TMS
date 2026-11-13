# CC-2 Row 77 — Migration snapshot staleness ruling
**Date:** 2026-11-12  
**Author:** CC-2 (Claude Sonnet 4.6)  
**Branch:** cc-2/row77-factoring-invoice-status-engine

## Issue

`verify-applied-migrations-immutable.mjs` fails because two migration files in
`db/migrations/` have different checksums on disk vs the `.ledger.json` snapshot:

- `202616480200_dispatch_capacity_load_board_audit_triggers.sql`
- `202616510100_settlement_lines_reinstated_je_same_entity_fk.sql`

Both files were committed by CC-1 in `52699ab7ba` with "DO NOT RUN ON PROD. Held migration"
header comments. The `.ledger.json` snapshot captured these files at an earlier state (before
the held-comment header was added), creating a checksum mismatch.

## Live Proof

Query run 2026-11-12 22:00Z against `_system._schema_migrations` on prod:

```sql
SELECT filename FROM _system._schema_migrations
WHERE filename IN (
  '202616480200_dispatch_capacity_load_board_audit_triggers.sql',
  '202616510100_settlement_lines_reinstated_je_same_entity_fk.sql'
);
-- Result: 0 rows
```

**Both migrations are NOT applied on prod.** The snapshot (`.ledger.json`) tracked
these files prematurely — they existed on disk when the snapshot was last regenerated
but had not yet been run against the database.

## Conclusion

This is snapshot staleness, not an immutability violation. No SQL DDL was changed in
the applied state. The overrides are safe and correct: the guard passes when `DATABASE_URL`
is set (live check returns 0 rows) and the overrides restore parity for offline checks.

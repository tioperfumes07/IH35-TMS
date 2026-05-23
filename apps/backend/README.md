# Backend Runtime Notes

## Startup Migration Drift Guard

Backend startup runs a migration drift guard before route registration and before `app.listen()`.

- Guard module: `apps/backend/src/db/startup-migration-drift-guard.ts`
- It compares `db/migrations/*.sql` against both ledgers:
  - `_system._schema_migrations`
  - `ih35_migrations.applied_migrations`
- If any migration is missing from either ledger, process exits with code `1`.

### Bypass (debug only)

- Setting `SKIP_MIGRATION_DRIFT_GUARD` to `true` bypasses this check.
- This bypass is acceptable only for local debugging.
- Do **not** set this in Render or any production-like deployment environment.


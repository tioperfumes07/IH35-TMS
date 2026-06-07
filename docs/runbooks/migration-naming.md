# Migration Naming Convention

## Summary

All **new** migrations use a UTC-timestamp filename format to guarantee uniqueness
across parallel development lanes. Legacy 4-digit sequence names are frozen.

---

## Format Reference

| Format | Pattern | Example | Status |
|--------|---------|---------|--------|
| **New (timestamp)** | `YYYYMMDD_HHMMSS_<slug>.sql` | `20260607_143022_add_foo_column.sql` | ✅ Use for all new migrations |
| **Legacy (sequence)** | `NNNN[a]_<slug>.sql` | `0404_drivers_rls_oci_scope.sql` | ❌ Frozen — no new files |

---

## Why Timestamp Format

Legacy 4-digit sequence numbers require developers to coordinate the "next number."
When two parallel lanes both pick the same sequence number (e.g. `0405_...`) a
conflict is unavoidable at merge time. Timestamp-prefixed names are unique by
construction — parallel workers generating names seconds apart get distinct prefixes.

---

## Creating a New Migration

### Using the helper (recommended)

```js
import { generateMigrationName } from "../scripts/db-migrate.mjs";

// Returns e.g. "20260607_143022_add_foo_column.sql"
const filename = generateMigrationName("add_foo_column");
```

### Manual

1. Note the current UTC time: `date -u +%Y%m%d_%H%M%S`
2. Construct: `<YYYYMMDD_HHMMSS>_<descriptive_slug>.sql`
3. Place in `db/migrations/`

---

## Sorting Guarantee

`db-migrate.mjs` sorts migration filenames lexicographically. Timestamp names
(`2026…`) sort after all legacy names (`0001…0999`) because `'2' > '0'` in ASCII.
Within timestamp names, chronological order equals lexicographic order.

---

## Every CREATE SCHEMA Must Include GRANT USAGE

When a migration introduces a new PostgreSQL schema with `CREATE SCHEMA`, it
**must** also include `GRANT USAGE ON SCHEMA <name> TO ih35_app` in the same
file (or a co-committed migration file in the same PR).

### Why this is required

PostgreSQL schema-level `USAGE` is a prerequisite for the app role to access
any object within the schema — tables, sequences, functions, etc.  Object-level
`GRANT SELECT/INSERT/UPDATE` is **not sufficient** on its own.  Without
`GRANT USAGE ON SCHEMA`, the app role receives:

```
ERROR: permission denied for schema <name>
```

at runtime, even when all table-level permissions are correctly granted.  This
causes login outages and was observed in the `0309_notification_center` incident
(the schema `notifications` was created with table grants but no schema USAGE,
which broke the auth flow until a subsequent hotfix migration was deployed).

### Required GRANT block

```sql
-- Required alongside any CREATE SCHEMA:
GRANT USAGE ON SCHEMA <name> TO ih35_app;

-- Object-level grants (also required, separately):
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA <name> TO ih35_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA <name> TO ih35_app;
```

### CI enforcement

The `premerge-gates / schema-grant-check` CI gate (`scripts/verify-migration-schema-grants.mjs`)
scans all new migrations (above baseline `0406`) and fails the PR with:

> Schema '\<name\>' created but GRANT USAGE ON SCHEMA ... TO ih35\_app not found.
> Add it to prevent login outages.

PRs cannot merge to `main` until this gate passes.

---

## Immutability Rule

Once a migration is applied (recorded in `_system._schema_migrations` and
`db/migrations/.ledger.json`) its file content and name **must never change**.
The `migration-guard.yml` CI check enforces this for both legacy and timestamp
format files.

---

## Conflict Resolution for Parallel Lanes

Before timestamp naming, two parallel lanes could both create `0405_something.sql`.
At merge time, only one could win — the other had to be renumbered, re-reviewed,
and the ledger updated.

With timestamp naming, both lanes create files like:
- Lane A: `20260607_143022_add_foo.sql`
- Lane B: `20260607_143055_add_bar.sql`

These filenames are unique. Both files can coexist in the same PR merge without
conflict. No renumbering, no ledger patch.

---

## Legacy Format: Frozen

The legacy `NNNN_` sequence is permanently frozen at `0404_drivers_rls_oci_scope.sql`.
No new files with 4-digit sequence prefixes will be accepted. The `migration-guard.yml`
CI step `Reject new 4-digit sequence migrations` enforces this.

Existing legacy files remain valid and apply in their original order before any
timestamp-format files.

---

## Edge Cases

- **Two workers, same second**: Statistically unlikely. If it occurs, one worker's
  migration applies first (alphabetically by slug). Both still apply correctly; there
  is no collision on the sequence number.
- **Backfilling the ledger**: `node scripts/db-migrate.mjs --backfill-ledger` works
  with both filename formats.
- **Checksum overrides**: The override file `scripts/lib/migration-checksum-overrides.json`
  accepts any filename format.

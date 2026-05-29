# Migration Ledger Orphan Cleanup
Orphan = entry in migration ledger table with no corresponding file on disk.
## When this happens
- Migrations renumbered without ledger cleanup
- Manual application via Neon console
- Pre-rename safety table migrations
## Fix (privileged access required)
`_system._schema_migrations` is locked to neondb_owner role. Cleanup must run via
Neon SQL Editor — app code cannot delete these.
1. Open https://console.neon.tech → IH35-TMS → SQL Editor
2. Verify each orphan forensically (rename history, applied_by metadata)
3. Run DELETE in single transaction. See CLEANUP-4 PR for the template.
## Guard
`npm run verify:no-orphan-migration-ledger-entries`
24-hour grace window — entries applied within last 24h are excluded to protect
active in-flight work.

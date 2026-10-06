# LANE_CROSS — CC-1 — LST-F419 migration-ledger hygiene (2026-10-06)

**Authority:** LANES.md "CC-1 — schema, gates, hygiene"; Lead ROUND 432-CC1 item 5 (365.6, main green on the live
guards). Both files are UNASSIGNED.

Files outside CC-1's lane:
- `scripts/known-migration-ledger-exceptions.json`: 6 stale `ledger_orphans` entries removed. Each was measured on prod,
  1 row in BOTH `ih35_migrations.applied_migrations` and `_system._schema_migrations`, and the file is on disk, so none
  is an orphan. db-migrate.mjs (every deploy's preDeploy) reads this file, which is why each removal was measured first.
  The 3 real orphans stay.
- `scripts/canonical-relations.json`: regenerated read-only from prod (`gen-canonical-relations.mjs`), 897 -> 898. CC-2's
  `views.factoring_repurchase_obligation` (FARO-F435) was applied today, so the committed file was stale on main for every
  seat and `verify-derived-artifact-freshness` failed whichever branch touched its inputs first.

**CC-2 / CC-3 / Cursor:** nothing to do. This note is the record of the crossing.

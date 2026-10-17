-- LEAD 443.187 (CC-3) — verify-migration-schema-grants: the app role must hold USAGE on every schema a migration
-- creates. `views` (CREATE SCHEMA in 202607600000 — the factoring linkage views the app reads) and `migration`
-- (CREATE SCHEMA in 202606161700 — the migration ledger) were never granted to ih35_app by a migration: production
-- works for `views` only through an out-of-band PUBLIC grant, and `migration` has no ih35_app grant at all, so a
-- database built from source denies the app the factoring linkage views. Idempotent; grants only (no object change).
GRANT USAGE ON SCHEMA views TO ih35_app;
GRANT USAGE ON SCHEMA migration TO ih35_app;

# P3-MIGRATION-FIX-1: Migration 0030 not idempotent — fails on re-run

## Status
Pre-existing on main. Discovered during P3-T11.5 cross-check.

## Reproduction
On a fresh clone or after the schema is partially applied:
npm run db:migrate
Result: "Migration failed: policy files_insert_office for table files already exists" at 0030_docs_files_driver_insert_rls.sql

## Expected
Migrations are idempotent (DO + IF NOT EXISTS pattern per architectural decision in Master Blueprint).

## Actual
0030 uses CREATE POLICY without DO + IF NOT EXISTS guard, so re-run on an existing schema fails. Migrations 0031..0040 (including P3-T11.5 migration) never apply on subsequent runs.

## Fix sketch
Wrap the CREATE POLICY in a DO block:
DO $$ BEGIN
  CREATE POLICY files_insert_office ON docs.files ...;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

## Priority
P1 — blocks fresh DB setup. Fix in a dedicated PR.

## Owner
TBD.

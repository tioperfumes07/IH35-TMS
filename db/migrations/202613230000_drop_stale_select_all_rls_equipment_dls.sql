-- CATALOG-EQUIPMENT-TYPES-AND-DRIVER-LOAD-STATUSES-STALE-SELECT-ALL-RLS-POLICY-DEFEATS-ENTITY-SCOPE
--
-- ROOT CAUSE: catalogs.equipment_types and catalogs.driver_load_statuses were originally created as
-- genuinely global/shared catalogs with an unconditionally-permissive SELECT policy
-- (equipment_types_select_all, db/migrations/0017_equipment_types_catalog.sql; dls_select_all,
-- db/migrations/0019_cust_driver_fields.sql). Both were LATER converted to per-entity tables
-- (202607910000_equipment_types_per_entity.sql, 202607870000_driver_load_statuses_per_entity.sql)
-- — each conversion migration adds operating_company_id, backfills+seeds real per-company rows
-- (verified live on prod: 100% non-null, zero shared/NULL rows), and adds a correctly-scoped
-- company_scope policy — but NEITHER conversion migration ever DROPPED the original
-- USING (true) SELECT policy. Postgres RLS permissive policies for the same command are OR'd, so
-- a row is visible under SELECT if it satisfies EITHER policy — the leftover unconditional-true
-- policy silently grants full cross-entity read access to every row, completely defeating
-- company_scope for every SELECT, regardless of which app.operating_company_id GUC is set.
--
-- Verified live on prod (pg_policy): both company_scope AND the leftover _select_all/dls_select_all
-- (USING (true)) policies are simultaneously active on both tables today.
--
-- SAFETY CHECK BEFORE DROPPING (done, not guessed): grepped every SQL reference to these two
-- tables across apps/backend/src — catalog-registry.routes.ts (LISTS-F6704, already has an
-- explicit operating_company_id = $1 predicate), equipment-types.routes.ts,
-- driver-load-statuses.routes.ts, and mdata/driver-profile.routes.ts's 3 JOIN sites — every single
-- one already filters explicitly by operating_company_id at the application-SQL level. None relies
-- on the leaky policy for correctness. Dropping it closes the hole for any FUTURE query that
-- forgets the explicit filter (defense in depth — the actual purpose of RLS) without changing any
-- current behavior.

BEGIN;

DROP POLICY IF EXISTS equipment_types_select_all ON catalogs.equipment_types;
DROP POLICY IF EXISTS dls_select_all ON catalogs.driver_load_statuses;

COMMIT;

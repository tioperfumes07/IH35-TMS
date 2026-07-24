-- [HOLD-FOR-JORGE — TIER 1] DO NOT RUN ON PROD — run ONLY on a Neon branch by Jorge's hand, then
-- ledger-backfill so prod db:migrate skips it. Registered in db/migrations/.held-migrations.json.
--
-- SAFETY SCHEMA-WIDE DELETE HARDENING (owner work order 2026-07-24, Part B).
--
-- ============================================================================================
-- ROOT CAUSE (verified on prod branch br-fancy-credit-akjnd07a, 2026-07-24 — pg_default_acl +
-- information_schema.role_table_grants, PROD WINS):
--   1. Migration 0065 ran `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA safety
--      TO ih35_app` — a blanket retroactive grant that gave DELETE to every safety table then
--      present, superseding tables' own SELECT/INSERT/UPDATE-only grants (e.g. civil_fines).
--   2. 0065 ALSO ran `ALTER DEFAULT PRIVILEGES IN SCHEMA safety GRANT ...,DELETE ON TABLES TO
--      ih35_app`, so the schema DEFAULT ACL is `ih35_app=arwd` (the `d` = DELETE). EVERY new table
--      created in `safety` inherits DELETE at creation. Confirmed on prod: 61 safety tables carry
--      DELETE for ih35_app.
-- Only safety.civil_fines had been hardened (202607110200 REVOKEd DELETE + a guard). The three
-- F29 join tables were hardened in 202607840000. This migration finishes the schema.
--
-- PER-TABLE CLASSIFICATION (not a blanket revoke — the work order forbids that). Each table was
-- checked for the void-not-delete signal (voided_at / deactivated_at / archived_at) and its role:
--
--   REVOKE DELETE — EVIDENCE, void-not-delete or append-only. DELETE contradicts the record's job:
--     • Explicit voided_at (federal / disciplinary / qualification evidence): accidents,
--       accident_reports, background_checks, citations, clearinghouse_query, complaints,
--       dot_inspections, driver_documents, driver_leave_days, driver_leave_requests,
--       driver_qualification_files, driver_safety_profiles, driver_w8ben, drug_pool_selections,
--       drug_test, event_documents, fmcsa_events, hos_exceptions, hos_violations, incidents,
--       internal_fines, medical_cards, random_pool, roadside_inspections, rtd_case,
--       temp_unit_assignments, training_programs, training_records, violations
--     • Soft-delete via deactivated_at/archived_at: company_violations, permits
--     • Append-only evidence / audit trail (no soft-delete column YET — a follow-up may add one,
--       but DELETE must be off regardless): da_test_records, da_random_pool_draws, dvir_submissions,
--       dvir_defects, dvir_defect_severity_tags, safety_events, safety_event_notes,
--       integrity_findings, integrity_observations, damage_continuity_chains,
--       photo_comparison_sessions, driver_leave_audit_log, harsh_events, geofence_breach_events,
--       csa_scores, driver_safety_scores, fuel_gps_matches
--
--   KEEP DELETE — legitimately deletable, NOT evidence (stated so the exclusion is auditable):
--     • Rules/config the operator edits and removes: anomaly_alert_rules, document_alert_rules,
--       integrity_alert_rules
--     • Derived/dismissable alerts + their events (regenerated from source, not a record of fact):
--       anomaly_alerts, integrity_alerts, integrity_alert_events, document_alert_events
--     • Transient / regeneratable reminders + settings: compliance_reminders,
--       permit_renewal_reminders, safety_settings (one row per company, UPDATE-not-DELETE anyway),
--       onboarding_sessions
--     • Enrollment with its own is_active soft-delete already: da_program_enrollments
--   Views (v_*) are excluded — DELETE on a security_invoker view is not a data-loss path.
--
-- SAFETY: idempotent. REVOKE of an already-revoked privilege is a no-op; the default-privilege
-- REVOKE is idempotent too. Additive posture (no data touched, no column/table change). PROD was
-- validated in a throwaway DB reproducing the `arwd` default. Grant change = financial cluster:
-- HELD, owner-applied, never self-merged.

BEGIN;

-- ---------------------------------------------------------------------------------------------
-- 1. Narrow the schema DEFAULT PRIVILEGE so NEW safety tables never inherit DELETE again.
--    Exact inverse of 0065's `ALTER DEFAULT PRIVILEGES IN SCHEMA safety GRANT ...,DELETE`. Same
--    (no FOR ROLE) form, so it matches the default created by the migration-runner role.
-- ---------------------------------------------------------------------------------------------
ALTER DEFAULT PRIVILEGES IN SCHEMA safety REVOKE DELETE ON TABLES FROM ih35_app;

-- ---------------------------------------------------------------------------------------------
-- 2. REVOKE DELETE on the existing evidence tables. Guarded per-table so a fresh CI DB that lacks
--    a given table (held creator not yet applied) does not error — REVOKE on a missing table would
--    raise, so each is gated by to_regclass.
-- ---------------------------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  evidence_tables text[] := ARRAY[
    'accidents','accident_reports','background_checks','citations','clearinghouse_query','complaints',
    'dot_inspections','driver_documents','driver_leave_days','driver_leave_requests',
    'driver_qualification_files','driver_safety_profiles','driver_w8ben','drug_pool_selections',
    'drug_test','event_documents','fmcsa_events','hos_exceptions','hos_violations','incidents',
    'internal_fines','medical_cards','random_pool','roadside_inspections','rtd_case',
    'temp_unit_assignments','training_programs','training_records','violations',
    'company_violations','permits',
    'da_test_records','da_random_pool_draws','dvir_submissions','dvir_defects',
    'dvir_defect_severity_tags','safety_events','safety_event_notes','integrity_findings',
    'integrity_observations','damage_continuity_chains','photo_comparison_sessions',
    'driver_leave_audit_log','harsh_events','geofence_breach_events','csa_scores',
    'driver_safety_scores','fuel_gps_matches'
  ];
BEGIN
  FOREACH t IN ARRAY evidence_tables LOOP
    IF to_regclass('safety.' || t) IS NOT NULL THEN
      EXECUTE format('REVOKE DELETE ON safety.%I FROM ih35_app', t);
    END IF;
  END LOOP;
END $$;

COMMIT;

-- ===========================================================================================
-- POST-APPLY VERIFY (by hand on the Neon branch; NOT part of the migration)
-- ===========================================================================================
--  -- (a) default privilege no longer carries DELETE
--  SELECT d.defaclacl::text FROM pg_default_acl d
--    JOIN pg_namespace n ON n.oid=d.defaclnamespace WHERE n.nspname='safety' AND d.defaclobjtype='r';
--  -- expect ih35_app=arwU-less-the-d, i.e. `ih35_app=arw/...` (no d).
--
--  -- (b) every evidence table above is now DELETE-free; the KEEP-DELETE set still has DELETE.
--  SELECT table_name, string_agg(privilege_type, ',' ORDER BY privilege_type)
--    FROM information_schema.role_table_grants
--   WHERE table_schema='safety' AND grantee='ih35_app'
--   GROUP BY table_name
--   HAVING string_agg(privilege_type, ',') LIKE '%DELETE%'
--   ORDER BY table_name;
--  -- expect ONLY: anomaly_alert_rules, anomaly_alerts, compliance_reminders, da_program_enrollments,
--  --   document_alert_events, document_alert_rules, integrity_alert_events, integrity_alert_rules,
--  --   integrity_alerts, onboarding_sessions, permit_renewal_reminders, safety_settings.
--
-- DOWN (manual rollback — only if a legitimate hard-delete path is introduced on a listed table):
--   GRANT DELETE ON safety.<table> TO ih35_app;   -- per table
--   ALTER DEFAULT PRIVILEGES IN SCHEMA safety GRANT DELETE ON TABLES TO ih35_app;  -- restore default

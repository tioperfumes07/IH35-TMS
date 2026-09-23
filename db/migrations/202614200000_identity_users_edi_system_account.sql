-- 202614200000_identity_users_edi_system_account.sql
--
-- Lead ruling 2026-09-22: a genuine identity.users SERVICE-ACCOUNT row for machine-origin
-- writes (EDI 204, the CSV importer, and any future feed) -- USMCA-scoped, correct role, no
-- password, cannot authenticate, appears by name in audit history. Gives the id
-- 00000000-0000-4000-8000-000000000001 a real row -- that id was previously a FAKE placeholder
-- referenced by driver-finance/auto-pay.cron.ts and
-- integrations/samsara/auto-status-switch/detector.service.ts (safe there only because they
-- write it exclusively into FK-free audit columns), unblocking createLoadWithFullSideEffects
-- (which writes it into a REAL FK-constrained column, mdata.loads.dispatcher_user_id, via the
-- E6 EDI-204/seed-sample-data rewires this session) for the first time.
--
-- ROOT CAUSE this migration closes: this exact row was created LIVE, directly on production,
-- earlier this session -- but never as a migration. Production has had the row all along;
-- CI's ephemeral fresh Postgres never did, so any test exercising the EDI-204 create path
-- (inbound-204-create-draft-load.db.test.ts) has been failing in CI ever since with
-- "insert or update on table loads violates foreign key constraint
-- loads_dispatcher_user_id_fkey" -- a real, deterministic gap, not flake. This migration is
-- idempotent (INSERT ... ON CONFLICT DO NOTHING) so re-running it against production, where the
-- row already exists, is a no-op; CI's fresh DB gets the row for the first time.
--
-- default_company_id is resolved via a subquery, not a hardcoded literal: CI's local-gate
-- fresh-Postgres run applies every migration in order starting from an EMPTY org.companies, and
-- this migration's timestamp (202614200000) sorts before the USMCA company row exists in that
-- environment -- a hardcoded literal FK violates users_default_company_id_fkey there even though
-- it resolves fine on production, where the company already exists. The subquery returns NULL
-- when the company row isn't there yet (default_company_id is nullable), so this migration is
-- safe standalone in a from-scratch database; the column is not load-bearing for the EDI/system
-- actor use case (requesting code sets operating_company_id from context, not from this row).
DO $$
BEGIN
  IF to_regclass('identity.users') IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO identity.users (
    id, email, google_user_id, role, created_at, deactivated_at, phone,
    auth_phone_verified_at, default_company_id, preferred_language,
    onboarding_completed_at, password_hash, first_name, last_name,
    archived_at, last_login_at, archived_reason, is_primary_owner
  )
  VALUES (
    '00000000-0000-4000-8000-000000000001'::uuid,
    NULL, NULL, 'Administrator', now(), NULL, NULL,
    NULL,
    (SELECT id FROM org.companies WHERE id = '5c854333-6ea5-4faa-af31-67cb272fef80'::uuid),
    'en',
    NULL, NULL, 'System', 'Automation',
    NULL, NULL, NULL, false
  )
  ON CONFLICT (id) DO NOTHING;
END $$;

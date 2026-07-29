-- OB-01 — Opening Balance Register (staging → owner review → data-gated commit).
--
-- ROOT CAUSE this closes: catalogs.accounts already carries opening_balance_cents /
-- opening_balance_as_of, and prod (2026-07-28, complete read) has 1,233 active accounts across
-- TRANSP/TRK/USMCA with **0** of them carrying a non-zero opening balance and **0** carrying an
-- as-of date. The only opening-balance code paths that exist are READ-ONLY previews
-- (opening-balance-import.service.ts, qbo-ob-2026-03-31-live-pull.service.ts) that assemble a JE
-- and stop. There is no surface that can persist a reviewed opening balance, no audit of who
-- changed one, and — the control that matters — nothing that can refuse to commit opening balances
-- while the QBO source period is still being cleaned up.
--
-- WHAT THIS ADDS (additive, no GL math, posts nothing):
--   1. accounting.ob_register_staging_lines — per-account staged opening balance, per entity, per
--      as-of date. Imported from QBO or hand-entered; edited under review; committed once.
--   2. accounting.ob_register_audit_events  — WORM (append-only, trigger-enforced) audit of every
--      import / edit / finality flip / refused commit / commit.
--   3. accounting.ob_source_finality        — Martin's per-(entity, as-of) "the QBO cleanup for this
--      period is FINAL" flag. The commit endpoint hard-refuses unless is_final = true. This is the
--      data gate: auto-import and auto-stage are safe at any time, the irreversible write to
--      catalogs.accounts is not.
--
-- CANONICAL-CHECK: opening_balance_staging. accounting.ob_register_staging_lines is a REVIEW BUFFER,
-- not a ledger. The canonical home of an opening balance is, and stays, catalogs.accounts
-- (opening_balance_cents / opening_balance_as_of) — this table holds the proposed value only until a
-- checker commits it onto that column, at which point the row is marked 'committed' and stops being
-- read. No money is derived from it, nothing posts from it, and no balance is reported off it.
--
-- CANONICAL-CHECK: opening_balance_audit. accounting.ob_register_audit_events is a WORM AUDIT of who
-- touched the register, not a money subledger. It carries no debit/credit and no account balance; GL
-- money continues to live in accounting.journal_entries / journal_entry_postings, which this module
-- never writes. Distinct from accounting.audit_events only in that it is scoped to, and joins, the
-- register's own staging rows; it mirrors the per-domain WORM tables already in this schema.
--
-- CANONICAL-CHECK: opening_balance_source_finality. accounting.ob_source_finality is a per-(entity,
-- as-of) CONTROL FLAG — the accountant's "the QBO cleanup for this period is done". It is not a
-- period-close ledger and does not overlap accounting.accounting_periods: closing a period locks
-- posting for a date range, whereas this flag only decides whether the opening-balance commit may
-- run at all. Neither reads the other and neither can substitute for the other.
--
-- Maker/checker: staging rows carry created_by_user_id / updated_by_user_id; the commit path refuses
-- when the committing user is among the makers. Enforced in the service and asserted by the guard —
-- recorded here because the columns exist for that purpose.
--
-- NOT in this migration: no journal entry, no posting, no flag flip, no QBO write-back (QBO is
-- read-only in this system — parallel books). No opening balance is seeded; every value arrives
-- through the reviewed register.
--
-- Idempotent (IF NOT EXISTS + DO guards), apply-twice safe. Every precondition is NOTICE + RETURN,
-- never RAISE: role bindings and ops data are absent on the fresh database CI migrates, and a
-- migration that raises there breaks every fresh-DB run (verify-step 1727). Companies are resolved
-- by code, never by hardcoded UUID. FORCE RLS + entity-scoped policies + least-privilege grants.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'accounting')
     OR to_regclass('org.companies') IS NULL
     OR to_regclass('catalogs.accounts') IS NULL
     OR to_regclass('identity.users') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                     WHERE n.nspname = 'identity' AND p.proname = 'is_lucia_bypass') THEN
    RAISE NOTICE 'OB-01: prerequisites absent — skip opening balance register';
    RETURN;
  END IF;

  -- §1 — SOURCE FINALITY (the data gate) -------------------------------------------------------
  -- One row per (entity, as-of). is_final = true means the accountant has declared the QBO cleanup
  -- for that entity/period done, which is the ONLY thing that lets a commit proceed.
  CREATE TABLE IF NOT EXISTS accounting.ob_source_finality (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    operating_company_id  uuid NOT NULL REFERENCES org.companies(id),
    as_of_date            date NOT NULL,
    is_final              boolean NOT NULL DEFAULT false,
    set_by                uuid REFERENCES identity.users(id),
    set_at                timestamptz NOT NULL DEFAULT now(),
    note                  text,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_ob_source_finality_company_as_of UNIQUE (operating_company_id, as_of_date)
  );

  -- §2 — STAGING LINES --------------------------------------------------------------------------
  -- amount_cents is the SIGNED ACTUAL balance as the source reported it (the convention already
  -- locked in opening-balance-import.service.ts). Dr/Cr is derived from account_type at review
  -- time by the EXISTING signedCentsToDebitCredit helper — this table stores no debit/credit and
  -- no new GL math.
  CREATE TABLE IF NOT EXISTS accounting.ob_register_staging_lines (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    operating_company_id  uuid NOT NULL REFERENCES org.companies(id),
    as_of_date            date NOT NULL,
    account_id            uuid NOT NULL REFERENCES catalogs.accounts(id),
    amount_cents          bigint NOT NULL DEFAULT 0,
    source                text NOT NULL DEFAULT 'manual'
                            CHECK (source IN ('manual', 'qbo_import')),
    source_account_label  text,
    qbo_account_id        text,
    status                text NOT NULL DEFAULT 'staged'
                            CHECK (status IN ('staged', 'committed', 'superseded')),
    note                  text,
    created_by_user_id    uuid REFERENCES identity.users(id),
    updated_by_user_id    uuid REFERENCES identity.users(id),
    committed_by_user_id  uuid REFERENCES identity.users(id),
    committed_at          timestamptz,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now()
  );

  -- One STAGED line per account per as-of (re-import overwrites the staged row rather than
  -- duplicating it). Committed / superseded rows are history and are deliberately outside the
  -- unique so a later period can be staged without disturbing them.
  CREATE UNIQUE INDEX IF NOT EXISTS uq_ob_register_staging_line_staged
    ON accounting.ob_register_staging_lines (operating_company_id, as_of_date, account_id)
    WHERE status = 'staged';

  CREATE INDEX IF NOT EXISTS ix_ob_register_staging_lines_company_period
    ON accounting.ob_register_staging_lines (operating_company_id, as_of_date, status);
  CREATE INDEX IF NOT EXISTS ix_ob_register_staging_lines_account
    ON accounting.ob_register_staging_lines (account_id);

  -- §3 — WORM AUDIT -----------------------------------------------------------------------------
  CREATE TABLE IF NOT EXISTS accounting.ob_register_audit_events (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    operating_company_id  uuid NOT NULL REFERENCES org.companies(id),
    as_of_date            date NOT NULL,
    staging_line_id       uuid REFERENCES accounting.ob_register_staging_lines(id),
    account_id            uuid REFERENCES catalogs.accounts(id),
    event_type            text NOT NULL
                            CHECK (event_type IN (
                              'import_staged',
                              'line_edited',
                              'line_created',
                              'finality_set',
                              'commit_refused',
                              'committed'
                            )),
    actor_user_id         uuid REFERENCES identity.users(id),
    before_json           jsonb,
    after_json            jsonb,
    detail                text,
    created_at            timestamptz NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS ix_ob_register_audit_events_company_period
    ON accounting.ob_register_audit_events (operating_company_id, as_of_date, created_at DESC);
  CREATE INDEX IF NOT EXISTS ix_ob_register_audit_events_line
    ON accounting.ob_register_audit_events (staging_line_id)
    WHERE staging_line_id IS NOT NULL;

  -- §4 — RLS (FORCED, entity-scoped) --------------------------------------------------------------
  ALTER TABLE accounting.ob_source_finality ENABLE ROW LEVEL SECURITY;
  ALTER TABLE accounting.ob_source_finality FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS ob_source_finality_select ON accounting.ob_source_finality;
  DROP POLICY IF EXISTS ob_source_finality_write  ON accounting.ob_source_finality;
  CREATE POLICY ob_source_finality_select ON accounting.ob_source_finality FOR SELECT
    USING (identity.is_lucia_bypass()
           OR operating_company_id::text = current_setting('app.operating_company_id', true));
  CREATE POLICY ob_source_finality_write ON accounting.ob_source_finality FOR ALL
    USING (identity.is_lucia_bypass()
           OR operating_company_id::text = current_setting('app.operating_company_id', true))
    WITH CHECK (identity.is_lucia_bypass()
           OR operating_company_id::text = current_setting('app.operating_company_id', true));

  ALTER TABLE accounting.ob_register_staging_lines ENABLE ROW LEVEL SECURITY;
  ALTER TABLE accounting.ob_register_staging_lines FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS ob_register_staging_lines_select ON accounting.ob_register_staging_lines;
  DROP POLICY IF EXISTS ob_register_staging_lines_write  ON accounting.ob_register_staging_lines;
  CREATE POLICY ob_register_staging_lines_select ON accounting.ob_register_staging_lines FOR SELECT
    USING (identity.is_lucia_bypass()
           OR operating_company_id::text = current_setting('app.operating_company_id', true));
  CREATE POLICY ob_register_staging_lines_write ON accounting.ob_register_staging_lines FOR ALL
    USING (identity.is_lucia_bypass()
           OR operating_company_id::text = current_setting('app.operating_company_id', true))
    WITH CHECK (identity.is_lucia_bypass()
           OR operating_company_id::text = current_setting('app.operating_company_id', true));

  ALTER TABLE accounting.ob_register_audit_events ENABLE ROW LEVEL SECURITY;
  ALTER TABLE accounting.ob_register_audit_events FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS ob_register_audit_events_select ON accounting.ob_register_audit_events;
  DROP POLICY IF EXISTS ob_register_audit_events_insert ON accounting.ob_register_audit_events;
  CREATE POLICY ob_register_audit_events_select ON accounting.ob_register_audit_events FOR SELECT
    USING (identity.is_lucia_bypass()
           OR operating_company_id::text = current_setting('app.operating_company_id', true));
  CREATE POLICY ob_register_audit_events_insert ON accounting.ob_register_audit_events FOR INSERT
    WITH CHECK (identity.is_lucia_bypass()
           OR operating_company_id::text = current_setting('app.operating_company_id', true));

  -- §5 — GRANTS (least privilege) -----------------------------------------------------------------
  GRANT SELECT, INSERT, UPDATE ON accounting.ob_source_finality TO ih35_app;
  REVOKE DELETE ON accounting.ob_source_finality FROM ih35_app;

  GRANT SELECT, INSERT, UPDATE ON accounting.ob_register_staging_lines TO ih35_app;
  REVOKE DELETE ON accounting.ob_register_staging_lines FROM ih35_app;

  -- WORM: the audit table is append-only at the grant layer AND at the trigger layer (below).
  GRANT SELECT, INSERT ON accounting.ob_register_audit_events TO ih35_app;
  REVOKE UPDATE, DELETE ON accounting.ob_register_audit_events FROM ih35_app;
END
$$;

-- §6 — WORM enforcement -------------------------------------------------------------------------
-- Grants alone are revocable by any future migration that says GRANT ALL. The trigger makes the
-- append-only property a property of the TABLE, not of one role's privileges. Mirrors
-- events.event_log_append_only_trigger (202606111051).
--
-- Both the function and the trigger live inside the guarded DO block and are created with EXECUTE:
-- a bare CREATE FUNCTION accounting.… would be parsed and would ERROR on a database where the
-- accounting schema does not exist yet, which is exactly the fresh-DB run the §1 guard exists to
-- survive. Proved by applying this file to an empty database.
DO $$
BEGIN
  IF to_regclass('accounting.ob_register_audit_events') IS NULL THEN
    RAISE NOTICE 'OB-01: audit table absent — skip append-only trigger';
    RETURN;
  END IF;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION accounting.ob_register_audit_append_only_trigger()
    RETURNS trigger AS $body$
    BEGIN
      IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'accounting.ob_register_audit_events is append-only: UPDATE not allowed. Append a correcting event instead.';
      END IF;
      IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'accounting.ob_register_audit_events is append-only: DELETE not allowed.';
      END IF;
      RETURN NEW;
    END;
    $body$ LANGUAGE plpgsql;
  $fn$;

  DROP TRIGGER IF EXISTS ob_register_audit_append_only ON accounting.ob_register_audit_events;
  CREATE TRIGGER ob_register_audit_append_only
    BEFORE UPDATE OR DELETE ON accounting.ob_register_audit_events
    FOR EACH ROW
    EXECUTE FUNCTION accounting.ob_register_audit_append_only_trigger();
END
$$;

COMMIT;

-- Read-only verify (harmless on re-run): the three tables exist, are FORCE-RLS, and no opening
-- balance was seeded by this migration.
SELECT c.relname,
       c.relrowsecurity  AS rls_enabled,
       c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'accounting'
  AND c.relname IN ('ob_register_staging_lines', 'ob_register_audit_events', 'ob_source_finality')
ORDER BY c.relname;

-- DOWN
-- BEGIN;
-- DROP TRIGGER IF EXISTS ob_register_audit_append_only ON accounting.ob_register_audit_events;
-- DROP FUNCTION IF EXISTS accounting.ob_register_audit_append_only_trigger();
-- DROP TABLE IF EXISTS accounting.ob_register_audit_events;
-- DROP TABLE IF EXISTS accounting.ob_register_staging_lines;
-- DROP TABLE IF EXISTS accounting.ob_source_finality;
-- COMMIT;

-- [FINANCIAL-ADJACENT] GOV-FLAG-01 — put GL-posting flag changes under the append-only audit trigger.
-- POSTS NOTHING. Adds an audit trigger only. Idempotent. No data change, no schema change to the table.
--
-- ROOT CAUSE, MEASURED ON PROD 2026-08-03 (completeness discriminator applied; current_user asserted
-- in-statement):
--   triggers on lib.feature_flag_overrides ............ 0
--   audit.row_changes rows for feature_flag tables .... 0
--   tables already carrying audit.tg_audit_row ....... 43
-- `lib.feature_flag_overrides` is the table that decides whether a GL poster runs. Flipping one row
-- turns real journal entries on or off for an entity — and it was doing so with NO record of who
-- changed it, when, or from what. Forty-three lesser tables were audited; the one that governs the
-- ledger was not.
--
-- THIS IS SELF-REPORTED. The flags for PARTS_PURCHASE / SAFETY_FINE / INSURANCE_CLAIM_RECOVERY were
-- turned ON earlier today by agent action over an MCP connection, on the owner's explicit instruction.
-- The instruction was authoritative; the ABSENCE OF A TRAIL was not acceptable, and those three flips
-- left none. Anchor doc 02 states it plainly: "NEVER hand-run SQL on a raw console/MCP connection" —
-- because DDL/DML outside the pipeline bypasses the guards. The durable answer is not "stop doing it"
-- (an owner may legitimately need to), it is: make it IMPOSSIBLE to do untraceably.
--
-- WHY A TRIGGER RATHER THAN A PROCESS RULE: a process rule binds only agents who read it. A trigger
-- binds every writer — app, migration, console, MCP, future integration — including one that has never
-- heard of the rule. That is the NetSuite/QuickBooks-grade control: configuration that alters posting
-- behaviour is versioned and reviewable, and every change to it is captured append-only whatever path
-- it arrives by.
--
-- REUSES THE EXISTING MECHANISM — no new audit machinery. audit.ensure_row_trigger() is already the
-- canonical installer used by 43 tables; it is itself idempotent (DROP TRIGGER IF EXISTS + CREATE) and
-- no-ops when the table is absent. Writes land in audit.row_changes (WORM: op, row_pk, old_data,
-- new_data, changed_at, changed_by_user_id, changed_by_role).
--
-- REHEARSED: not required — this migration mutates NO existing rows. It installs a trigger only; the
-- verify-data-migrations-rehearsed gate applies to data-mutating migrations.

BEGIN;

DO $$
BEGIN
  IF to_regclass('lib.feature_flag_overrides') IS NULL THEN
    RAISE EXCEPTION 'lib.feature_flag_overrides missing — refusing to install a trigger blind';
  END IF;

  -- The per-entity/per-user overrides: this is the row that actually gates a poster.
  PERFORM audit.ensure_row_trigger('lib', 'feature_flag_overrides');

  -- The global defaults table too: default_enabled is the fallback when no override exists, so a
  -- change there moves posting behaviour for every entity that has not been explicitly overridden.
  IF to_regclass('lib.feature_flags') IS NOT NULL THEN
    PERFORM audit.ensure_row_trigger('lib', 'feature_flags');
  END IF;

  -- Fail closed: if the trigger is not present afterwards, this migration has not done its job and
  -- must not report success.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    WHERE t.tgrelid = 'lib.feature_flag_overrides'::regclass
      AND NOT t.tgisinternal
      AND t.tgname = 'trg_audit_feature_flag_overrides'
  ) THEN
    RAISE EXCEPTION 'GOV-FLAG-01: audit trigger not present on lib.feature_flag_overrides after install';
  END IF;
END $$;

COMMIT;

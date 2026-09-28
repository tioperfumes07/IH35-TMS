-- ROUND 155.18 JOB 1 — DRAFT, NOT APPLIED. Reviewed by the user before any run.
--
-- Adds an authorization-gated bypass to accounting.refuse_financial_row_delete() so an explicitly
-- authorized, session-scoped purge of ALREADY-VOIDED documents can proceed, while a non-voided row
-- stays unconditionally undeletable, no exceptions, from ANY role.
--
-- SUPERSEDES the first draft of this migration, which only refused DELETE for current_user =
-- 'ih35_app' -- meaning neondb_owner (which every coder seat already has Neon credentials for per
-- AGENTS.md H2) bypassed WORM entirely, unconditionally, with no auth-id gate and no voided_at
-- check at all. Owner-confirmed 2026-09-28: that gap is the actual fix this round wants, not a
-- footnote. This version drops the role check completely -- the trigger fires for every role that
-- can reach the table, no exemptions, no carve-outs, checked live by
-- scripts/verify-worm-applies-to-every-role.mjs.
--
-- Audit is NOT re-invented here: every one of the target tables already carries an unconditional
-- AFTER DELETE trigger (tg_audit_row_expenses, trg_audit_bills, tg_audit_row_factoring_advances,
-- trg_audit_bank_transactions, trg_audit_journal_entries, tg_audit_row_journal_entry_postings --
-- confirmed live via pg_trigger, 2026-09-28) that writes the FULL deleted row into
-- audit.row_changes.old_data (jsonb) regardless of role or how the delete happened. That trigger
-- fires AFTER this one on the same statement and same transaction, so a delete this bypass allows
-- is captured there before commit -- no new audit-writing code is added by this migration.
--
-- Idempotent: CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION accounting.refuse_financial_row_delete()
RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE
  v_auth_id text;
BEGIN
  -- No role exemption of any kind. Every role that reaches this trigger -- ih35_app,
  -- neondb_owner, any future role -- is subject to the same two checks below. The only way
  -- through is the AUTH-id-gated bypass, and even that never applies to a non-voided row.
  v_auth_id := NULLIF(current_setting('app.purge_auth_id', true), '');

  IF v_auth_id ~ '^AUTH-[0-9]+$'
     AND TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME = ANY (
       ARRAY[
         'accounting.expenses',
         'accounting.bills',
         'accounting.factoring_advances',
         'accounting.journal_entries',
         'accounting.journal_entry_postings',
         'banking.bank_transactions'
       ]
     )
  THEN
    -- to_jsonb(OLD) always has voided_at because every WORM-guarded table in this migration's
    -- scope carries that column (ACCT-F141 §1 added it repo-wide before WORM installed).
    IF (to_jsonb(OLD) ->> 'voided_at') IS NULL THEN
      RAISE EXCEPTION
        '%.% row % is NOT voided -- the purge bypass (auth %) never applies to a live document, no exceptions, regardless of role.',
        TG_TABLE_SCHEMA, TG_TABLE_NAME, COALESCE(to_jsonb(OLD) ->> 'id', to_jsonb(OLD) ->> 'uuid', '?'), v_auth_id
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN OLD;
  END IF;

  RAISE EXCEPTION
    '%.% is WORM: DELETE is refused for every role. Financial rows are never deleted -- void or reverse the document instead, or set app.purge_auth_id to an OPEN AUTH-NNN for an explicitly authorized voided-row purge.',
    TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END $fn$;

-- ACCT-F195 (board card CLS-FINANCIAL-TABLE-DELETABLE) — close the ONE genuine remaining WORM gap.
--
-- That card reads "ih35_app holds DELETE on 58 financial tables". I measured the class live on
-- 2026-08-08 before building anything, and the headline is already wrong in the safe direction:
--
--   · 37 of those tables ALREADY carry trg_worm_refuse_delete, which refuses the delete at runtime
--     regardless of the GRANT — every table that actually holds money (bills, invoices, payments,
--     journal entries and postings, all of banking, all of factoring, driver_finance's money tables).
--   · The remaining set is 21, not 58 — and MOST OF THOSE MUST STAY DELETABLE. QBO mirrors are
--     re-clonable by design and the re-sync path DELETES to re-import; queues are drained;
--     config/reference tables are owner-editable mappings, not financial records. A blanket REVOKE
--     is not a hardening, it is an outage.
--   · accounting.vendor_balances is a VIEW, so it can carry neither trigger nor delete.
--
-- WHAT IS LEFT, and it is exactly one table: driver_finance.settlement_payment_events. It is an
-- EVENT LOG — append-only by nature, the audit trail of how a settlement got paid — and it has
-- neither a WORM trigger nor a revoke. Verified on prod immediately before writing this:
-- relkind 'r', worm_triggers 0, DELETE granted to ih35_app, n_live_tup 0, n_tup_del 0.
--
-- ZERO RISK, WHICH IS WHY IT IS WORTH DOING NOW RATHER THAN AFTER IT FILLS: the table is empty and
-- has never had a row deleted, so hardening it cannot break an existing flow and cannot strand data.
-- The cheapest moment to make an event log immutable is before it has events.
--
-- PRODUCTION-SCOPED for the reason established by ACCT-F141 and reused by ACCT-F161 — not
-- relitigated here: CI connects AS ih35_app, so REVOKE DELETE would deny fixture teardown. The
-- control protects REAL evidence; a test database has fixtures, not evidence.
--
-- Additive and idempotent: DROP TRIGGER IF EXISTS before CREATE, REVOKE is a no-op when already
-- revoked, and the whole block is skipped if the table or the shared refuse-function is absent.

-- FORM MATTERS HERE, not just content. verify-worm-coverage-ratchet (wired at step 1629) reads
-- WORM coverage out of the migrations and recognises exactly two shapes: a literal
-- `CREATE TRIGGER ... BEFORE DELETE ON <schema>.<table>`, or this FOREACH-over-ARRAY loop. My first
-- draft used `t text := '<table>'` with EXECUTE format(), which is functionally identical and
-- COMPLETELY INVISIBLE to that ratchet — the protection would have existed with nothing watching it,
-- which is the exact failure ACCT-F152 built the ratchet to end. Written in the ARRAY form so the
-- existing guard picks it up and the coverage number moves.
DO $$
DECLARE
  t text;
BEGIN
  IF current_database() <> 'neondb' THEN
    RAISE NOTICE 'ACCT-F195: database is % (not production) — DELETE-blocking not installed; fixture teardown preserved', current_database();
    RETURN;
  END IF;

  IF to_regprocedure('accounting.refuse_financial_row_delete()') IS NULL THEN
    RAISE EXCEPTION 'ACCT-F195: accounting.refuse_financial_row_delete() is absent — ACCT-F141 (202612220000) must be applied first';
  END IF;

  FOREACH t IN ARRAY ARRAY[
    'driver_finance.settlement_payment_events'
  ] LOOP
    IF to_regclass(t) IS NULL THEN
      RAISE NOTICE 'ACCT-F195: % absent — skipped', t;
      CONTINUE;
    END IF;

    EXECUTE format('DROP TRIGGER IF EXISTS trg_worm_refuse_delete ON %s', t);
    EXECUTE format(
      'CREATE TRIGGER trg_worm_refuse_delete BEFORE DELETE ON %s FOR EACH ROW EXECUTE FUNCTION accounting.refuse_financial_row_delete()',
      t
    );
    EXECUTE format('REVOKE DELETE ON %s FROM ih35_app', t);

    RAISE NOTICE 'ACCT-F195: % is now WORM (trigger + REVOKE DELETE)', t;
  END LOOP;
END
$$;

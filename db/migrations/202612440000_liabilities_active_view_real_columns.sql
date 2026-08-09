-- ACCT-F272 / FAIL-DD2 — the liabilities view on prod is an EMPTY STUB, so every driver liability is
-- invisible on every surface that reads it.
--
-- MEASURED ON PROD br-fancy-credit-akjnd07a 2026-08-08:
--   pg_get_viewdef('views.liabilities_active_with_context') contains `NULL::uuid AS id`
--   SELECT count(*) FROM views.liabilities_active_with_context  ->  0     (not "0 for this driver" — 0 TOTAL)
--
-- Both /api/v1/liabilities/active (liabilities.routes.ts:86) and /liabilities/by-driver/:id (:110) read
-- that view. They have therefore returned an empty list for every driver, always.
--
-- WHY THE STUB WAS INSTALLED. Migration 0045 wraps the real view in a guard requiring
-- driver_liabilities.forfeiture_clause_signed_at AND .spawned_from_event_id, and falls back to a
-- NULL-typed stub when either is absent. Prod has NEITHER — nor forfeiture_clause_active or
-- acknowledgment_uuid. The guard did its job (the real view would have failed to compile); the fallback
-- then silently became permanent, and nothing ever reported that the surface was dead.
--
-- The card that surfaced this reads "$100 pending recovery invisible on both surfaces". The $100 row is
-- real and healthy — liability 7add2bd1, type loan, current_balance 100.00, driver row present,
-- deduction_schedule 100.00/period, requires_acknowledgment false. It satisfies every predicate of the
-- REAL view. It is invisible because the real view was never installed, not because of anything about
-- the row. The same is true of the $250 advance liability. This is not a one-row defect.
--
-- FIX: build the view from the columns prod ACTUALLY has. Verified present (Neon 2026-08-08):
--   id, operating_company_id, driver_id, type, source_description, original_amount, paid_to_date,
--   current_balance, requires_acknowledgment, origin, origin_id, reference_doc_id, status,
--   created_at, updated_at
-- NOT present: created_by_user_id (header of #5022 wrongly listed it — preDeploy failed on
--   `l.created_by_user_id` and blocked the entire main deploy pipeline past 02bab31).
--
-- WHAT IS DELIBERATELY NOT SYNTHESISED. The original view computed display_status = 'pending_ack' from
-- `requires_acknowledgment = true AND acknowledgment_uuid IS NULL`. acknowledgment_uuid DOES NOT EXIST
-- on prod, so acknowledgement state is not merely unknown — it is unrecorded. Emitting 'pending_ack'
-- from requires_acknowledgment alone would assert that nobody has acknowledged, which the database
-- cannot support. The columns are exposed as NULL and display_status omits that state rather than
-- inventing it. Same for forfeiture_clause_active / forfeiture_clause_signed_at / spawned_from_event_id /
-- created_by_user_id: surfaced as NULL so the shape the FE expects is intact and no value is fabricated.
--
-- held state likewise: deduction_schedule.held_until_period does not exist on prod either, so is_held is
-- NULL rather than false — "we do not track this" is not the same claim as "it is not held".
--
-- security_invoker = true preserved so RLS is enforced as the calling user, not the view owner.
--
-- WHY DROP + CREATE (not CREATE OR REPLACE): the stub view typed amount columns as unconstrained
-- `numeric`; the base table is `numeric(10,2)`. Postgres refuses CREATE OR REPLACE when a column's
-- type would change (`cannot change data type of view column "original_amount" from numeric to
-- numeric(10,2)` — measured on Render preDeploy 2026-08-09 after #5030 cleared the phantom-column
-- failure). Same pattern as 202608082248_restore_driver_settlement_with_debt_view. No dependents
-- on this view (pg_depend empty on prod). Migration still unapplied — in-place fix is legal.

DO $$
BEGIN
  IF to_regclass('driver_finance.driver_liabilities') IS NULL THEN
    RAISE NOTICE 'ACCT-F272: driver_finance.driver_liabilities absent — view not rebuilt';
    RETURN;
  END IF;

  EXECUTE 'DROP VIEW IF EXISTS views.liabilities_active_with_context';

  EXECUTE $VIEW$
    CREATE VIEW views.liabilities_active_with_context
    WITH (security_invoker = true) AS
    SELECT
      l.id,
      l.operating_company_id,
      l.driver_id,
      l.type,
      l.source_description,
      l.original_amount,
      l.paid_to_date,
      l.current_balance,
      l.requires_acknowledgment,
      NULL::uuid        AS acknowledgment_uuid,
      NULL::boolean     AS forfeiture_clause_active,
      NULL::timestamptz AS forfeiture_clause_signed_at,
      l.created_at,
      NULL::uuid        AS created_by_user_id,
      NULL::uuid        AS spawned_from_event_id,
      CONCAT_WS(' ', d.first_name, d.last_name) AS driver_full_name,
      d.id::text        AS driver_display_id,
      ds.amount_per_period AS scheduled_deduction,
      NULL::boolean     AS is_held,
      CASE
        WHEN l.current_balance > 0 THEN 'active'
        ELSE 'paid_off'
      END AS display_status
    FROM driver_finance.driver_liabilities l
    JOIN mdata.drivers d ON d.id = l.driver_id
    LEFT JOIN driver_finance.deduction_schedule ds ON ds.liability_id = l.id
    WHERE l.current_balance > 0
    ORDER BY l.created_at DESC
  $VIEW$;

  RAISE NOTICE 'ACCT-F272: views.liabilities_active_with_context rebuilt from real columns';
END
$$;

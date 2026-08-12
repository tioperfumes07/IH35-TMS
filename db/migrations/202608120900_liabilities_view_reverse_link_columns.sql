-- LIABILITY column-wave (WIRE-FIRST-SPRINT-LAW, WAVE-C) — the canonical read view drops the
-- reverse-link columns, so liability→source drill-through is architecturally impossible for
-- EVERY leaf, in EVERY module, today.
--
-- 202612440000_liabilities_active_view_real_columns.sql (ACCT-F272/FAIL-DD2) correctly fixed the
-- view being an EMPTY STUB by rebuilding it from the columns prod actually has — but that
-- migration's own header comment lists `origin, origin_id, reference_doc_id, status` as
-- "Verified present" on driver_finance.driver_liabilities (confirmed again here, see
-- db/migrations/0138_p8b_j_pr3_driver_finance_stack.sql:19-34) while its SELECT list never
-- includes them. The base table always had them; the view has just never surfaced them.
--
-- Read via `apps/backend/src/liabilities/liabilities.routes.ts` (SELECT * FROM
-- views.liabilities_active_with_context, three call sites), which is what feeds
-- LiabilityDetailDrawer.tsx / LiabilitiesTable.tsx on the frontend — so this one view fix is what
-- unblocks the reverse-drill for every leaf that already writes origin/origin_id correctly
-- (civil fines, internal fines) and every leaf fixed alongside this migration to start writing
-- them (cash advances).
--
-- Verified no external dependents before DROP+CREATE (pg_depend query against pg_rewrite,
-- 2026-08-12): zero rows, same as the prior migration's own note. security_invoker = true
-- preserved so RLS is enforced as the calling user, not the view owner — unchanged from before.

DO $$
BEGIN
  IF to_regclass('driver_finance.driver_liabilities') IS NULL THEN
    RAISE NOTICE 'LIABILITY-VIEW-REVERSE-LINK: driver_finance.driver_liabilities absent — view not rebuilt';
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
      -- LIABILITY column-wave: the reverse-drill columns this view previously dropped.
      l.origin,
      l.origin_id,
      l.reference_doc_id,
      l.status,
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

  RAISE NOTICE 'LIABILITY-VIEW-REVERSE-LINK: views.liabilities_active_with_context now carries origin/origin_id/reference_doc_id/status';
END
$$;

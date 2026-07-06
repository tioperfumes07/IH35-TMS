-- HOS-FANOUT + HOS-PRC2 (Jorge 2026-07-05 decisions).
--
-- views.drivers_with_hos_status (created 0048_p3_t11_5_1_dispatch_gates.sql) was gated on
-- to_regclass('safety.driver_hos_status') — a table that was NEVER created anywhere in
-- db/migrations. So in every environment (fresh CI + prod) the view has always fallen into the
-- ELSE stub: `... WHERE false`, i.e. it is ALWAYS EMPTY. That view is joined as a hard HOS gate by:
--   - dispatch/book-load.service.ts       (WF-HOS violation block on primary driver)
--   - dispatch/quick-assign.service.ts    (WF038_HOS_VIOLATION warning)
--   - dispatch/driver-optimizer.service.ts (scoring input is_in_violation / minutes_until_violation)
--   - dispatch/dispatch-refinements.service.ts (suggestion ranking)
-- Because the view is always empty, every one of those HOS checks has been silently inert.
--
-- Fix: point the view at the certified Samsara ELD verbatim snapshot (samsara.hos_snapshots,
-- populated by samsara-hos-clocks-pull.service.ts from GET /fleet/hos/clocks) instead of the
-- phantom table. This makes certified ELD the single source of truth for the HOS gate everywhere
-- it fans out (dispatch board == driver roster == certified ELD, per Jorge's HOS-PRC2 decision) and
-- resurrects the dispatch-side HOS gate as a live check instead of a no-op.
--
-- Column list + column TYPES are UNCHANGED from the existing (stub) view — this is a pure
-- CREATE OR REPLACE VIEW body swap, not a column-adding migration (no append-only-columns concern).
-- Idempotent (CREATE OR REPLACE), non-destructive, posts nothing, moves no money. Still a schema
-- change under db/migrations/ -> per CLAUDE.md SS1.3 this PR is NOT self-mergeable; needs Jorge's
-- explicit OK before merge even though it is non-financial.

BEGIN;

DO $$
BEGIN
  IF to_regclass('mdata.drivers') IS NOT NULL
     AND to_regclass('samsara.hos_snapshots') IS NOT NULL THEN
    EXECUTE $VIEW$
      CREATE OR REPLACE VIEW views.drivers_with_hos_status
      WITH (security_invoker = true) AS
      SELECT
        d.id,
        d.id::text AS display_id,
        CONCAT_WS(' ', d.first_name, d.last_name) AS full_name,
        d.operating_company_id,
        COALESCE(
          (h.driving_hours_remaining <= 0 OR h.on_duty_hours_remaining <= 0 OR h.cycle_hours_remaining <= 0),
          false
        ) AS is_in_violation,
        COALESCE(
          ROUND(LEAST(h.driving_hours_remaining, h.on_duty_hours_remaining, h.cycle_hours_remaining))::int,
          9999
        ) AS minutes_until_violation,
        h.polled_at AS last_status_at,
        CASE
          WHEN COALESCE(
                 (h.driving_hours_remaining <= 0 OR h.on_duty_hours_remaining <= 0 OR h.cycle_hours_remaining <= 0),
                 false
               ) THEN 'red'
          WHEN COALESCE(
                 ROUND(LEAST(h.driving_hours_remaining, h.on_duty_hours_remaining, h.cycle_hours_remaining))::int,
                 9999
               ) < 60 THEN 'yellow'
          ELSE 'green'
        END AS hos_badge_color
      FROM mdata.drivers d
      LEFT JOIN LATERAL (
        SELECT s.driving_hours_remaining, s.on_duty_hours_remaining, s.cycle_hours_remaining, s.polled_at
        FROM samsara.hos_snapshots s
        WHERE s.driver_uuid = d.id
        ORDER BY s.polled_at DESC
        LIMIT 1
      ) h ON true
      -- NOTE: the original (always-dead-branch) 0048 view compared d.status = 'active' (lowercase),
      -- which is NOT a valid mdata.driver_status enum label ('Active','Probation','Inactive',
      -- 'Terminated','OnLeave' — see 0008_mdata_init.sql). That never surfaced because the branch
      -- never ran (phantom safety.driver_hos_status table). Corrected to the real enum label here,
      -- matching the live pattern in dispatch/driver-optimizer.service.ts.
      WHERE d.status = 'Active'::mdata.driver_status
        AND d.deactivated_at IS NULL
    $VIEW$;
  ELSE
    -- Defensive fallback if either source table is somehow absent (e.g. partial migration replay):
    -- keep the same honest always-empty stub the view has always had, same column types.
    EXECUTE $EMPTY$
      CREATE OR REPLACE VIEW views.drivers_with_hos_status
      WITH (security_invoker = true) AS
      SELECT
        NULL::uuid AS id,
        NULL::text AS display_id,
        NULL::text AS full_name,
        NULL::uuid AS operating_company_id,
        false AS is_in_violation,
        9999::int AS minutes_until_violation,
        NULL::timestamptz AS last_status_at,
        NULL::text AS hos_badge_color
      WHERE false
    $EMPTY$;
  END IF;
END
$$;

COMMIT;

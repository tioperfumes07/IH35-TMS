-- ACCT-F9508-DISPATCH-LOAD-COMMODITY-CREATE-SILENT-NOOP (board id:
-- DISPATCH-LOAD-COMMODITY-CREATE-SILENT-NOOP-AND-BOARD-DISPLAY-DEAD)
--
-- ROOT CAUSE: PR #1342 (2026-06-22, "Block 7") claimed commodity/cargo_weight_lbs/
-- reefer_setpoint_temp_f "already exist on mdata.loads" and wired the Edit-wizard PATCH path +
-- GET detail SELECT to read/write them. That claim was false — information_schema has never had
-- these columns. Two independent incidents rediscovered the same false premise and band-aided it
-- by REMOVING the references rather than adding the migration: 2026-08-07 (GET detail 500,
-- mdata/loads.routes.ts) and 2026-08-27 (PATCH 500, dispatch/loads.routes.ts /
-- DISPATCH-LOAD-PATCH-COMMODITY-COLUMN-MISSING-500). Meanwhile the Book Load CREATE modal
-- (BookLoadModalV4.tsx) has always had live Commodity + Weight inputs, submits them in the POST
-- body, and the create schema accepts them — but book-load.service.ts's INSERT never read
-- input.commodity/input.weight_lbs (confirmed: zero references), so every load created since
-- has silently discarded whatever the user typed. The DispatchBoard/DispatchKanban Commodity
-- column and isReeferCommodity() badge have therefore rendered "—"/false for every load, always.
--
-- SCOPE: only `commodity` (text) and `cargo_weight_lbs` (integer) are added. The reefer-setpoint
-- concept in the old PATCH schema was ALSO a false premise under a different, never-real column
-- name (`reefer_setpoint_temp_f`) — the REAL reefer setpoint column is `reefer_temp_f`, which
-- already exists (render-v6 §B, migration 202606231400) and is already fully wired end-to-end
-- (SELECT + PATCH schema + update-load SCALAR_COLUMNS). Nothing to add there.
--
-- Additive, idempotent, nullable (zero backfill risk — every existing load simply reads NULL,
-- rendering "—" exactly as it does today, until re-saved or newly created).

BEGIN;

ALTER TABLE mdata.loads
  ADD COLUMN IF NOT EXISTS commodity text,
  ADD COLUMN IF NOT EXISTS cargo_weight_lbs integer;

DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'loads_cargo_weight_lbs_nonneg'
  ) THEN
    ALTER TABLE mdata.loads
      ADD CONSTRAINT loads_cargo_weight_lbs_nonneg
      CHECK (cargo_weight_lbs IS NULL OR cargo_weight_lbs >= 0) NOT VALID;
  END IF;
END $constraint$;

-- views.dispatch_load_with_driver_status (migration 0040) is an explicit-column view, not
-- SELECT * — it does NOT pick up new base-table columns automatically. Deliberately NOT widening
-- it here: the established precedent (trip_type / load_trailer_equipment_id / dispatch_flag_color_id
-- / the 4 miles_* columns, all in dispatch/loads.routes.ts) is that a mdata.loads-only column is
-- read via the already-joined `ml` alias (`LEFT JOIN mdata.loads ml ON ml.id = l.id`) in both the
-- list and detail queries, not by growing this shared view unscoped for every other consumer.
-- Application code follows that same pattern for commodity/cargo_weight_lbs (see PR body).

COMMIT;

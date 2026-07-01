-- 202606300120_load_cancellations_per_entity_fk.sql
-- [HOLD-FOR-JORGE — TIER 1] Block 10 — Cleanup-LoadCancellations-FK.
-- Migrate dispatch.load_cancellations off the LEGACY GLOBAL cancel catalog onto the per-entity one.
-- Migration on an existing FK / existing tables = PROTECTED. BUILD-AND-HOLD: never self-merge, never label.
--
-- WHY (GUARD-verified 2026-06-30):
--   catalogs.cancellation_reasons      = LEGACY GLOBAL load-cancel catalog (9 rows, NO operating_company_id).
--                                        dispatch.load_cancellations.reason_code FKs to THIS table today —
--                                        an entity-independence violation (a TRANSP cancel and a USMCA cancel
--                                        resolve against the same global row).
--   catalogs.load_cancellation_reasons = MODERN per-entity load-cancel catalog (migration 0035; 12 codes/entity,
--                                        operating_company_id, RLS enabled). This is the go-forward home.
--   catalogs.void_cancel_reasons       = per-entity FINANCIAL void catalog (#1687) — OUT OF SCOPE here.
--
-- WHAT THIS MIGRATION DOES (deterministic, additive, non-breaking, reversible):
--   1. Adds the two per-reason behavioral columns the legacy global catalog carries
--      (billable_to_customer_default, requires_owner_approval) to the per-entity catalog, so the per-entity
--      catalog can fully carry the legacy semantics (additive, DEFAULT false — existing rows unaffected).
--   2. Seeds the 9 legacy GLOBAL reason codes VERBATIM per entity into catalogs.load_cancellation_reasons,
--      is_active=false — they are HISTORICAL ANCHORS for existing cancellations only, hidden from active
--      dropdowns, so there is NO list bloat and NO semantic drift (WEATHER does not appear alongside
--      FORCE_WEATHER in any active list). Verbatim same-code seed => the backfill is an EXACT, zero-guess,
--      zero-loss, same-entity join (no lossy semantic collapse of a real cancellation's recorded reason).
--   3. Adds an ADDITIVE per-entity FK dispatch.load_cancellations.reason_code_id -> the per-entity catalog,
--      and backfills it by EXACT same-code + SAME-ENTITY match (never assigns a TRANSP load a TRK reason).
--   4. KEEPS the legacy reason_code text column (history / audit trail) AND the legacy global FK + legacy
--      table intact.
--
-- WHAT THIS MIGRATION DELIBERATELY DEFERS (see docs/dispatch/BLOCK-10-load-cancellations-fk-mapping.md):
--   The legacy table's ARCHIVE/rename + dropping its FK is DEFERRED because 5 LIVE backend consumers still
--   READ catalogs.cancellation_reasons (the cancel-load write path — which needs billable_default +
--   requires_owner_approval — plus the reason dropdown, listCancellations, and 2 analytics reports). Making
--   the legacy table "unreferenced" therefore requires repointing those live, money-/control-adjacent read
--   paths AND a go-forward-reason-list product decision (keep the legacy 9 vs consolidate onto the modern 12).
--   The spec's own LANE LOCK restricts this block to "the new migration + the mapping doc", and §1.7 forbids
--   self-authorizing that scope. This migration lays the exact, reversible foundation (per-entity FK + same-
--   entity backfill) that makes that follow-up a clean flip. Core acceptance met: load_cancellations now
--   REFERENCES the per-entity catalog with same-entity backfill; history preserved.
--
-- No GL/posting impact. No flag flipped. Idempotent + re-run-safe. Reversible: see footer.

BEGIN;

-- 1. Additive behavioral columns on the per-entity catalog (mirror the legacy global catalog's semantics).
ALTER TABLE catalogs.load_cancellation_reasons
  ADD COLUMN IF NOT EXISTS billable_to_customer_default boolean NOT NULL DEFAULT false;
ALTER TABLE catalogs.load_cancellation_reasons
  ADD COLUMN IF NOT EXISTS requires_owner_approval boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN catalogs.load_cancellation_reasons.billable_to_customer_default IS
  'Default for dispatch.load_cancellations.billable_to_customer when this reason is chosen (imported from the legacy global catalogs.cancellation_reasons, block 10).';
COMMENT ON COLUMN catalogs.load_cancellation_reasons.requires_owner_approval IS
  'When true, a non-Owner cancel with this reason is held pending Owner approval (imported from the legacy global catalogs.cancellation_reasons, block 10).';

-- 2. Seed the 9 legacy GLOBAL reasons VERBATIM per entity, is_active=false (historical/backfill anchors only).
--    catalogs.load_cancellation_reasons has RLS ENABLED but NOT FORCED (migration 0035) — the migration runner
--    (table owner) is not subject to the policy, so the seed inserts cleanly on a fresh DB; ON CONFLICT keeps
--    re-runs idempotent. A fresh CI DB (no companies / no Owner) yields 0 rows -> clean no-op.
WITH owner_user AS (
  SELECT id FROM identity.users WHERE role = 'Owner' ORDER BY created_at LIMIT 1
),
legacy(reason_code, display_name, category, billable_default, owner_approval, sort_order) AS (
  VALUES
    ('CUSTOMER_CANCELLED',  'Customer Cancelled',  'customer_initiated', true,  false, 910),
    ('DRIVER_ISSUE',        'Driver Issue',        'carrier_initiated',  false, true,  920),
    ('EQUIPMENT_ISSUE',     'Equipment Issue',     'carrier_initiated',  false, false, 930),
    ('WEATHER',             'Weather',             'force_majeure',      false, false, 940),
    ('NO_PICKUP',           'No Pickup Available', 'customer_initiated', false, false, 950),
    ('RATE_DISPUTE',        'Rate Dispute',        'carrier_initiated',  false, true,  960),
    ('CUSTOMER_BANKRUPTCY', 'Customer Bankruptcy', 'customer_initiated', false, true,  970),
    ('TRUCK_BREAKDOWN',     'Truck Breakdown',     'carrier_initiated',  false, false, 980),
    ('DRIVER_WALKOFF',      'Driver Walkoff',      'carrier_initiated',  false, true,  990)
)
INSERT INTO catalogs.load_cancellation_reasons
  (operating_company_id, reason_code, display_name, category, is_active, sort_order, description,
   billable_to_customer_default, requires_owner_approval, created_by_user_id)
SELECT
  c.id,
  l.reason_code,
  l.display_name,
  l.category::catalogs.cancellation_category_enum,
  false,
  l.sort_order,
  'Imported from legacy global catalogs.cancellation_reasons (block 10 cleanup); retained as a per-entity historical anchor for existing load cancellations. Inactive by default — not shown in active cancel dropdowns.',
  l.billable_default,
  l.owner_approval,
  o.id
FROM org.companies c
CROSS JOIN legacy l
CROSS JOIN owner_user o
WHERE c.deactivated_at IS NULL
ON CONFLICT (operating_company_id, reason_code) DO NOTHING;

-- 3. Additive per-entity reason FK on dispatch.load_cancellations. Legacy text reason_code column KEPT.
ALTER TABLE dispatch.load_cancellations
  ADD COLUMN IF NOT EXISTS reason_code_id uuid REFERENCES catalogs.load_cancellation_reasons(id);
CREATE INDEX IF NOT EXISTS idx_load_cancellations_reason_code_id
  ON dispatch.load_cancellations (reason_code_id);

COMMENT ON COLUMN dispatch.load_cancellations.reason_code_id IS
  'Additive per-entity FK -> catalogs.load_cancellation_reasons(id) (block 10). Same-entity backfilled from the legacy reason_code text. The legacy global FK (reason_code -> catalogs.cancellation_reasons) is retained until the live read paths are repointed (deferred; see docs/dispatch/BLOCK-10-load-cancellations-fk-mapping.md).';

-- 4. Backfill reason_code_id via EXACT same-code + SAME-ENTITY match (never cross-entity). 0 rows on a fresh DB.
UPDATE dispatch.load_cancellations lc
SET reason_code_id = lcr.id
FROM catalogs.load_cancellation_reasons lcr
WHERE lcr.operating_company_id = lc.operating_company_id
  AND lcr.reason_code = lc.reason_code
  AND lc.reason_code_id IS NULL;

COMMIT;

-- ROLLBACK (manual; forward-only chain otherwise):
-- BEGIN;
--   DROP INDEX IF EXISTS dispatch.idx_load_cancellations_reason_code_id;
--   ALTER TABLE dispatch.load_cancellations DROP COLUMN IF EXISTS reason_code_id;
--   DELETE FROM catalogs.load_cancellation_reasons
--     WHERE is_active = false
--       AND reason_code IN ('CUSTOMER_CANCELLED','DRIVER_ISSUE','EQUIPMENT_ISSUE','WEATHER','NO_PICKUP',
--                           'RATE_DISPUTE','CUSTOMER_BANKRUPTCY','TRUCK_BREAKDOWN','DRIVER_WALKOFF');
--   ALTER TABLE catalogs.load_cancellation_reasons DROP COLUMN IF EXISTS requires_owner_approval;
--   ALTER TABLE catalogs.load_cancellation_reasons DROP COLUMN IF EXISTS billable_to_customer_default;
-- COMMIT;

-- 202606300030_void_cancel_reasons_catalog.sql
-- [HOLD-FOR-JORGE — TIER 1] Task #24 — dedicated PER-ENTITY financial void/cancel reason catalog.
-- GUARD revised dispatch v2 (Jorge-ruled 2026-06-30): the house pattern is per-domain, per-entity reason
-- catalogs. Build a NEW catalogs.void_cancel_reasons modeled column-for-column / policy-for-policy on
-- catalogs.load_cancellation_reasons (migration 0035). NEVER self-merge — catalogs.* + a PROTECTED ALTER
-- on governance.void_cancel_requests (§1.4 / hold-merge-gate).
--
-- WHY A DEDICATED TABLE (not extending catalogs.cancellation_reasons): that legacy GLOBAL table holds
-- LOAD-operational reasons (WEATHER, TRUCK_BREAKDOWN, DRIVER_WALKOFF, NO_PICKUP) — why a *load* is
-- cancelled, NOT why a *financial transaction* is voided. Merging financial-void reasons in would pollute
-- the dispatch load-cancel dropdown with "Wrong Amount" and the invoice-void dropdown with "Weather"
-- (semantic mismatch, GUARD-verified on prod 2026-06-30). Load cancellations stay on the per-entity
-- catalogs.load_cancellation_reasons (36 rows); this catalog serves the FINANCIAL void/cancel surfaces
-- (invoices, bills, payments, journal entries, settlements, AND work-order voids).
--
-- ENTITY-INDEPENDENCE: operating_company_id NOT NULL + RLS ENABLED & FORCED. RLS replicates 0035 exactly
-- (is_lucia_bypass / org.user_company_access / identity.current_user_role — NO current_setting()::uuid GUC
-- cast, so the empty-string-uuid crash class does not apply) PLUS GUARD hardening: INSERT/UPDATE WITH CHECK
-- also scopes operating_company_id to the writer's accessible companies, so an admin of one entity cannot
-- write a reason into another. void-not-delete via is_active / deactivated_at (NO DELETE policy).
--
-- SEED runs BEFORE enabling RLS so the FORCE policy can never deny the migration's own seed insert
-- (the table is brand new — nothing to protect yet). Per entity, system_seeded=true; 'other' requires a note.
-- Owner extends per entity via the Lists "Cancellation Reasons" profile.
--
-- No posting/GL math. No flag flipped. Idempotent. CREATE on a NEW table = neutral; the governance ALTER
-- is the PROTECTED bit. Reversible: see footer.

BEGIN;

-- 1. The per-entity financial void/cancel reason catalog (modeled on catalogs.load_cancellation_reasons).
CREATE TABLE IF NOT EXISTS catalogs.void_cancel_reasons (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  reason_code          text NOT NULL,
  reason_label         text NOT NULL,
  requires_note        boolean NOT NULL DEFAULT false,   -- 'other' forces a free-text note
  is_active            boolean NOT NULL DEFAULT true,
  sort_order           integer NOT NULL DEFAULT 100,
  system_seeded        boolean NOT NULL DEFAULT true,    -- shipped default (owner may deactivate, not delete)
  deactivated_at       timestamptz,                      -- void-not-delete
  created_by_user_id   uuid NOT NULL REFERENCES identity.users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operating_company_id, reason_code)
);

CREATE INDEX IF NOT EXISTS idx_void_cancel_reasons_company_active
  ON catalogs.void_cancel_reasons (operating_company_id, is_active, sort_order);

-- 2. SEED per entity BEFORE enabling RLS (new table; FORCE policy would otherwise deny the seed insert).
--    CROSS JOIN org.companies x the 6 reasons x the first Owner user. Fresh CI DB (no companies / no Owner)
--    -> 0 rows -> clean no-op. 'other' requires_note=true.
WITH owner_user AS (
  SELECT id FROM identity.users WHERE role = 'Owner' ORDER BY created_at LIMIT 1
),
seed(reason_code, reason_label, requires_note, sort_order) AS (
  VALUES
    ('duplicate',        'Duplicate',        false, 10),
    ('error',            'Error',            false, 20),
    ('wrong_amount',     'Wrong Amount',     false, 30),
    ('customer_dispute', 'Customer Dispute', false, 40),
    ('cancelled_load',   'Cancelled Load',   false, 50),
    ('other',            'Other',            true,  90)
)
INSERT INTO catalogs.void_cancel_reasons
  (operating_company_id, reason_code, reason_label, requires_note, sort_order, system_seeded, created_by_user_id)
SELECT c.id, s.reason_code, s.reason_label, s.requires_note, s.sort_order, true, o.id
FROM org.companies c
CROSS JOIN seed s
CROSS JOIN owner_user o
WHERE c.deactivated_at IS NULL
ON CONFLICT (operating_company_id, reason_code) DO NOTHING;

-- 3. RLS: ENABLE + FORCE, policies replicate 0035 + GUARD opco-scope hardening on write.
ALTER TABLE catalogs.void_cancel_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogs.void_cancel_reasons FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS void_cancel_reasons_select ON catalogs.void_cancel_reasons;
CREATE POLICY void_cancel_reasons_select ON catalogs.void_cancel_reasons
  FOR SELECT TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id IN (
      SELECT company_id FROM org.user_company_access
      WHERE user_id = identity.current_user_id() AND deactivated_at IS NULL
    )
  );

DROP POLICY IF EXISTS void_cancel_reasons_insert ON catalogs.void_cancel_reasons;
CREATE POLICY void_cancel_reasons_insert ON catalogs.void_cancel_reasons
  FOR INSERT TO ih35_app
  WITH CHECK (
    identity.is_lucia_bypass()
    OR (
      identity.current_user_role() = ANY (
        ARRAY['Owner'::identity.role_enum, 'Administrator'::identity.role_enum, 'Manager'::identity.role_enum]
      )
      AND operating_company_id IN (
        SELECT company_id FROM org.user_company_access
        WHERE user_id = identity.current_user_id() AND deactivated_at IS NULL
      )
    )
  );

DROP POLICY IF EXISTS void_cancel_reasons_update ON catalogs.void_cancel_reasons;
CREATE POLICY void_cancel_reasons_update ON catalogs.void_cancel_reasons
  FOR UPDATE TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR (
      identity.current_user_role() = ANY (
        ARRAY['Owner'::identity.role_enum, 'Administrator'::identity.role_enum, 'Manager'::identity.role_enum]
      )
      AND operating_company_id IN (
        SELECT company_id FROM org.user_company_access
        WHERE user_id = identity.current_user_id() AND deactivated_at IS NULL
      )
    )
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR (
      identity.current_user_role() = ANY (
        ARRAY['Owner'::identity.role_enum, 'Administrator'::identity.role_enum, 'Manager'::identity.role_enum]
      )
      AND operating_company_id IN (
        SELECT company_id FROM org.user_company_access
        WHERE user_id = identity.current_user_id() AND deactivated_at IS NULL
      )
    )
  );
-- NO DELETE policy: void-not-delete (deactivate via is_active / deactivated_at).

GRANT USAGE ON SCHEMA catalogs TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON catalogs.void_cancel_reasons TO ih35_app;

DROP TRIGGER IF EXISTS trg_void_cancel_reasons_updated_at ON catalogs.void_cancel_reasons;
CREATE TRIGGER trg_void_cancel_reasons_updated_at
  BEFORE UPDATE ON catalogs.void_cancel_reasons
  FOR EACH ROW EXECUTE FUNCTION mdata.set_updated_at();

COMMENT ON TABLE catalogs.void_cancel_reasons IS
  'Task #24 per-entity FINANCIAL void/cancel reason catalog (modeled on catalogs.load_cancellation_reasons). Used by invoices, bills, payments, journal entries, settlements, and work-order voids. Load cancellations use catalogs.load_cancellation_reasons (separate operational domain). Owner-extensible via the Lists module.';

-- 4. ADDITIVE link from the governance register to this catalog. Existing free-text `reason` KEPT (history).
ALTER TABLE governance.void_cancel_requests
  ADD COLUMN IF NOT EXISTS reason_code_id uuid REFERENCES catalogs.void_cancel_reasons(id);
ALTER TABLE governance.void_cancel_requests
  ADD COLUMN IF NOT EXISTS note_text text;
CREATE INDEX IF NOT EXISTS idx_void_cancel_requests_reason_code
  ON governance.void_cancel_requests (reason_code_id);

COMMENT ON COLUMN governance.void_cancel_requests.reason_code_id IS
  'FK -> catalogs.void_cancel_reasons(id): controlled reason chosen from the per-entity financial void/cancel catalog (Task #24). App enforces note_text present when the reason has requires_note=true. Legacy free-text `reason` kept for history.';

COMMIT;

-- ROLLBACK (manual; forward-only chain otherwise):
-- BEGIN;
--   ALTER TABLE governance.void_cancel_requests DROP COLUMN IF EXISTS note_text;
--   ALTER TABLE governance.void_cancel_requests DROP COLUMN IF EXISTS reason_code_id;
--   DROP TABLE IF EXISTS catalogs.void_cancel_reasons;
-- COMMIT;

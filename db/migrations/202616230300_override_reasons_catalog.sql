-- 202616230300_override_reasons_catalog.sql
-- CC-3 · LEAD 443.294 (owner 10-23 8:52 PM): "a catalog … of reasons, correctly wired to the entire app, so i can use in
-- factoring, in expense, in load wizard etc. i dont want to be typing anything. for the owner and accountant it is just
-- an override button. click confirm etc. for other employees, reason drop down filter list."
--
-- ONE per-entity override reason catalog, modeled column-for-column / policy-for-policy on catalogs.void_cancel_reasons
-- (202606300030): operating_company_id NOT NULL, RLS ENABLED + FORCED (lucia bypass / org.user_company_access; writes
-- Owner/Administrator/Manager scoped to their companies), void-not-delete (is_active / deactivated_at, NO DELETE policy).
--   contexts[]  where a reason may be used (CHECK: factoring, expense, load_wizard, settlement, banking, invoice, bill,
--               dispatch, safety, maintenance) — the button filters the dropdown to its context.
--   role_only   owner_override / accountant_override: what the engine stores when an Owner / Accountant confirms with
--               no reason. Never offered in the dropdown; a row exists so every stored code resolves to this catalog.
-- SEED (USMCA, by company code — no hardcoded uuid): ONLY reasons already in use on prod (443.294 "no invented reasons"):
--   owner_approved / already_sent — accounting.factoring_purchases.docs_override_reason ("OWNER APPROVED" ×16, "ALREADY SENT" ×1)
--   salaried_driver_owner_ruling / signed_settlement_rate — mdata.loads.driver_pay_rate_override_reason ("Salaried (owner
--     ruling) …" ×4, "Signed settlement NNNN: driver paid $0.45/mi" ×n)
--   driver_request / breakdown / hos_reset / customer_change — the dispatch driver-reassign codes (AssignDriverDropdown
--     REASSIGN_REASON_CODES); its free-text 'other' is deliberately NOT carried (nothing to type).
-- Seed runs with the seed-only lucia bypass so a re-run under FORCE RLS still lands. Idempotent (ON CONFLICT DO NOTHING).
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS catalogs.override_reasons (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  reason_code          text NOT NULL,
  label_en             text NOT NULL,
  label_es             text NOT NULL,
  contexts             text[] NOT NULL,
  role_only            boolean NOT NULL DEFAULT false,
  is_active            boolean NOT NULL DEFAULT true,
  sort_order           integer NOT NULL DEFAULT 100,
  system_seeded        boolean NOT NULL DEFAULT true,
  deactivated_at       timestamptz,
  created_by_user_id   uuid NOT NULL REFERENCES identity.users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operating_company_id, reason_code),
  CONSTRAINT override_reasons_contexts_known CHECK (
    cardinality(contexts) > 0
    AND contexts <@ ARRAY['factoring','expense','load_wizard','settlement','banking','invoice','bill','dispatch','safety','maintenance']::text[]
  )
);

CREATE INDEX IF NOT EXISTS idx_override_reasons_company_active
  ON catalogs.override_reasons (operating_company_id, is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_override_reasons_contexts
  ON catalogs.override_reasons USING gin (contexts);

SET LOCAL app.bypass_rls = 'lucia';

WITH owner_user AS (
  SELECT id FROM identity.users WHERE role = 'Owner' ORDER BY created_at LIMIT 1
),
seed(reason_code, label_en, label_es, contexts, role_only, sort_order) AS (
  VALUES
    ('owner_override',              'Owner override',                     'Autorización del dueño',
       ARRAY['factoring','expense','load_wizard','settlement','banking','invoice','bill','dispatch','safety','maintenance'], true, 1),
    ('accountant_override',         'Accountant override',                'Autorización del contador',
       ARRAY['factoring','expense','load_wizard','settlement','banking','invoice','bill','dispatch','safety','maintenance'], true, 2),
    ('owner_approved',              'Owner approved',                     'Aprobado por el dueño',
       ARRAY['factoring','expense','load_wizard','settlement','banking','invoice','bill','dispatch','safety','maintenance'], false, 10),
    ('already_sent',                'Already sent',                       'Ya enviado',
       ARRAY['factoring'], false, 20),
    ('salaried_driver_owner_ruling','Salaried driver (owner ruling)',     'Chofer asalariado (decisión del dueño)',
       ARRAY['load_wizard','settlement'], false, 30),
    ('signed_settlement_rate',      'Rate from the signed settlement',    'Tarifa del settlement firmado',
       ARRAY['load_wizard','settlement'], false, 40),
    ('driver_request',              'Driver request',                     'Solicitud del chofer',
       ARRAY['dispatch'], false, 50),
    ('breakdown',                   'Breakdown / equipment',              'Falla / equipo',
       ARRAY['dispatch'], false, 60),
    ('hos_reset',                   'HOS / reset',                        'Horas de servicio / reinicio',
       ARRAY['dispatch'], false, 70),
    ('customer_change',             'Customer / shipper change',          'Cambio del cliente / embarcador',
       ARRAY['dispatch'], false, 80)
)
INSERT INTO catalogs.override_reasons
  (operating_company_id, reason_code, label_en, label_es, contexts, role_only, sort_order, system_seeded, created_by_user_id)
SELECT c.id, s.reason_code, s.label_en, s.label_es, s.contexts, s.role_only, s.sort_order, true, o.id
FROM org.companies c
CROSS JOIN seed s
CROSS JOIN owner_user o
WHERE c.code = 'USMCA' AND c.deactivated_at IS NULL
ON CONFLICT (operating_company_id, reason_code) DO NOTHING;

SET LOCAL app.bypass_rls = '';

ALTER TABLE catalogs.override_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalogs.override_reasons FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS override_reasons_select ON catalogs.override_reasons;
CREATE POLICY override_reasons_select ON catalogs.override_reasons
  FOR SELECT TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id IN (
      SELECT company_id FROM org.user_company_access
      WHERE user_id = identity.current_user_id() AND deactivated_at IS NULL
    )
  );

DROP POLICY IF EXISTS override_reasons_insert ON catalogs.override_reasons;
CREATE POLICY override_reasons_insert ON catalogs.override_reasons
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

DROP POLICY IF EXISTS override_reasons_update ON catalogs.override_reasons;
CREATE POLICY override_reasons_update ON catalogs.override_reasons
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
GRANT SELECT, INSERT, UPDATE ON catalogs.override_reasons TO ih35_app;

DROP TRIGGER IF EXISTS trg_override_reasons_updated_at ON catalogs.override_reasons;
CREATE TRIGGER trg_override_reasons_updated_at
  BEFORE UPDATE ON catalogs.override_reasons
  FOR EACH ROW EXECUTE FUNCTION mdata.set_updated_at();

DROP TRIGGER IF EXISTS trg_audit_override_reasons ON catalogs.override_reasons;
CREATE TRIGGER trg_audit_override_reasons
  AFTER INSERT OR UPDATE OR DELETE ON catalogs.override_reasons
  FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

COMMENT ON TABLE catalogs.override_reasons IS
  'LEAD 443.294: the ONE per-entity override reason catalog. Owner/Accountant confirm with no reason (stored as the role_only owner_override / accountant_override row); everyone else picks a reason filtered to the context. No free-text override reasons.';

COMMIT;

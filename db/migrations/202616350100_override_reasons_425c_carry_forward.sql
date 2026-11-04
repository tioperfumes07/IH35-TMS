-- 202616350100_override_reasons_425c_carry_forward.sql
-- CC-3 · row 28 (LEAD 443.294): the Form 425C carry-forward override joins the ONE override catalog. The route used to
-- demand a typed 30+ character sentence (projection_override_reason); it now picks a catalogs.override_reasons code
-- (Owner / Accountant just confirm) validated by recordOverride, context '425c_carry_forward'.
--   1. widen the contexts CHECK with '425c_carry_forward' (idempotent: drop + re-add the same-named constraint);
--   2. let the role_only rows (owner_override / accountant_override — what an Owner / Accountant confirm stores) and the
--      generic owner_approved row work in the new context (idempotent: only rows missing the context are touched);
--   3. seed the 425C-only reasons for USMCA (by company code — no hardcoded uuid). Idempotent (ON CONFLICT DO NOTHING).
-- Seed runs with the seed-only lucia bypass so a re-run under FORCE RLS still lands.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE catalogs.override_reasons DROP CONSTRAINT IF EXISTS override_reasons_contexts_known;
ALTER TABLE catalogs.override_reasons ADD CONSTRAINT override_reasons_contexts_known CHECK (
  cardinality(contexts) > 0
  AND contexts <@ ARRAY['factoring','expense','load_wizard','settlement','banking','invoice','bill','dispatch','safety','maintenance','425c_carry_forward']::text[]
);

SET LOCAL app.bypass_rls = 'lucia';

UPDATE catalogs.override_reasons
   SET contexts = array_append(contexts, '425c_carry_forward')
 WHERE reason_code IN ('owner_override', 'accountant_override', 'owner_approved')
   AND NOT ('425c_carry_forward' = ANY (contexts));

WITH owner_user AS (
  SELECT id FROM identity.users WHERE role = 'Owner' ORDER BY created_at LIMIT 1
),
seed(reason_code, label_en, label_es, contexts, role_only, sort_order) AS (
  VALUES
    ('carry_forward_actuals_update',  'Projection updated from current actuals',     'Proyección actualizada con cifras reales',
       ARRAY['425c_carry_forward'], false, 110),
    ('carry_forward_bookings_change', 'Bookings / load volume changed',              'Cambió el volumen de cargas / reservaciones',
       ARRAY['425c_carry_forward'], false, 120),
    ('carry_forward_cost_change',     'Fuel / operating cost changed',               'Cambió el costo de combustible / operación',
       ARRAY['425c_carry_forward'], false, 130),
    ('carry_forward_payment_timing',  'Customer / factor payment timing changed',    'Cambió el tiempo de pago del cliente / factor',
       ARRAY['425c_carry_forward'], false, 140),
    ('carry_forward_trustee_request', 'Trustee / court request',                     'Solicitud del fideicomisario / corte',
       ARRAY['425c_carry_forward'], false, 150)
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

COMMIT;

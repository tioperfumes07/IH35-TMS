-- [HOLD-FOR-JORGE — TIER 1] ND-ESC-01 (draw-catalog half) — catalogs.escrow_types.may_draw_escrow
-- *** DO NOT RUN ON PROD via db:migrate. Owner Neon-applies then ledger-backfills. POSTS NOTHING. ***
-- Cap half already shipped (#3611, $2,500). This half: editable draw reasons with may_draw_escrow,
-- seeded abandonment + damage + safety fines. Escrow forfeit must cite a may_draw_escrow reason.
-- Cursor band 20260910xxxx. Idempotent.

BEGIN;

ALTER TABLE catalogs.escrow_types
  ADD COLUMN IF NOT EXISTS may_draw_escrow boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN catalogs.escrow_types.may_draw_escrow IS
  'ND-ESC-01: when true, this reason may be used to draw/forfeit driver escrow (requires signed contract).';

-- Seed draw reasons for every operating company (owner can rename/add via Lists).
INSERT INTO catalogs.escrow_types (
  operating_company_id, code, display_name, description, metadata, is_active, sort_order, may_draw_escrow
)
SELECT
  c.id,
  v.code,
  v.display_name,
  v.description,
  '{}'::jsonb,
  true,
  v.sort_order,
  true
FROM org.companies c
CROSS JOIN (
  VALUES
    ('ABANDONMENT', 'Abandonment', 'Load abandonment — escrow draw authorized when signed', 10),
    ('DAMAGE', 'Damage', 'Equipment/cargo damage — escrow draw authorized when signed', 20),
    ('SAFETY-FINE', 'Safety fine', 'Safety fine recovery — escrow draw authorized when signed', 30)
) AS v(code, display_name, description, sort_order)
WHERE NOT EXISTS (
  SELECT 1
  FROM catalogs.escrow_types t
  WHERE t.operating_company_id = c.id
    AND t.code = v.code
);

-- Backfill flag if rows were pre-created without the column default path.
UPDATE catalogs.escrow_types
   SET may_draw_escrow = true,
       updated_at = now()
 WHERE code IN ('ABANDONMENT', 'DAMAGE', 'SAFETY-FINE')
   AND may_draw_escrow IS DISTINCT FROM true;

COMMIT;

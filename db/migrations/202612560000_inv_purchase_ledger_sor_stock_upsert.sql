-- INV-PURCHASE-LEDGER-SOR-STOCK-UPSERT — owner-approved 2026-08-15
-- (docs/blocks/HOLD-INVENTORY-PURCHASE-HISTORY-SOR.md).
--
-- Adds append-only maintenance.parts_purchases (the real Purchase History source of record — the
-- old POST only INSERTed a mutable stock row with last-purchase-* snapshot fields, so no purchase
-- HISTORY ever existed, only a current-state snapshot). Adds a real unique identity on
-- parts_inventory(operating_company_id, part_number) so repeat purchases of the same part upsert
-- stock instead of fragmenting on-hand quantity across duplicate rows (verified live on prod
-- 2026-08-15: 0 duplicate (operating_company_id, part_number) pairs exist across 146 rows, so the
-- constraint applies cleanly with no dedupe step needed).
--
-- Also adds an additive parts_purchase_id latch key on accounting.parts_purchase_postings. That
-- table's ONLY unique index today is (operating_company_id, parts_inventory_id) WHERE is_active —
-- i.e. at most ONE active GL posting per STOCK ROW, ever. Once the stock-upsert fix above reuses
-- the same parts_inventory_id across repeat purchases of the same part, that legacy index would
-- silently cap real GL posting at the FIRST purchase of any given part forever (every later
-- purchase would read "already_posted" and skip). This migration re-keys the latch to the
-- immutable purchase EVENT instead of the mutable stock row so each real economic event still gets
-- its own posting opportunity. accounting.parts_purchase_postings does not exist on prod yet (its
-- creating migration, 202609030000_mnt_econ_01_parts_purchase_gl_hop.sql, is still HELD — see
-- db/migrations/.held-migrations.json) and PARTS_PURCHASE_GL_POSTING_ENABLED defaults OFF, so this
-- section is a no-op everywhere until the owner applies that held migration; it is written now so
-- the two migrations compose correctly whenever that happens, in either order.
--
-- CREATE-only / idempotent / no destructive change. No QBO write-back. No new GL math — the
-- existing flag-gated poster path (still OFF) is untouched except for its idempotency key.

BEGIN;

-- §1 — append-only purchase-event ledger (the real SoR; parts_inventory stays a mutable snapshot).
DO $$
BEGIN
  IF to_regclass('maintenance.parts_inventory') IS NULL OR to_regclass('org.companies') IS NULL THEN
    RAISE NOTICE 'INV-PURCHASE-LEDGER: prerequisites absent — skip §1';
    RETURN;
  END IF;

  CREATE TABLE IF NOT EXISTS maintenance.parts_purchases (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    operating_company_id    uuid NOT NULL,
    parts_inventory_id      uuid NOT NULL REFERENCES maintenance.parts_inventory(id),
    vendor_id               uuid REFERENCES mdata.vendors(id),
    vendor_invoice_number   text,
    purchase_amount_cents   bigint,
    qty_received            int NOT NULL CHECK (qty_received > 0),
    work_order_id           uuid REFERENCES maintenance.work_orders(id),
    purchased_at            timestamptz NOT NULL DEFAULT now(),
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by_user_id      uuid,
    voided_at               timestamptz,
    voided_by_user_id       uuid,
    void_reason             text
  );

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_parts_purchases_company') THEN
    ALTER TABLE maintenance.parts_purchases
      ADD CONSTRAINT fk_parts_purchases_company
      FOREIGN KEY (operating_company_id) REFERENCES org.companies(id);
  END IF;

  CREATE INDEX IF NOT EXISTS ix_parts_purchases_company_part
    ON maintenance.parts_purchases (operating_company_id, parts_inventory_id, purchased_at DESC);
  CREATE INDEX IF NOT EXISTS ix_parts_purchases_vendor
    ON maintenance.parts_purchases (vendor_id) WHERE vendor_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS ix_parts_purchases_wo
    ON maintenance.parts_purchases (work_order_id) WHERE work_order_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS ix_parts_purchases_active
    ON maintenance.parts_purchases (operating_company_id, purchased_at DESC) WHERE voided_at IS NULL;

  ALTER TABLE maintenance.parts_purchases ENABLE ROW LEVEL SECURITY;
  ALTER TABLE maintenance.parts_purchases FORCE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS parts_purchases_select ON maintenance.parts_purchases;
  DROP POLICY IF EXISTS parts_purchases_write  ON maintenance.parts_purchases;
  CREATE POLICY parts_purchases_select ON maintenance.parts_purchases FOR SELECT
    USING (identity.is_lucia_bypass()
           OR operating_company_id::text = current_setting('app.operating_company_id', true));
  CREATE POLICY parts_purchases_write ON maintenance.parts_purchases FOR ALL
    USING (identity.is_lucia_bypass()
           OR operating_company_id::text = current_setting('app.operating_company_id', true))
    WITH CHECK (identity.is_lucia_bypass()
           OR operating_company_id::text = current_setting('app.operating_company_id', true));

  GRANT SELECT, INSERT, UPDATE ON maintenance.parts_purchases TO ih35_app;
  REVOKE DELETE ON maintenance.parts_purchases FROM ih35_app;
END
$$;

-- §2 — real stock identity: a purchase upserts by (operating_company_id, part_number) instead of
-- fragmenting into a new row every time. Guarded off if any duplicate pair already exists (none do
-- on prod today, but a fresh-DB / other-branch state should never abort the whole migration).
DO $$
BEGIN
  IF to_regclass('maintenance.parts_inventory') IS NULL THEN
    RAISE NOTICE 'INV-PURCHASE-LEDGER: parts_inventory absent — skip §2';
    RETURN;
  END IF;
  -- to_regclass on an index name resolves via pg_class, unlike pg_constraint (a plain CREATE
  -- UNIQUE INDEX never rows into pg_constraint) — this is the correct existence check.
  IF to_regclass('maintenance.uq_parts_inventory_company_part_number') IS NOT NULL THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM (
      SELECT operating_company_id, part_number
      FROM maintenance.parts_inventory
      WHERE part_number IS NOT NULL AND btrim(part_number) <> ''
      GROUP BY operating_company_id, part_number
      HAVING count(*) > 1
    ) dupes
  ) THEN
    RAISE NOTICE 'INV-PURCHASE-LEDGER: duplicate (operating_company_id, part_number) rows exist — skip unique constraint (dedupe separately)';
    RETURN;
  END IF;
  DROP INDEX IF EXISTS maintenance.parts_inventory_part_number_idx;
  CREATE UNIQUE INDEX IF NOT EXISTS uq_parts_inventory_company_part_number
    ON maintenance.parts_inventory (operating_company_id, part_number)
    WHERE part_number IS NOT NULL AND btrim(part_number) <> '';
END
$$;

-- §3 — additive poster latch-key fix (see header). No-op everywhere until the HELD migration
-- 202609030000 is applied (table absent on prod today).
DO $$
BEGIN
  IF to_regclass('accounting.parts_purchase_postings') IS NULL
     OR to_regclass('maintenance.parts_purchases') IS NULL THEN
    RAISE NOTICE 'INV-PURCHASE-LEDGER: parts_purchase_postings or parts_purchases absent — skip §3';
    RETURN;
  END IF;

  ALTER TABLE accounting.parts_purchase_postings
    ADD COLUMN IF NOT EXISTS parts_purchase_id uuid REFERENCES maintenance.parts_purchases(id);

  DROP INDEX IF EXISTS accounting.uq_parts_purchase_postings_parts_active;
  CREATE UNIQUE INDEX IF NOT EXISTS uq_parts_purchase_postings_purchase_active
    ON accounting.parts_purchase_postings (operating_company_id, parts_purchase_id)
    WHERE is_active AND parts_purchase_id IS NOT NULL;
END
$$;

COMMIT;

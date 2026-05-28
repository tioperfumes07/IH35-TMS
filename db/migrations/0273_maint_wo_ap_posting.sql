BEGIN;

ALTER TABLE maintenance.work_orders
  ADD COLUMN IF NOT EXISTS ap_ps_category_qbo_id text,
  ADD COLUMN IF NOT EXISTS ap_ps_item_qbo_id text,
  ADD COLUMN IF NOT EXISTS ap_posting_asset_id uuid REFERENCES mdata.assets(id);

CREATE INDEX IF NOT EXISTS idx_maint_work_orders_ap_posting_asset
  ON maintenance.work_orders (operating_company_id, ap_posting_asset_id)
  WHERE ap_posting_asset_id IS NOT NULL;

COMMIT;

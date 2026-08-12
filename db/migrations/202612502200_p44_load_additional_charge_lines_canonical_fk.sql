BEGIN;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'additional_charges_company_id_id_key') THEN
    ALTER TABLE catalogs.additional_charges
      ADD CONSTRAINT additional_charges_company_id_id_key UNIQUE (operating_company_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'loads_company_id_id_key') THEN
    ALTER TABLE mdata.loads
      ADD CONSTRAINT loads_company_id_id_key UNIQUE (operating_company_id, id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS dispatch.load_charge_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  load_id UUID NOT NULL,
  line_kind TEXT NOT NULL CHECK (line_kind IN ('system', 'accessorial')),
  additional_charge_id UUID,
  charge_code TEXT NOT NULL,
  description TEXT,
  amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),
  sort_order INT NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by_user_id UUID NOT NULL REFERENCES identity.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT load_charge_lines_catalog_shape CHECK (
    (line_kind = 'accessorial' AND additional_charge_id IS NOT NULL)
    OR (line_kind = 'system' AND additional_charge_id IS NULL)
  ),
  CONSTRAINT load_charge_lines_additional_charge_same_company_fk
    FOREIGN KEY (operating_company_id, additional_charge_id)
    REFERENCES catalogs.additional_charges (operating_company_id, id),
  CONSTRAINT load_charge_lines_load_same_company_fk
    FOREIGN KEY (operating_company_id, load_id)
    REFERENCES mdata.loads (operating_company_id, id)
);

CREATE INDEX IF NOT EXISTS load_charge_lines_load_active_idx
  ON dispatch.load_charge_lines (operating_company_id, load_id, is_active, sort_order);

ALTER TABLE dispatch.load_charge_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch.load_charge_lines FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS load_charge_lines_scope ON dispatch.load_charge_lines;
CREATE POLICY load_charge_lines_scope ON dispatch.load_charge_lines
  FOR ALL TO ih35_app
  USING (operating_company_id IN (SELECT org.user_accessible_company_ids()))
  WITH CHECK (operating_company_id IN (SELECT org.user_accessible_company_ids()));

GRANT SELECT, INSERT, UPDATE ON dispatch.load_charge_lines TO ih35_app;

DROP TRIGGER IF EXISTS tg_audit_row_load_charge_lines ON dispatch.load_charge_lines;
CREATE TRIGGER tg_audit_row_load_charge_lines
  AFTER INSERT OR UPDATE OR DELETE ON dispatch.load_charge_lines
  FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row();

COMMIT;

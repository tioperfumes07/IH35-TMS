-- GAP-20 Recurring Bills — dedicated recurring_bill_templates with generation log
-- Role: ih35_app

BEGIN;

CREATE TABLE IF NOT EXISTS accounting.recurring_bill_templates (
  uuid              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id TEXT     NOT NULL,
  vendor_uuid       UUID        NOT NULL,
  template_name     TEXT        NOT NULL,
  amount            NUMERIC(12,2) NOT NULL,
  memo              TEXT,
  frequency         TEXT        NOT NULL
    CHECK (frequency IN ('weekly','biweekly','monthly','quarterly','annually')),
  day_of_month      INTEGER,
  day_of_week       INTEGER,
  next_generation_date DATE     NOT NULL,
  end_date          DATE,
  is_active         BOOLEAN     NOT NULL DEFAULT true,
  auto_post         BOOLEAN     NOT NULL DEFAULT false,
  line_items        JSONB       NOT NULL DEFAULT '[]'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS accounting.recurring_bill_generation_log (
  uuid              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_uuid     UUID        NOT NULL
    REFERENCES accounting.recurring_bill_templates(uuid),
  generated_bill_uuid UUID,
  generated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  status            TEXT        NOT NULL
    CHECK (status IN ('success','failed')),
  error_message     TEXT
);

CREATE INDEX IF NOT EXISTS idx_rb_active
  ON accounting.recurring_bill_templates (is_active, next_generation_date);

CREATE INDEX IF NOT EXISTS idx_rb_gen_log_template
  ON accounting.recurring_bill_generation_log (template_uuid, generated_at DESC);

-- RLS
ALTER TABLE accounting.recurring_bill_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.recurring_bill_generation_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rbt_tenant_scope ON accounting.recurring_bill_templates;
CREATE POLICY rbt_tenant_scope ON accounting.recurring_bill_templates
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id = current_setting('app.operating_company_id', true)
  );

DROP POLICY IF EXISTS rbgl_tenant_scope ON accounting.recurring_bill_generation_log;
CREATE POLICY rbgl_tenant_scope ON accounting.recurring_bill_generation_log
  FOR ALL TO ih35_app
  USING (
    identity.is_lucia_bypass()
    OR template_uuid IN (
      SELECT uuid FROM accounting.recurring_bill_templates
      WHERE operating_company_id = current_setting('app.operating_company_id', true)
    )
  );

-- Grants
GRANT USAGE ON SCHEMA accounting TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON accounting.recurring_bill_templates TO ih35_app;
GRANT SELECT, INSERT ON accounting.recurring_bill_generation_log TO ih35_app;

COMMIT;

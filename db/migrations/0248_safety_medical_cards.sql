BEGIN;

CREATE TABLE IF NOT EXISTS safety.medical_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id UUID NOT NULL REFERENCES org.companies(id),
  driver_id UUID NOT NULL,
  card_number TEXT NOT NULL,
  issued_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  notes TEXT NULL,
  voided_at TIMESTAMPTZ NULL,
  voided_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE safety.medical_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS medical_cards_tenant_scope ON safety.medical_cards;
CREATE POLICY medical_cards_tenant_scope
  ON safety.medical_cards
  FOR ALL TO ih35_app
  USING (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  )
  WITH CHECK (
    operating_company_id::text = current_setting('app.operating_company_id', true)
    OR current_setting('app.bypass_rls', true) = 'lucia'
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON safety.medical_cards TO ih35_app;

CREATE OR REPLACE FUNCTION safety.touch_medical_cards_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_touch_medical_cards_updated_at ON safety.medical_cards;
CREATE TRIGGER trg_touch_medical_cards_updated_at
BEFORE UPDATE ON safety.medical_cards
FOR EACH ROW
EXECUTE FUNCTION safety.touch_medical_cards_updated_at();

COMMIT;

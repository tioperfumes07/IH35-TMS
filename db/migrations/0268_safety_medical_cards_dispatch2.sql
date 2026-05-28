BEGIN;

CREATE INDEX IF NOT EXISTS idx_medical_cards_tenant_driver_active
  ON safety.medical_cards (operating_company_id, driver_id)
  WHERE voided_at IS NULL;

COMMIT;

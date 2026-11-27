-- SCENTSX B14 — FinCEN 105 (CMIR) declarations signed by Mexico cash payers on a Form 8300 case.
--
-- Owner 2026-11-27 07:10 CT: "if Mexico customer when filling out 8300 form, they must sign a document stating they declared the
-- money at US customs, that they filed fincen 105."
--
-- FinCEN Form 105 (Report of International Transportation of Currency or Monetary Instruments, 31 CFR 1010.340) is filed with
-- U.S. Customs and Border Protection by the person who carries more than $10,000 in currency or monetary instruments across the
-- border. ScentsX does not file it — the payer does. This table keeps the payer's SIGNED statement that they declared the money and
-- filed FinCEN 105 (and, when they give it, a copy of their 105), linked to the payer and the Form 8300 case. The service refuses to
-- mark a Mexico payer's Form 8300 filed until an active signed declaration is on that case.
--
-- Never deleted (no DELETE grant); a declaration entered by mistake is voided with a reason. Same ScentsX wall and owner/admin
-- RLS as the other compliance tables (202616920100).

BEGIN;

CREATE TABLE IF NOT EXISTS scentsx.cmir_declarations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id uuid NOT NULL REFERENCES org.companies(id),
  declaration_no text NOT NULL,
  payer_id uuid NOT NULL REFERENCES scentsx.cash_payers(id),
  case_id uuid NOT NULL REFERENCES scentsx.form_8300_cases(id),
  crossed_on date NOT NULL,
  port_of_entry text NOT NULL CHECK (length(btrim(port_of_entry)) > 0),
  amount_declared_cents bigint NOT NULL CHECK (amount_declared_cents > 0),
  currency text NOT NULL CHECK (currency IN ('USD', 'MXN')),
  signed_on date NOT NULL,
  signed_declaration_file_id uuid NOT NULL REFERENCES docs.files(id),
  fincen105_copy_file_id uuid REFERENCES docs.files(id),
  notes text,
  created_by uuid REFERENCES identity.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  voided_by uuid REFERENCES identity.users(id),
  void_reason text,
  CHECK (signed_on >= crossed_on),
  CHECK (voided_at IS NULL OR (void_reason IS NOT NULL AND voided_by IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_scentsx_cmir_declaration_no ON scentsx.cmir_declarations (operating_company_id, declaration_no);
CREATE INDEX IF NOT EXISTS idx_scentsx_cmir_case ON scentsx.cmir_declarations (case_id);
CREATE INDEX IF NOT EXISTS idx_scentsx_cmir_payer ON scentsx.cmir_declarations (payer_id);

-- The case and the payer on a declaration must agree (a declaration cannot be hung on another payer's case).
CREATE OR REPLACE FUNCTION scentsx.cmir_case_payer_match() RETURNS trigger
  LANGUAGE plpgsql SET search_path = pg_catalog
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM scentsx.form_8300_cases f WHERE f.id = NEW.case_id AND f.payer_id = NEW.payer_id) THEN
    RAISE EXCEPTION 'FinCEN 105 declaration payer does not match the Form 8300 case payer' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_cmir_case_payer_match ON scentsx.cmir_declarations;
CREATE TRIGGER trg_cmir_case_payer_match BEFORE INSERT OR UPDATE ON scentsx.cmir_declarations
  FOR EACH ROW EXECUTE FUNCTION scentsx.cmir_case_payer_match();

DROP TRIGGER IF EXISTS trg_cmir_declarations_scentsx_wall ON scentsx.cmir_declarations;
CREATE TRIGGER trg_cmir_declarations_scentsx_wall BEFORE INSERT OR UPDATE ON scentsx.cmir_declarations
  FOR EACH ROW EXECUTE FUNCTION scentsx.refuse_non_scentsx_compliance_row();

ALTER TABLE scentsx.cmir_declarations ENABLE ROW LEVEL SECURITY;
ALTER TABLE scentsx.cmir_declarations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cmir_declarations_entity_select ON scentsx.cmir_declarations;
DROP POLICY IF EXISTS cmir_declarations_entity_write ON scentsx.cmir_declarations;
CREATE POLICY cmir_declarations_entity_select ON scentsx.cmir_declarations FOR SELECT
  USING (identity.is_lucia_bypass() OR operating_company_id::text = current_setting('app.operating_company_id', true));
CREATE POLICY cmir_declarations_entity_write ON scentsx.cmir_declarations FOR ALL
  USING (identity.is_lucia_bypass() OR (operating_company_id::text = current_setting('app.operating_company_id', true)
         AND identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum, 'Administrator'::identity.role_enum])))
  WITH CHECK (identity.is_lucia_bypass() OR (operating_company_id::text = current_setting('app.operating_company_id', true)
         AND identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum, 'Administrator'::identity.role_enum])));
GRANT SELECT, INSERT, UPDATE ON scentsx.cmir_declarations TO ih35_app;

COMMIT;

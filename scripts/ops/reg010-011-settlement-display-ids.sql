-- REG-010/011 owner order 2026-09-10: one independent S-YYYY-NNNN identity everywhere.
-- Run as one transaction on tiny-field-89581227 / br-fancy-credit-akjnd07a only.
-- No settlement, load, posting, or source-document identity is created/replaced.
-- Existing audit.tg_audit_row records the old/new display IDs. Re-runs change zero rows.
BEGIN;
SET LOCAL app.bypass_rls = 'lucia';
SET LOCAL app.session_id = 'GPT-REG-010-011-2026-09-10';
SET LOCAL app.user_role = 'GPT-maintenance';
SET LOCAL app.operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80';
DO $$
DECLARE
  settlement record;
  allocated text;
  before_row jsonb;
  after_row jsonb;
BEGIN
  FOR settlement IN
    SELECT id, period_start, display_id
    FROM driver_finance.driver_settlements
    WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'
      AND is_sample_data IS NOT TRUE
      AND display_id ~ '^S-[0-9]+$'
    ORDER BY period_start, created_at, id
    FOR UPDATE
  LOOP
    SELECT to_jsonb(s) - 'display_id' - 'updated_at' INTO before_row
    FROM driver_finance.driver_settlements s WHERE id = settlement.id;
    allocated := driver_finance.next_settlement_display_id(
      '5c854333-6ea5-4faa-af31-67cb272fef80', settlement.period_start);
    IF allocated IS NULL OR allocated !~ '^S-[0-9]{4}-[0-9]{4}$' THEN
      RAISE EXCEPTION 'Invalid settlement number allocation';
    END IF;
    UPDATE driver_finance.driver_settlements
    SET display_id = allocated, updated_at = now()
    WHERE id = settlement.id
      AND operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'
      AND display_id = settlement.display_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Settlement changed during numbering correction'; END IF;
    SELECT to_jsonb(s) - 'display_id' - 'updated_at' INTO after_row
    FROM driver_finance.driver_settlements s WHERE id = settlement.id;
    IF before_row IS DISTINCT FROM after_row THEN
      RAISE EXCEPTION 'Numbering correction changed settlement economics or linkage';
    END IF;
  END LOOP;
END $$;
SELECT id, display_id, source_document_ref, first_load_id, tour_id
FROM driver_finance.driver_settlements
WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'
  AND is_sample_data IS NOT TRUE
ORDER BY display_id;
COMMIT;

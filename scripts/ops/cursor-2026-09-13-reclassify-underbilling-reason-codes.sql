-- Reclassify the two OPEN under-billing invoice disputes from the stopgap 'mis_entry' to 'under_billing'.
--
-- Owner ruling 2026-09-13: "when there is an over payment or underpayment, it must also go to dispute, so we
-- can know there is or was an issue with a load." 13578 (+$560) and 13589 (+$30) were opened under 'mis_entry'
-- only because the CHECK constraint had no 'under_billing' code yet (migration 202614131900 adds it).
-- 'mis_entry' asserts an unproven cause (we keyed it wrong); the established fact is only that Faro purchased
-- MORE than we invoiced -> the correct, reportable code is 'under_billing'.
--
-- This is a CLASSIFICATION correction on OPEN disputes, NOT a money edit: amounts are untouched, nothing is
-- voided or re-raised, so void-not-delete does not apply. Audited via audit.append_event.
-- PREREQ: db/migrations/202614131900_invoice_dispute_reason_codes_over_under.sql applied first.
-- RUN: psql "<Neon USMCA DIRECT uri>" -1 -v ON_ERROR_STOP=1 -f scripts/ops/cursor-2026-09-13-reclassify-underbilling-reason-codes.sql

BEGIN;
SELECT set_config('app.bypass_rls','lucia',true);

UPDATE accounting.invoice_disputes
   SET reason_code = 'under_billing', updated_at = now()
 WHERE id IN ('437bda1f-bd3e-4ef9-a468-2b9037181ff3','12b7313a-587c-4cd9-a15c-15276d1b7896')
   AND operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'
   AND status = 'open'
   AND reason_code = 'mis_entry';

SELECT audit.append_event(
  'accounting.invoice_dispute.reason_reclassified', 'warning',
  jsonb_build_object(
    'invoice_dispute_id','437bda1f-bd3e-4ef9-a468-2b9037181ff3','invoice','13578',
    'from','mis_entry','to','under_billing',
    'why','owner over/under->dispute ruling 2026-09-13; mis_entry was a stopgap before the CHECK admitted under_billing; amounts unchanged'),
  'e4117991-d2c0-406d-8cda-74e98d95bccd'::uuid, 'INVOICE-DISPUTE');

SELECT audit.append_event(
  'accounting.invoice_dispute.reason_reclassified', 'warning',
  jsonb_build_object(
    'invoice_dispute_id','12b7313a-587c-4cd9-a15c-15276d1b7896','invoice','13589',
    'from','mis_entry','to','under_billing',
    'why','owner over/under->dispute ruling 2026-09-13; mis_entry was a stopgap before the CHECK admitted under_billing; amounts unchanged'),
  'e4117991-d2c0-406d-8cda-74e98d95bccd'::uuid, 'INVOICE-DISPUTE');

COMMIT;

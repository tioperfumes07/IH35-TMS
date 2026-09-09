-- Migration: 202614010000_loads_reefer_lumper_confirmation
-- Owner spec (09-08-2026-CC-1-REEFER-LUMPER-CONFIRMATION-WORKFLOW.md): every reefer load must
-- capture, at dispatch time, who pays the lumper, whether the customer gets invoiced for it, and
-- whether a late-arrival penalty applies -- today none of this exists (grepped the whole lumper
-- module, zero matches on who_pays/invoice_customer/late_penalty).
--
-- Additive, idempotent, fresh-DB safe. Nullable on purpose -- non-reefer loads never need these,
-- and booking itself must not be blocked by a DB constraint (frontend enforces the requirement for
-- reefer loads; a separate dispatch-transition gate is the real backstop -- see loads.routes.ts).
-- No RLS/grant change: mdata is in the 0065 GRANT set + DEFAULT PRIVILEGES, new columns inherit
-- ih35_app grants automatically, same as every other additive column on this table.

BEGIN;

ALTER TABLE mdata.loads
  ADD COLUMN IF NOT EXISTS lumper_payer text NULL,
  ADD COLUMN IF NOT EXISTS lumper_will_invoice_customer boolean NULL,
  ADD COLUMN IF NOT EXISTS lumper_late_penalty_applies boolean NULL;

ALTER TABLE mdata.loads DROP CONSTRAINT IF EXISTS chk_loads_lumper_payer;
ALTER TABLE mdata.loads
  ADD CONSTRAINT chk_loads_lumper_payer CHECK (lumper_payer IS NULL OR lumper_payer IN ('broker', 'customer'));

COMMENT ON COLUMN mdata.loads.lumper_payer IS 'Reefer dispatch confirmation: who pays the lumper -- broker | customer. NULL for non-reefer loads or not yet confirmed.';
COMMENT ON COLUMN mdata.loads.lumper_will_invoice_customer IS 'Reefer dispatch confirmation: will the customer be invoiced for the lumper. NULL for non-reefer loads or not yet confirmed.';
COMMENT ON COLUMN mdata.loads.lumper_late_penalty_applies IS 'Reefer dispatch confirmation: does a late-arrival penalty apply. NULL for non-reefer loads or not yet confirmed.';

COMMIT;

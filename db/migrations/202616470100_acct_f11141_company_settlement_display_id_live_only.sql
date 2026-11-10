-- 202616470100 — ACCT-F11141: a VOIDED company settlement no longer holds its settlement number.
--
-- WHY (measured on a prod fork 2026-11-10, USMCA): prod #5853 is P-0117 (Carlos, load 13691); the signed AlwaysTrack #5853 is
-- Hugo (13688 13694 13701). Posting the signed #5853 reverses P-0117 through the settlement engine, whose void cascade
-- voids its company settlement (display_id '5853', voided_at set, status 'void') — and the signed settlement's company
-- settlement then could not take the number it is printed with:
--   duplicate key value violates unique constraint "uq_company_settlements_display_id" (operating_company_id, display_id)
-- The constraint counted dead rows. Every other settlement number rule in the app is live-only (driver_settlements by
-- source_document_ref with voided_at IS NULL; company-settlement-close renames WHERE voided_at IS NULL).
--
-- RULE: one LIVE company settlement per (company, number). A voided row keeps its number, untouched (void, never delete).
--
-- Idempotent: the table constraint is dropped if present, the partial unique index created if absent.

ALTER TABLE accounting.company_settlements DROP CONSTRAINT IF EXISTS uq_company_settlements_display_id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_company_settlements_display_id_live
  ON accounting.company_settlements (operating_company_id, display_id)
  WHERE voided_at IS NULL;

COMMENT ON INDEX accounting.uq_company_settlements_display_id_live IS
  'ACCT-F11141: one LIVE company settlement per (company, settlement number); a voided one keeps its number and frees it.';

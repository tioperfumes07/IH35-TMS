-- GO-21 B8 (owner direct instruction 2026-09-02): "receipt/confirmation upload into docs.files,
-- linked both ways" -- the one item of the B8 spec that needed a real schema change. Every other
-- money-document type (driver, load, invoice, settlement, expense, bill, ...) already has this
-- via docs.file_links; a cash advance (driver_finance.driver_advances) has never had it.
--
-- Widens the existing docs.file_links.entity_type CHECK, matching the exact pattern already used
-- for expense/bill (chk_file_links_entity_type_widened_expense_bill) -- additive only, drops
-- nothing, no data touched.
--
-- Additive, idempotent, no data touched.

BEGIN;

ALTER TABLE docs.file_links DROP CONSTRAINT IF EXISTS chk_file_links_entity_type_widened_expense_bill;

ALTER TABLE docs.file_links ADD CONSTRAINT chk_file_links_entity_type_widened_expense_bill
  CHECK (entity_type = ANY (ARRAY[
    'driver', 'customer', 'vendor', 'unit', 'equipment', 'load', 'settlement', 'invoice',
    'tax_document', 'medical_card', 'background_check', 'fine', 'company_violation',
    'drug_test', 'hos_violation', 'dot_inspection', 'fuel_transaction', 'expense', 'bill',
    'cash_advance'
  ]));

COMMIT;

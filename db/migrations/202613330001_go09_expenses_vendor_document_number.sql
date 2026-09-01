-- 202613330001_go09_expenses_vendor_document_number.sql
-- GO-09 L2 -- accounting.expenses gets vendor_document_number: the VENDOR's own receipt/invoice
-- number, distinct from expense_number (OURS, company-wide unique, mint-if-blank via
-- nextExpenseDisplayId -- see apps/backend/src/accounting/display-id.ts, UNTOUCHED by this
-- migration). vendor_document_number is NEVER minted by the server; blank stays blank. The office
-- types the vendor's own number to link back to a paper receipt and to catch a double-entry of
-- the same vendor document -- mirrors accounting.bills' existing bill_number /
-- uq_bills_tms_native_vendor_bill_number pattern exactly (L1's "TWO numbers" design).
--
-- L2 lock (explicit, do not violate): "Do NOT move expense uniqueness to per-vendor." That
-- instruction is about expense_number, which THIS migration does not touch --
-- uq_accounting_expenses_company_expense_number (company-wide) is left exactly as-is. The new
-- per-vendor uniqueness added here is on the NEW vendor_document_number column only, a different
-- field entirely, matching how bill_number's own uniqueness has always been scoped.
--
-- No backfill of the 27,070 QBO-mirror rows (per instruction) -- this is a TMS-native-only field;
-- QBO-origin rows keep vendor_document_number NULL, same as every other TMS-native-only column in
-- this schema.

ALTER TABLE accounting.expenses ADD COLUMN IF NOT EXISTS vendor_document_number text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_expenses_tms_native_vendor_document_number
  ON accounting.expenses (operating_company_id, vendor_uuid, vendor_document_number)
  WHERE qbo_purchase_id IS NULL
    AND voided_at IS NULL
    AND vendor_document_number IS NOT NULL
    AND vendor_uuid IS NOT NULL;

-- [HOLD-FOR-JORGE — TIER 1] Lumper Lifecycle STEP 1: accounting.expense_lines.billable_customer_uuid.
--
-- Enables the lumper-expense -> customer auto-invoice path (Lumper Lifecycle scenario 2, "we pay the lumper
-- and bill the customer"). When a we-pay lumper expense is recovered from the customer, the expense line
-- records WHICH customer it is billable back to; the invoice builder (STEP 7, behind LUMPER_LIFECYCLE_ENABLED,
-- default OFF) reads this to add the billable line. NULL = not customer-billable (scenarios 1 broker-direct /
-- 3 absorb, or a flat-rate customer/delivery-location where the lumper is suppressed).
--
-- FK target is mdata.customers(id) — the real customers table (PK=id; verified read-only on prod). The
-- blueprint's master_data.customers does NOT exist; CLAUDE.md §4 canonical is mdata.customers.
--
-- Additive, NULLABLE, idempotent (ADD COLUMN IF NOT EXISTS). No behavior change — purely a column the lumper
-- auto-invoice logic will populate once the feature flag is on and Jorge signs off. RLS and the existing
-- load_required enforcement are unaffected (a new nullable column adds no policy surface). ih35_app already
-- has SELECT on mdata.customers (FK validation) and DML on accounting.expense_lines — no new GRANT needed.

ALTER TABLE accounting.expense_lines
  ADD COLUMN IF NOT EXISTS billable_customer_uuid uuid NULL REFERENCES mdata.customers(id);

COMMENT ON COLUMN accounting.expense_lines.billable_customer_uuid IS
  'When set, this expense line is billable back to this customer (mdata.customers.id) on the customer invoice '
  '— e.g. a we-pay lumper recovered from the customer (Lumper Lifecycle scenario 2). NULL = not customer-billable.';

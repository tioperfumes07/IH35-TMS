-- [HOLD-FOR-JORGE — TIER 1] CUSTOMER-QBO-PARITY — additive mdata.customers columns closing the gaps
-- flagged in-code (CustomerProfileForm.tsx's former "QuickBooks fields — pending backend" note):
-- Cc/Bcc email, print-on-invoice name, structured shipping address, preferred payment/delivery method,
-- customer language, tax-exemption. Companion migration 202607092000 covers mdata.vendors; split into
-- two files — one ALTER TABLE per file — so the static schema-parity parser's fixed scan window can't
-- bleed columns between tables.
--
-- *** DO NOT RUN ON PROD. Run ONLY on a Neon branch by Jorge's hand, then ledger-backfill so prod
--     db:migrate skips it. Pure ADD COLUMN — no data touched, no existing column altered. ***
--
-- default_income_account_id is Option-B RECOMMENDATION ONLY (memory
-- `vendor-customer-categorization-option-b`): pre-fills the income account when creating an invoice
-- line for this customer; the user always sees and can override it — never a silent auto-post, no new
-- GL math.
BEGIN;

ALTER TABLE mdata.customers
  ADD COLUMN IF NOT EXISTS print_on_invoice_name text,
  ADD COLUMN IF NOT EXISTS cc_email text,
  ADD COLUMN IF NOT EXISTS bcc_email text,
  ADD COLUMN IF NOT EXISTS shipping_address_line1 text,
  ADD COLUMN IF NOT EXISTS shipping_address_line2 text,
  ADD COLUMN IF NOT EXISTS shipping_city text,
  ADD COLUMN IF NOT EXISTS shipping_state text,
  ADD COLUMN IF NOT EXISTS shipping_postal_code text,
  ADD COLUMN IF NOT EXISTS shipping_country text NOT NULL DEFAULT 'US',
  ADD COLUMN IF NOT EXISTS shipping_same_as_billing boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS preferred_payment_method text
    CHECK (preferred_payment_method IS NULL OR preferred_payment_method IN ('check', 'ach', 'credit_card', 'cash', 'other')),
  ADD COLUMN IF NOT EXISTS preferred_delivery_method text NOT NULL DEFAULT 'email'
    CHECK (preferred_delivery_method IN ('email', 'print', 'none')),
  ADD COLUMN IF NOT EXISTS preferred_language text NOT NULL DEFAULT 'en'
    CHECK (preferred_language IN ('en', 'es')),
  ADD COLUMN IF NOT EXISTS tax_exempt boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tax_exempt_reason text,
  ADD COLUMN IF NOT EXISTS default_income_account_id uuid REFERENCES catalogs.accounts(id) ON DELETE SET NULL;

COMMENT ON COLUMN mdata.customers.print_on_invoice_name IS 'QBO parity: name to print on invoices when it differs from customer_name.';
COMMENT ON COLUMN mdata.customers.cc_email IS 'QBO parity: Cc recipient for outgoing invoice emails.';
COMMENT ON COLUMN mdata.customers.bcc_email IS 'QBO parity: Bcc recipient for outgoing invoice emails.';
COMMENT ON COLUMN mdata.customers.shipping_same_as_billing IS 'QBO parity: when true (default), the shipping_* columns are unused and billing address applies to both Bill To / Ship To. When false, shipping_* holds a distinct Ship To address.';
COMMENT ON COLUMN mdata.customers.preferred_payment_method IS 'QBO parity: how this customer typically pays (check/ach/credit_card/cash/other). Informational; does not gate payment recording.';
COMMENT ON COLUMN mdata.customers.preferred_delivery_method IS 'QBO parity: how invoices should be delivered (email/print/none). Default email.';
COMMENT ON COLUMN mdata.customers.preferred_language IS 'QBO parity: customer-facing document language. en/es — relevant for the Laredo/Mexico freight corridor.';
COMMENT ON COLUMN mdata.customers.tax_exempt IS 'QBO parity: whether sales tax should be exempted for this customer.';
COMMENT ON COLUMN mdata.customers.tax_exempt_reason IS 'QBO parity: exemption certificate / reason on file when tax_exempt = true.';
COMMENT ON COLUMN mdata.customers.default_income_account_id IS 'Option-B RECOMMENDATION ONLY (never a silent auto-post): pre-fills the income account on a new invoice line for this customer. The user always sees and can override the pre-filled value before saving. FK catalogs.accounts, ON DELETE SET NULL so a retired account never blocks customer edits.';

CREATE INDEX IF NOT EXISTS idx_customers_default_income_account_id
  ON mdata.customers (default_income_account_id)
  WHERE default_income_account_id IS NOT NULL AND deactivated_at IS NULL;

-- No RLS/grant changes: mdata.customers already carries FORCE ROW LEVEL SECURITY + GRANT SELECT/
-- INSERT/UPDATE TO ih35_app from 0008 — new columns inherit that automatically.
COMMIT;

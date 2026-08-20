-- LST-WIRE-07-CUSTOMER-TYPES-CATALOG-NO-CONSUMER — catalogs.customer_types (migration
-- 202610150000, "LST-WIRE-07") shipped a fully-built customer-type catalog (table, FORCED RLS,
-- seeded 6 starter rows per company, working generic-catalog backend route) but that migration's
-- own comment deliberately deferred the consumer: "a FUTURE same-entity FK from mdata.customers
-- can point here." mdata.customers had no such column, so the catalog had zero consumers anywhere
-- in the app and the live UI still ran entirely on the OLD, unrelated mdata.customers.customer_type
-- column (a plain 2-value broker/direct_shipper text enum, migration 0008/0019).
--
-- This migration adds that FK — additive, nullable, zero risk to the existing customer_type column
-- or any behavior that reads it (that column is untouched; every existing filter/report/UI path that
-- depends on customer_type keeps working exactly as before). customer_type_id is a NEW, ADDITIONAL,
-- optional classification field alongside the old one — not a replacement, not a backfill. Mapping
-- the old 2-value enum onto the new 6-category catalog is a real business decision (BROKER is a
-- close match; SHIPPER_DIRECT is close but not identical wording to direct_shipper) that belongs to
-- the owner, not an inferred migration default — so this migration does NOT auto-populate
-- customer_type_id from customer_type. Every existing customer starts NULL on the new column and
-- stays that way until an operator picks a category through the new picker.
--
-- Composite FK to catalogs.customer_types(operating_company_id, id) — not a bare id FK — so a
-- customer can only reference a customer_type row from its OWN entity, matching the uq_customer_
-- types_company_id unique constraint the 202610150000 migration already prepared for exactly this.
-- Additive/idempotent.

BEGIN;

ALTER TABLE mdata.customers
  ADD COLUMN IF NOT EXISTS customer_type_id uuid NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'customers_customer_type_id_fkey' AND conrelid = 'mdata.customers'::regclass
  ) THEN
    ALTER TABLE mdata.customers
      ADD CONSTRAINT customers_customer_type_id_fkey
      FOREIGN KEY (operating_company_id, customer_type_id)
      REFERENCES catalogs.customer_types (operating_company_id, id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_customers_customer_type_id ON mdata.customers (customer_type_id) WHERE customer_type_id IS NOT NULL;

COMMIT;

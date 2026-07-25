-- 202608050000_bank_link_01_counterparty_same_entity_fk.sql
--
-- HELD — DO NOT RUN ON PROD until owner Neon-applies.
--
-- [HOLD-FOR-JORGE — TIER 1 · FINANCIAL CLUSTER] BANK-LINK-01 (spec BANK-SURF-01/02/05 +
-- BANK-LINK-01-surfaces-counterparty-fk.md, ranked FAIL BANK-F04):
-- "counterparty stored as memo, not a vendor/customer FK — canonical target mdata.vendors/mdata.customers".
--
-- ROOT CAUSE (verified in-repo, this branch — db/migrations/0165_p6_t11204_bank_tx_categorization.sql):
--   banking.bank_transactions.categorization_vendor_id and .categorization_customer_id have existed as
--   BARE `uuid` columns (no REFERENCES, no constraint) since migration 0165. The categorize/match backend
--   (apps/backend/src/banking/categorization.routes.ts) already WRITES and JOINs these columns against
--   mdata.vendors / mdata.customers (never the QBO mirror), and already scopes the vendor candidate list
--   same-entity in application code (`WHERE v.operating_company_id = bt.operating_company_id`) — but
--   nothing at the DATABASE layer enforces that the resolved party is real or same-entity. That is exactly
--   the "counterparty stored as memo, not a persisted FK" defect the spec names: the resolution WORKS by
--   convention, not by constraint. verify-bank-surfaces-and-counterparty.mjs (step 1441) already asserts
--   the CODE writes/JOINs these columns; this migration is the missing DB-layer half — the real FK.
--
-- SCOPE: turn the two counterparty pointers into real, SAME-ENTITY foreign keys — the categorization_memo
-- text column (added in the same 0165 migration) is untouched and stays the human-readable display value;
-- this migration only adds structure on top of the existing FK columns.
--   banking.bank_transactions already carries its own operating_company_id (PER-ENTITY, FORCE RLS,
--   verified live 2026-07-25 — see VERIFIED-LINKAGE-BACKBONE-2026-07-25.md). A single-column FK to
--   mdata.vendors(id) / mdata.customers(id) would satisfy an inbound-FK count while still letting a bank
--   line resolve to a DIFFERENT entity's vendor/customer — the exact cross-entity-leak defect class Rule
--   14 (linkage law) and the ACCT-LINK-04 precedent (db/migrations/202608020000) both reject. So this
--   migration adds the SAME-ENTITY composite form: (operating_company_id, categorization_vendor_id) ->
--   mdata.vendors (operating_company_id, id), and the customer mirror.
--
-- POSTS NOTHING. No journal entry, no GL account, no amount, no posting flag, no feature flag is touched
-- or seeded — this is pure referential-integrity on an existing display/lookup column, not a posting
-- change (Rule 13: reuse the poster, never invent new GL math; this migration has no GL math at all).
-- QBO is never written. Never deletes: no row is removed, no existing column/constraint is dropped, the
-- categorization_memo display value is retained exactly as-is.
-- Idempotent: every step is IF NOT EXISTS / pg_constraint-probe guarded; safe to apply twice.
-- No hardcoded UUID literal anywhere in this file — the FK targets are table/column identifiers, not
-- seeded rows, so there is no org.companies lookup to make dynamic.

BEGIN;

-- 1. Parent-side composite keys the same-entity FKs reference. Both are pure additive UNIQUE
--    constraints over columns that are already unique-by-id (mdata.vendors.id / mdata.customers.id are
--    each a PRIMARY KEY per db/migrations/0008_mdata_init.sql), so neither can reject an existing row.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_vendors_company_id'
      AND conrelid = 'mdata.vendors'::regclass
  ) THEN
    ALTER TABLE mdata.vendors
      ADD CONSTRAINT uq_vendors_company_id UNIQUE (operating_company_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_customers_company_id'
      AND conrelid = 'mdata.customers'::regclass
  ) THEN
    ALTER TABLE mdata.customers
      ADD CONSTRAINT uq_customers_company_id UNIQUE (operating_company_id, id);
  END IF;
END $$;

-- 2. THE BANK-LINK-01 VENDOR LINK: bank_transactions -> mdata.vendors, same entity.
--    Nullable column (categorization_vendor_id already allows NULL — an uncategorized or
--    customer-counterparty line stays legal, QBO-style). Guarded on there being no violating row so a
--    re-apply over dirty prod data reports honestly (Rule 16 — fail loud, never half-apply) instead of
--    silently skipping the constraint.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'bank_tx_categorization_vendor_same_entity_fkey'
      AND conrelid = 'banking.bank_transactions'::regclass
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM banking.bank_transactions bt
      WHERE bt.categorization_vendor_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM mdata.vendors v
          WHERE v.id = bt.categorization_vendor_id
            AND v.operating_company_id = bt.operating_company_id
        )
    ) THEN
      RAISE EXCEPTION
        'E_BANK_TX_VENDOR_ORPHAN: banking.bank_transactions holds categorization_vendor_id pointers that do not resolve in mdata.vendors for the same entity — resolve them (recategorize or clear) before this FK can be added';
    END IF;

    ALTER TABLE banking.bank_transactions
      ADD CONSTRAINT bank_tx_categorization_vendor_same_entity_fkey
      FOREIGN KEY (operating_company_id, categorization_vendor_id)
      REFERENCES mdata.vendors (operating_company_id, id);
  END IF;
END $$;

-- 3. THE BANK-LINK-01 CUSTOMER LINK: bank_transactions -> mdata.customers, same entity. Mirrors step 2
--    exactly (a line may be billable to a customer instead of paid to a vendor — mutually exclusive in
--    the categorize panel, both nullable at the DB layer so either, neither, or — pre-fix legacy rows —
--    theoretically both may be NULL without violating anything).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'bank_tx_categorization_customer_same_entity_fkey'
      AND conrelid = 'banking.bank_transactions'::regclass
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM banking.bank_transactions bt
      WHERE bt.categorization_customer_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM mdata.customers c
          WHERE c.id = bt.categorization_customer_id
            AND c.operating_company_id = bt.operating_company_id
        )
    ) THEN
      RAISE EXCEPTION
        'E_BANK_TX_CUSTOMER_ORPHAN: banking.bank_transactions holds categorization_customer_id pointers that do not resolve in mdata.customers for the same entity — resolve them (recategorize or clear) before this FK can be added';
    END IF;

    ALTER TABLE banking.bank_transactions
      ADD CONSTRAINT bank_tx_categorization_customer_same_entity_fkey
      FOREIGN KEY (operating_company_id, categorization_customer_id)
      REFERENCES mdata.customers (operating_company_id, id);
  END IF;
END $$;

-- 4. Reverse-drill read paths (party -> its bank lines) + forward entity filtering. Neither column had
--    an index before this migration.
CREATE INDEX IF NOT EXISTS idx_bank_tx_categorization_vendor
  ON banking.bank_transactions (operating_company_id, categorization_vendor_id)
  WHERE categorization_vendor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bank_tx_categorization_customer
  ON banking.bank_transactions (operating_company_id, categorization_customer_id)
  WHERE categorization_customer_id IS NOT NULL;

-- No RLS or grant change: banking.bank_transactions, mdata.vendors, and mdata.customers already carry
-- FORCE ROW LEVEL SECURITY scoped by operating_company_id (verified live on Neon br-fancy-credit-akjnd07a
-- under app.bypass_rls='lucia', 2026-07-25 — see VERIFIED-LINKAGE-BACKBONE-2026-07-25.md) and existing
-- ih35_app table grants (0065 pattern) already cover SELECT/INSERT/UPDATE on all three tables. A new
-- CONSTRAINT + a new partial INDEX inherit the table's existing policies and grants; neither needs a
-- policy or grant statement of its own. categorization_memo (0165) is not touched by this migration —
-- the display value is retained exactly as it was.

COMMIT;

-- Verification (read-only; harmless on re-run) --------------------------------------------------------
SELECT
  (SELECT COUNT(*) FROM pg_constraint
     WHERE conname = 'bank_tx_categorization_vendor_same_entity_fkey'
       AND conrelid = 'banking.bank_transactions'::regclass) AS vendor_fk_present,
  (SELECT COUNT(*) FROM pg_constraint
     WHERE conname = 'bank_tx_categorization_customer_same_entity_fkey'
       AND conrelid = 'banking.bank_transactions'::regclass) AS customer_fk_present,
  (SELECT COUNT(*) FROM pg_constraint
     WHERE conname = 'uq_vendors_company_id' AND conrelid = 'mdata.vendors'::regclass) AS vendors_uq_present,
  (SELECT COUNT(*) FROM pg_constraint
     WHERE conname = 'uq_customers_company_id' AND conrelid = 'mdata.customers'::regclass) AS customers_uq_present,
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_schema = 'banking' AND table_name = 'bank_transactions'
       AND column_name = 'categorization_memo') AS memo_column_retained;

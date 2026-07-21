-- [HOLD-FOR-JORGE — FINANCIAL] 0441-mod8-tx-fields-captured-not-sent — persist the categorize-panel
-- capture fields on banking.bank_transactions.
-- DO NOT RUN ON PROD — runs ONLY on a Neon branch by Jorge's hand, then is ledger-backfilled so prod
-- db:migrate skips it. Registered in db/migrations/.held-migrations.json (verify:hold-migrations-registered).
--
-- WHY: the Banking transactions categorize panel (BankingTransactionsDesignView RowDetailDraft) captures
-- Check no. / Class / Location / Billable / Tags, but postTransaction never sent them and
-- banking.bank_transactions had no columns to hold them — the operator's input silently evaporated on
-- Post (draft-overlay only, lost on reload). QBO parity: an Expense/Check row carries Check no., Class,
-- Location, Billable, Tags; our register captured them and dropped them.
--
-- Columns (all additive + idempotent; nullable/default — no backfill needed, existing rows read as
-- "not captured"):
--   check_number             text — the check number for check-paid rows (frontend type already declares
--                            it: apps/frontend/src/api/banking.ts PlaidBankTransaction.check_number).
--   categorization_class_id  uuid FK catalogs.classes — the QBO reporting DIMENSION (Class). The real
--                            catalog FK (linkage law: label derived by JOIN, never stored denormalized).
--   categorization_location  text — free text; there is NO locations catalog today (verified: only
--                            mdata.locations = geo stops, catalogs.maintenance_part_locations = shop bins).
--                            A future locations catalog can add categorization_location_id additively.
--   is_billable              boolean NOT NULL DEFAULT false — billable-to-customer marker (pairs with
--                            categorization_customer_id).
--   tags                     text — free-text comma-separated tags, exactly what the panel captures.
--
-- No RLS change needed: banking.bank_transactions already carries FORCED RLS scoped by
-- operating_company_id; new columns inherit the table's grants + policies. No GL rows, no flags here —
-- this is capture-field persistence only (same contract as categorization_memo / categorization_item_id).

BEGIN;

ALTER TABLE banking.bank_transactions
  ADD COLUMN IF NOT EXISTS check_number text NULL;

ALTER TABLE banking.bank_transactions
  ADD COLUMN IF NOT EXISTS categorization_class_id uuid NULL;

-- FK to catalogs.classes — dual-path because held AF-3 (202606300090_af3_catalogs_classes_per_entity,
-- not yet marked applied_on_prod) may or may not have added operating_company_id + uq_classes_company_id:
--   * AF-3 applied (fresh CI DB always — it sorts first): same-entity COMPOSITE FK
--     (operating_company_id, categorization_class_id) → catalogs.classes (operating_company_id, id),
--     the linkage-law C4 shape AF-3 itself used for catalogs.items.default_class_id.
--   * AF-3 not applied (possible prod state): single-column FK on id only; FORCED RLS on catalogs.classes
--     still gates reads. If Jorge applies AF-3 later, upgrade by re-running the composite branch by hand
--     (documented in .held-migrations.json).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint
      WHERE conname = 'uq_classes_company_id' AND conrelid = 'catalogs.classes'::regclass) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
        WHERE conname = 'bank_tx_class_same_entity_fkey' AND conrelid = 'banking.bank_transactions'::regclass) THEN
      ALTER TABLE banking.bank_transactions ADD CONSTRAINT bank_tx_class_same_entity_fkey
        FOREIGN KEY (operating_company_id, categorization_class_id)
        REFERENCES catalogs.classes (operating_company_id, id);
    END IF;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
        WHERE conname = 'bank_tx_categorization_class_id_fkey' AND conrelid = 'banking.bank_transactions'::regclass) THEN
      ALTER TABLE banking.bank_transactions ADD CONSTRAINT bank_tx_categorization_class_id_fkey
        FOREIGN KEY (categorization_class_id) REFERENCES catalogs.classes (id);
    END IF;
  END IF;
END $$;

ALTER TABLE banking.bank_transactions
  ADD COLUMN IF NOT EXISTS categorization_location text NULL;

ALTER TABLE banking.bank_transactions
  ADD COLUMN IF NOT EXISTS is_billable boolean NOT NULL DEFAULT false;

ALTER TABLE banking.bank_transactions
  ADD COLUMN IF NOT EXISTS tags text NULL;

-- Class-scoped lookups (only tagged rows) — mirrors idx_bank_tx_categorization_driver.
CREATE INDEX IF NOT EXISTS idx_bank_tx_categorization_class
  ON banking.bank_transactions (operating_company_id, categorization_class_id)
  WHERE categorization_class_id IS NOT NULL;

COMMIT;

-- Verification (read-only; harmless on re-run) --------------------------------------------------------
SELECT
  count(*) FILTER (WHERE column_name = 'check_number') = 1 AS has_check_number,
  count(*) FILTER (WHERE column_name = 'categorization_class_id') = 1 AS has_categorization_class_id,
  count(*) FILTER (WHERE column_name = 'categorization_location') = 1 AS has_categorization_location,
  count(*) FILTER (WHERE column_name = 'is_billable') = 1 AS has_is_billable,
  count(*) FILTER (WHERE column_name = 'tags') = 1 AS has_tags
FROM information_schema.columns
WHERE table_schema = 'banking'
  AND table_name = 'bank_transactions';

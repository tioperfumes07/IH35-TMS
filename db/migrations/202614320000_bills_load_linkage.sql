-- 202614320000_bills_load_linkage.sql
--
-- ROUND 118 (Lead ruling, Defect 2): "VENDOR BILLS CANNOT BE CASCADED BECAUSE THEY ARE NOT
-- LINKED. THIS IS SCHEMA." Measured live on production, br-fancy-credit-akjnd07a:
-- accounting.bills carries linked_work_order_uuid, vendor_id, vendor_uuid, mdata_vendor_id,
-- source, source_system, source_bank_transaction_id -- and NO load linkage of any kind. A
-- lumper, scale or tarp bill raised for a load has nothing pointing at that load, so a
-- cancellation leaves a live payable orphaned with no trace back to the load that caused it.
--
-- Additive only, nullable (most bills are not load-driven -- fuel cards, insurance, shop
-- supplies, general vendor bills never had and never need a load), FK to mdata.loads(id),
-- indexed for the cascade's own lookup query (WHERE load_id = $1). No backfill in this
-- migration -- existing bills have no reliable signal to backfill a load from without
-- guessing; going-forward population happens at the write paths that raise a load-driven
-- vendor bill (dispatch/cancellation.service.ts's own VOID-CASCADE-VENDOR-BILLS cascade query
-- reads this column; the write paths that SET it are wired in the same round, application code,
-- not this migration).
DO $$
BEGIN
  IF to_regclass('accounting.bills') IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='accounting' AND table_name='bills' AND column_name='load_id'
  ) THEN
    ALTER TABLE accounting.bills ADD COLUMN load_id uuid;
    COMMENT ON COLUMN accounting.bills.load_id IS
      'ROUND 118 (2026-09-23): nullable link to mdata.loads(id) for a load-driven vendor bill '
      '(lumper, scale, tarp, roadside on a specific trip). NULL for every non-load-driven bill '
      '(fuel cards, insurance, shop supplies, general vendor bills) -- most bills. Read by '
      'dispatch/cancellation.service.ts''s VOID-CASCADE-VENDOR-BILLS cascade so a cancelled '
      'load can find and void its own vendor bills; written by the specific create paths that '
      'raise a load-driven bill.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bills_load_id_fkey'
  ) THEN
    ALTER TABLE accounting.bills
      ADD CONSTRAINT bills_load_id_fkey FOREIGN KEY (load_id) REFERENCES mdata.loads(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname='accounting' AND tablename='bills' AND indexname='idx_bills_load_id'
  ) THEN
    CREATE INDEX idx_bills_load_id ON accounting.bills (load_id) WHERE load_id IS NOT NULL;
  END IF;
END $$;

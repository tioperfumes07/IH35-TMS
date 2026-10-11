-- 443.37 audit gap: per-load bill JE postings carry no direct settlement link.
-- Root cause: settlement-ap-chain.service.ts:233 posts with source_transaction_type='bill'
-- and no settlement context; the table has no settlement_id column.
-- Fix: add settlement_id (nullable, FK to driver_finance.settlements) + stamp it after posting.
-- Reverse drill (JE → settlement) is now a single column join instead of a 4-hop join.

ALTER TABLE accounting.journal_entry_postings
  ADD COLUMN IF NOT EXISTS settlement_id UUID
    REFERENCES driver_finance.settlements (id)
    ON DELETE SET NULL;

-- Index for forward drill: settlement → its bill JE posting lines.
CREATE INDEX IF NOT EXISTS idx_jep_settlement_id
  ON accounting.journal_entry_postings (settlement_id)
  WHERE settlement_id IS NOT NULL;

-- Backfill existing rows via the known bill → settlement join path.
-- Only stamps rows that have source_transaction_type='bill' and a matching
-- driver_settlement_gl_bills row (the canonical settlement↔bill link table).
UPDATE accounting.journal_entry_postings jep
   SET settlement_id = dsg.settlement_id
  FROM driver_finance.driver_settlement_gl_bills dsg
  JOIN accounting.bills b ON b.id::text = jep.source_transaction_id
 WHERE jep.source_transaction_type = 'bill'
   AND dsg.accounting_bill_id = b.id
   AND jep.settlement_id IS NULL;

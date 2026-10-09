-- BANK-F3 (ROUND 442.1): backfill entity_uuid / entity_type on existing bank_categorization postings
-- that carry a vendor. Measured live, USMCA 2026-10-09: 66 categorized lines have categorization_vendor_id
-- set; 126 of 136 categorization posting lines have entity_uuid NULL. This UPDATE patches the category leg
-- (the leg on categorization_gl_account_id, not the bank leg) so those 66 postings appear in vendor
-- history, the vendor register, and 1099 totals. No DDL; column exists since ROUND 393.3.
-- Idempotent: WHERE entity_uuid IS NULL means a re-run is a no-op.

UPDATE accounting.journal_entry_postings p
SET entity_uuid      = bt.categorization_vendor_id,
    entity_type      = 'vendor',
    updated_at       = now()
FROM banking.bank_transactions bt
WHERE p.source_transaction_type           = 'bank_categorization'
  AND p.source_transaction_id             = bt.id::text
  AND p.operating_company_id              = bt.operating_company_id
  AND bt.categorization_vendor_id         IS NOT NULL
  AND p.entity_uuid                       IS NULL
  AND p.account_id                        = bt.categorization_gl_account_id;

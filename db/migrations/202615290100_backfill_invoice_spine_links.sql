-- Lead ROUND 332 item 2 (CC-1) — the invoice half of the spine. Postings that carry an invoice as their source
-- (journal_entry_postings.source_transaction_type = 'invoice') were declared on accounting.transaction_source_links
-- only when the posting engine wrote them; the delivery latch's Event 2 A/R line — which IS the invoice's A/R — was
-- linked to the load (revrec_bill) and to manual_entry, never to the invoice. Measured on prod USMCA: 110 live
-- invoices, 104 with invoice-tagged postings, 4 with an invoice link (invoice/source_transaction 8 rows).
--
-- Backfill: one invoice/source_transaction link per invoice-tagged posting that lacks one, only for postings whose
-- invoice exists in the same company. ON CONFLICT DO NOTHING on the spine's own unique key. Counted before and after
-- in this transaction; the migration refuses (and rolls back) if any invoice-tagged posting is still unlinked after.
-- The poster changes in the same PR (invoice-gl.service + revrec-delivery-posting) stop new gaps.
BEGIN;
DO $$
DECLARE before_gap bigint; inserted bigint; after_gap bigint;
BEGIN
  SELECT count(*) INTO before_gap
    FROM accounting.journal_entry_postings p
    JOIN accounting.invoices i ON i.id::text = p.source_transaction_id AND i.operating_company_id = p.operating_company_id
   WHERE p.source_transaction_type = 'invoice'
     AND NOT EXISTS (SELECT 1 FROM accounting.transaction_source_links t
                      WHERE t.journal_entry_posting_id = p.id AND t.linked_object_type = 'invoice'
                        AND t.linked_object_id = p.source_transaction_id AND COALESCE(t.relationship_role, '') = 'source_transaction');

  INSERT INTO accounting.transaction_source_links
    (operating_company_id, journal_entry_posting_id, linked_object_type, linked_object_id, relationship_role, created_at)
  SELECT p.operating_company_id, p.id, 'invoice', p.source_transaction_id, 'source_transaction', now()
    FROM accounting.journal_entry_postings p
    JOIN accounting.invoices i ON i.id::text = p.source_transaction_id AND i.operating_company_id = p.operating_company_id
   WHERE p.source_transaction_type = 'invoice'
     AND NOT EXISTS (SELECT 1 FROM accounting.transaction_source_links t
                      WHERE t.journal_entry_posting_id = p.id AND t.linked_object_type = 'invoice'
                        AND t.linked_object_id = p.source_transaction_id AND COALESCE(t.relationship_role, '') = 'source_transaction')
  ON CONFLICT (journal_entry_posting_id, linked_object_type, linked_object_id, COALESCE(relationship_role, '')) DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;

  SELECT count(*) INTO after_gap
    FROM accounting.journal_entry_postings p
    JOIN accounting.invoices i ON i.id::text = p.source_transaction_id AND i.operating_company_id = p.operating_company_id
   WHERE p.source_transaction_type = 'invoice'
     AND NOT EXISTS (SELECT 1 FROM accounting.transaction_source_links t
                      WHERE t.journal_entry_posting_id = p.id AND t.linked_object_type = 'invoice'
                        AND t.linked_object_id = p.source_transaction_id AND COALESCE(t.relationship_role, '') = 'source_transaction');

  RAISE NOTICE 'invoice spine backfill: unlinked invoice postings before %, links inserted %, unlinked after %', before_gap, inserted, after_gap;
  IF after_gap <> 0 THEN
    RAISE EXCEPTION 'invoice spine backfill incomplete: % invoice-tagged postings still unlinked', after_gap;
  END IF;
END $$;
COMMIT;

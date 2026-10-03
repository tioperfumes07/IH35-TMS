-- 202615390930_recon_adjustments_link_to_session.sql  (CLAIM-RESERVE #24904, CC-3)
-- ROUND 390.3 — the bank-recon memo was doing a primary key's job. Owner: "session 7a7d1da9-aa5b-4de7-b … should not be
-- in the description at all." The writer (banking/recon-adjustments.service.ts) now links every adjustment posting to its
-- reconciliation session on the spine and keys idempotency on that link + amount; this backfills the rows written before.
--
-- Measured on USMCA (bypass_rls, direct endpoint, 2026-10-03): 2 journal entries + 1 expense carry
-- "Bank reconciliation interest earned/service charge · session <uuid>". The session's ids also sit on
-- banking.reconciliation_sessions (service_charge_journal_entry_id / service_charge_expense_id /
-- interest_earned_journal_entry_id), so each row is tied to its session by a FOREIGN KEY first and its memo second.
--
-- ORDER, per row: (1) link every posting of the entry to the session (bank_reconciliation / recon_service_charge or
-- recon_interest_earned); (2) only if every posting now carries the link, rewrite the memo to "Bank reconciliation
-- service charge — MM/DD/YYYY". A row whose link did not land keeps its memo — the uuid is then still the only key.
-- The session is read from the memo and must match the session row that points at the entry; a mismatch is skipped.
-- USMCA only (TRANSPORTATION / TRUCKING are frozen). Fresh-DB safe: no USMCA -> nothing to do. Idempotent.

BEGIN;

DO $$
DECLARE
  v_usmca constant uuid := '5c854333-6ea5-4faa-af31-67cb272fef80';
  r record;
  v_total int;
  v_linked int;
  v_date date;
  v_kind text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM org.companies WHERE id = v_usmca) THEN RETURN; END IF;

  -- Journal entries: the interest entry, and any service-charge entry (the pre-BANK-ECON-04 bare cost JE).
  FOR r IN
    SELECT j.id, j.entry_date,
           substring(j.memo from '· session ([0-9a-f-]{36})')::uuid AS session_id,
           CASE WHEN j.memo LIKE 'Bank reconciliation interest earned%' THEN 'recon_interest_earned'
                ELSE 'recon_service_charge' END AS role
      FROM accounting.journal_entries j
     WHERE j.operating_company_id = v_usmca
       AND j.memo ~ '^Bank reconciliation (interest earned|service charge) · session [0-9a-f-]{36}$'
  LOOP
    -- the session must own this entry (FK), not just name it in text
    IF NOT EXISTS (SELECT 1 FROM banking.reconciliation_sessions s
                    WHERE s.id = r.session_id AND s.operating_company_id = v_usmca
                      AND (s.interest_earned_journal_entry_id = r.id OR s.service_charge_journal_entry_id = r.id
                           OR EXISTS (SELECT 1 FROM accounting.journal_entry_postings p
                                       WHERE p.journal_entry_uuid = r.id AND p.source_transaction_type = 'bank_reconciliation'
                                         AND p.source_transaction_id::text = s.id::text))) THEN
      RAISE NOTICE '202615390930: JE % names session % but the session does not own it — memo kept', r.id, r.session_id;
      CONTINUE;
    END IF;
    INSERT INTO accounting.transaction_source_links (operating_company_id, journal_entry_posting_id, linked_object_type, linked_object_id, relationship_role)
    SELECT p.operating_company_id, p.id, 'bank_reconciliation', r.session_id::text, r.role
      FROM accounting.journal_entry_postings p
     WHERE p.journal_entry_uuid = r.id
       AND NOT EXISTS (SELECT 1 FROM accounting.transaction_source_links l
                        WHERE l.journal_entry_posting_id = p.id AND l.linked_object_type = 'bank_reconciliation'
                          AND l.linked_object_id = r.session_id::text AND l.relationship_role = r.role);
    SELECT count(*), count(l.id) INTO v_total, v_linked
      FROM accounting.journal_entry_postings p
      LEFT JOIN accounting.transaction_source_links l ON l.journal_entry_posting_id = p.id
           AND l.linked_object_type = 'bank_reconciliation' AND l.linked_object_id = r.session_id::text AND l.relationship_role = r.role
     WHERE p.journal_entry_uuid = r.id;
    IF v_total = 0 OR v_linked < v_total THEN
      RAISE NOTICE '202615390930: JE % — % of % postings linked; memo kept', r.id, v_linked, v_total;
      CONTINUE;
    END IF;
    UPDATE accounting.journal_entries
       SET memo = CASE WHEN r.role = 'recon_interest_earned' THEN 'Bank reconciliation interest earned — ' ELSE 'Bank reconciliation service charge — ' END
                  || to_char(r.entry_date, 'MM/DD/YYYY')
     WHERE id = r.id;
  END LOOP;

  -- Expenses: the service-charge document. Its postings carry source 'expense', so the link goes on its entry's postings.
  FOR r IN
    SELECT e.id, e.journal_entry_id, e.transaction_date,
           substring(e.memo from '· session ([0-9a-f-]{36})')::uuid AS session_id
      FROM accounting.expenses e
     WHERE e.operating_company_id = v_usmca
       AND e.memo ~ '^Bank reconciliation service charge · session [0-9a-f-]{36}$'
  LOOP
    IF r.journal_entry_id IS NULL OR NOT EXISTS (
         SELECT 1 FROM banking.reconciliation_sessions s
          WHERE s.id = r.session_id AND s.operating_company_id = v_usmca
            AND (s.service_charge_expense_id = r.id OR s.service_charge_journal_entry_id = r.journal_entry_id)) THEN
      RAISE NOTICE '202615390930: expense % names session % but the session does not own it — memo kept', r.id, r.session_id;
      CONTINUE;
    END IF;
    INSERT INTO accounting.transaction_source_links (operating_company_id, journal_entry_posting_id, linked_object_type, linked_object_id, relationship_role)
    SELECT p.operating_company_id, p.id, 'bank_reconciliation', r.session_id::text, 'recon_service_charge'
      FROM accounting.journal_entry_postings p
     WHERE p.journal_entry_uuid = r.journal_entry_id
       AND NOT EXISTS (SELECT 1 FROM accounting.transaction_source_links l
                        WHERE l.journal_entry_posting_id = p.id AND l.linked_object_type = 'bank_reconciliation'
                          AND l.linked_object_id = r.session_id::text AND l.relationship_role = 'recon_service_charge');
    SELECT count(*), count(l.id) INTO v_total, v_linked
      FROM accounting.journal_entry_postings p
      LEFT JOIN accounting.transaction_source_links l ON l.journal_entry_posting_id = p.id
           AND l.linked_object_type = 'bank_reconciliation' AND l.linked_object_id = r.session_id::text AND l.relationship_role = 'recon_service_charge'
     WHERE p.journal_entry_uuid = r.journal_entry_id;
    IF v_total = 0 OR v_linked < v_total THEN
      RAISE NOTICE '202615390930: expense % — % of % postings linked; memo kept', r.id, v_linked, v_total;
      CONTINUE;
    END IF;
    UPDATE accounting.expenses
       SET memo = 'Bank reconciliation service charge — ' || to_char(r.transaction_date, 'MM/DD/YYYY'), updated_at = now()
     WHERE id = r.id;
  END LOOP;
END $$;

COMMIT;

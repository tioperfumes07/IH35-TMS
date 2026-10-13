-- LEAD 443.133 B (owner GO on Relay deposits, 2026-10-12 15:00 CT) — claimed by CC-3 in #26684 (443.127).
--
-- 1. The owner's Relay funding-card map becomes DATA on integrations.relay_company_cards (it was a code constant in
--    relay-deposit-post.service.ts): funding_kind ('company_account' | 'intercompany' | 'party') + the credit target
--    (account number / system purpose, or the party vendor + relationship). A card with no funding_kind is not mapped:
--    the deposit poster HOLDS it by name, never guesses.
-- 2. relay_deposits.classification gains 'party' and 'intercompany' (the classifier reads the map), and the deposit row
--    carries the journal entry that posted it (posted_journal_entry_id) next to posted_to_gl.
-- 3. A deposit enters 1295 exactly once: integrations.relay_deposit_postings holds ONE live journal entry per deposit,
--    written by trigger from the deposit's posting lines; a second journal entry for the same deposit is refused by the
--    database. A reversal of the deposit's lines releases it.
-- 4. The owner's map for USMCA (verbatim sources: 443.29 b 2026-10-10 7:26/7:28/7:30 PM CT, Lead ruling 2026-10-11 (5007),
--    443.64 (6248, 9855), 443.127 DATA 2026-10-12 (1222, 9830, 3088, 1993, 0275, 7180), owner 14:29 CT (1993 = loan from
--    vendor Alberto Lozano), 443.133 B (0275 Scentsx; 1222/3088/7180 Laura; 9830 Tio Perfumes 2)). Only rows the owner
--    has not edited (funding_kind IS NULL) are filled. 1993 has no "Due to / from" account yet: its row names the party but
--    no account, so the poster refuses it by name until the owner creates the account.

BEGIN;

ALTER TABLE integrations.relay_company_cards
  ADD COLUMN IF NOT EXISTS funding_kind text,
  ADD COLUMN IF NOT EXISTS funding_account_number text,
  ADD COLUMN IF NOT EXISTS funding_system_purpose text,
  ADD COLUMN IF NOT EXISTS party_vendor_id uuid,
  ADD COLUMN IF NOT EXISTS party_relationship text,
  ADD COLUMN IF NOT EXISTS owner_ruling text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'relay_company_cards_funding_kind_check') THEN
    ALTER TABLE integrations.relay_company_cards ADD CONSTRAINT relay_company_cards_funding_kind_check CHECK (
      funding_kind IS NULL
      OR (funding_kind IN ('company_account', 'intercompany')
          AND (funding_account_number IS NOT NULL OR funding_system_purpose IS NOT NULL)
          AND party_vendor_id IS NULL)
      OR (funding_kind = 'party' AND party_vendor_id IS NOT NULL
          AND party_relationship IN ('owner', 'spouse', 'friend', 'employee', 'related_company', 'other'))
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'relay_company_cards_party_vendor_fk') THEN
    ALTER TABLE integrations.relay_company_cards
      ADD CONSTRAINT relay_company_cards_party_vendor_fk FOREIGN KEY (party_vendor_id) REFERENCES mdata.vendors(id);
  END IF;
END$$;

COMMENT ON COLUMN integrations.relay_company_cards.funding_kind IS
  'LEAD 443.133 B: the owner''s funding-card map as data. company_account / intercompany credit the named account; party credits the party''s "Due to / from" account with a paid-direct loan document. NULL = not mapped: the deposit poster holds the deposit by name.';

-- 2. classification + posting link on the deposit row.
ALTER TABLE integrations.relay_deposits DROP CONSTRAINT IF EXISTS relay_deposits_classification_check;
ALTER TABLE integrations.relay_deposits ADD CONSTRAINT relay_deposits_classification_check
  CHECK (classification IN ('company', 'party', 'intercompany', 'unclassified', 'canceled'));
ALTER TABLE integrations.relay_deposits ADD COLUMN IF NOT EXISTS posted_journal_entry_id uuid;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'relay_deposits_posted_journal_entry_fk') THEN
    ALTER TABLE integrations.relay_deposits
      ADD CONSTRAINT relay_deposits_posted_journal_entry_fk FOREIGN KEY (posted_journal_entry_id) REFERENCES accounting.journal_entries(id);
  END IF;
END$$;

-- 3. One live journal entry per deposit.
CREATE TABLE IF NOT EXISTS integrations.relay_deposit_postings (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  uuid NOT NULL REFERENCES org.companies(id),
  relay_deposit_id      uuid NOT NULL REFERENCES integrations.relay_deposits(id),
  journal_entry_id      uuid NOT NULL REFERENCES accounting.journal_entries(id),
  released_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS relay_deposit_postings_one_live_uk
  ON integrations.relay_deposit_postings (operating_company_id, relay_deposit_id)
  WHERE released_at IS NULL;
COMMENT ON TABLE integrations.relay_deposit_postings IS
  'LEAD 443.133 B — a Relay deposit enters the Relay Fuel Wallet (1295) exactly once: one live journal entry per deposit, written by trigger from the deposit''s posting lines; released when those lines are reversed.';

ALTER TABLE integrations.relay_deposit_postings ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations.relay_deposit_postings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS relay_deposit_postings_entity_scope ON integrations.relay_deposit_postings;
CREATE POLICY relay_deposit_postings_entity_scope ON integrations.relay_deposit_postings
  FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid)
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);
GRANT USAGE ON SCHEMA integrations TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON integrations.relay_deposit_postings TO ih35_app;

DO $audit$
BEGIN
  IF to_regprocedure('audit.tg_audit_row()') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_audit_relay_deposit_postings ON integrations.relay_deposit_postings';
    EXECUTE 'CREATE TRIGGER trg_audit_relay_deposit_postings AFTER INSERT OR UPDATE OR DELETE ON integrations.relay_deposit_postings
             FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row()';
  END IF;
END
$audit$;

CREATE OR REPLACE FUNCTION integrations.tg_register_relay_deposit_posting()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_deposit uuid;
  v_existing uuid;
BEGIN
  IF NEW.source_transaction_id IS NULL
     OR NEW.source_transaction_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN NEW;
  END IF;
  v_deposit := NEW.source_transaction_id::uuid;
  IF NEW.reversal_of_line_id IS NOT NULL THEN
    UPDATE integrations.relay_deposit_postings
       SET released_at = now()
     WHERE operating_company_id = NEW.operating_company_id AND relay_deposit_id = v_deposit AND released_at IS NULL;
    RETURN NEW;
  END IF;
  SELECT journal_entry_id INTO v_existing
    FROM integrations.relay_deposit_postings
   WHERE operating_company_id = NEW.operating_company_id AND relay_deposit_id = v_deposit AND released_at IS NULL
   LIMIT 1;
  IF v_existing IS NULL THEN
    INSERT INTO integrations.relay_deposit_postings (operating_company_id, relay_deposit_id, journal_entry_id)
    VALUES (NEW.operating_company_id, v_deposit, NEW.journal_entry_uuid);
  ELSIF v_existing <> NEW.journal_entry_uuid THEN
    RAISE EXCEPTION 'relay_deposit_already_posted: deposit % already has live journal entry % — a deposit enters the Relay Fuel Wallet once', v_deposit, v_existing
      USING ERRCODE = 'unique_violation';
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_register_relay_deposit_posting ON accounting.journal_entry_postings;
CREATE TRIGGER trg_register_relay_deposit_posting
  AFTER INSERT ON accounting.journal_entry_postings
  FOR EACH ROW
  WHEN (NEW.source_transaction_type = 'relay_deposit')
  EXECUTE FUNCTION integrations.tg_register_relay_deposit_posting();

-- Existing live deposit entries join the registry (derived from the postings; one per deposit).
INSERT INTO integrations.relay_deposit_postings (operating_company_id, relay_deposit_id, journal_entry_id)
SELECT DISTINCT ON (p.operating_company_id, p.source_transaction_id)
       p.operating_company_id, p.source_transaction_id::uuid, p.journal_entry_uuid
  FROM accounting.journal_entry_postings p
  JOIN integrations.relay_deposits d ON d.id::text = p.source_transaction_id AND d.operating_company_id = p.operating_company_id
 WHERE p.source_transaction_type = 'relay_deposit'
   AND p.reversal_of_line_id IS NULL AND p.reversed_by_line_id IS NULL
   AND p.operating_company_id = (SELECT id FROM org.companies WHERE code = 'USMCA' LIMIT 1)  -- TRANSP / TRK frozen
   AND NOT EXISTS (SELECT 1 FROM integrations.relay_deposit_postings r
                    WHERE r.operating_company_id = p.operating_company_id AND r.relay_deposit_id = p.source_transaction_id::uuid
                      AND r.released_at IS NULL)
 ORDER BY p.operating_company_id, p.source_transaction_id, p.created_at;

-- 4. The owner's USMCA map (only where the owner has not set a funding kind).
WITH usmca AS (SELECT id FROM org.companies WHERE code = 'USMCA' LIMIT 1),
vend AS (
  SELECT v.id, v.vendor_name FROM mdata.vendors v JOIN usmca u ON v.operating_company_id = u.id WHERE v.deactivated_at IS NULL
),
m(card, kind, acct, purpose, vendor_name, vendor_id, relationship, label, ruling) AS (VALUES
  ('0680', 'company_account', '1000', NULL, NULL, NULL::uuid, NULL, 'USMCA Bank of America debit', '443.29 b owner 2026-10-10 7:26 PM CT'),
  ('5007', 'company_account', '2500-00-001', NULL, NULL, NULL::uuid, NULL, 'Amex Scentsx (Amex Credit Card Payable)', 'Lead ruling 2026-10-11; 443.133 B'),
  ('9708', 'intercompany', NULL, 'intercompany_ih35', NULL, NULL::uuid, NULL, 'Laura — Transportation Wells Fargo debit', '443.29 b owner 2026-10-10 7:28 PM CT'),
  ('1354', 'intercompany', NULL, 'intercompany_ih35', NULL, NULL::uuid, NULL, 'Laura — Transportation Wells Fargo debit', '443.29 b owner 2026-10-10 7:28 PM CT'),
  ('4823', 'intercompany', NULL, 'intercompany_ih35', NULL, NULL::uuid, NULL, 'Laura — Transportation Wells Fargo debit', '443.29 b owner 2026-10-10 7:28 PM CT'),
  ('0210', 'party', '2410-00-001', NULL, 'Jorge Pablo Guadalupe Muñoz Gonzalez', NULL::uuid, 'owner', 'Jorge personal card', '443.58 / 443.64'),
  ('6248', 'party', '2410-00-001', NULL, 'Jorge Pablo Guadalupe Muñoz Gonzalez', NULL::uuid, 'owner', 'Jorge personal Bank of America debit', '443.64'),
  ('9855', 'party', '2410-00-003', NULL, 'Tio Perfumes 2 LLC', NULL::uuid, 'related_company', 'Tio Perfumes 2', '443.64'),
  ('9830', 'party', '2410-00-003', NULL, 'Tio Perfumes 2 LLC', NULL::uuid, 'related_company', 'Tio Perfumes 2', '443.127 DATA 2026-10-12; 443.133 B'),
  ('0275', 'party', '2410-00-002', NULL, 'Scentsx Llc', NULL::uuid, 'related_company', 'Scentsx', '443.127 DATA 2026-10-12; 443.133 B'),
  ('1222', 'party', '2410-00-004', NULL, 'Laura Munoz', NULL::uuid, 'other', 'Laura — PNC personal', '443.127 DATA 2026-10-12; 443.133 B'),
  ('3088', 'party', '2410-00-004', NULL, 'Laura Munoz', NULL::uuid, 'other', 'Laura — Citi personal', '443.127 DATA 2026-10-12; 443.133 B'),
  ('7180', 'party', '2410-00-004', NULL, 'Laura Munoz', NULL::uuid, 'other', 'Laura — Bank of America personal', '443.127 DATA 2026-10-12; 443.133 B'),
  ('1993', 'party', NULL, NULL, NULL, 'ec94b6b0-cdc4-4f86-843c-ae615d177885'::uuid, 'other', 'Alberto''s wife — loan from vendor Alberto Lozano', 'owner 2026-10-12 14:29 CT; 443.133 B')
),
resolved AS (
  SELECT u.id AS opco, m.card, m.kind, m.acct, m.purpose, m.relationship, m.label, m.ruling,
         CASE WHEN m.kind = 'party'
              THEN coalesce((SELECT v.id FROM vend v WHERE v.id = m.vendor_id),
                            (SELECT v.id FROM vend v WHERE v.vendor_name = m.vendor_name LIMIT 1))
         END AS party_vendor_id
    FROM m CROSS JOIN usmca u
)
INSERT INTO integrations.relay_company_cards
  (operating_company_id, card_last4, label, source_hint, is_active, funding_kind, funding_account_number, funding_system_purpose,
   party_vendor_id, party_relationship, owner_ruling)
SELECT r.opco, r.card, r.label, 'owner card map (443.133 B)', true, r.kind, r.acct, r.purpose, r.party_vendor_id,
       CASE WHEN r.kind = 'party' THEN r.relationship END, r.ruling
  FROM resolved r
 WHERE r.kind <> 'party' OR r.party_vendor_id IS NOT NULL
ON CONFLICT (operating_company_id, card_last4) DO UPDATE
   SET funding_kind = EXCLUDED.funding_kind,
       funding_account_number = EXCLUDED.funding_account_number,
       funding_system_purpose = EXCLUDED.funding_system_purpose,
       party_vendor_id = EXCLUDED.party_vendor_id,
       party_relationship = EXCLUDED.party_relationship,
       owner_ruling = EXCLUDED.owner_ruling,
       label = coalesce(integrations.relay_company_cards.label, EXCLUDED.label),
       updated_at = now()
 WHERE integrations.relay_company_cards.funding_kind IS NULL;

-- 5. Schema drift found on the way (restates prod, no-op there): 202615461200 added the wider file_links CHECK
--    (chk_file_links_entity_type_widened_related_party_loan, which allows 'related_party_loan') but never dropped the
--    narrower chk_file_links_entity_type_widened_invoice_dispute. Prod has only the wider one; a fresh database kept both,
--    so every paid-direct loan document (the party deposit's loan note) was refused there. Drop the narrower one only when
--    the wider one exists.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_file_links_entity_type_widened_related_party_loan'
               AND conrelid = 'docs.file_links'::regclass)
     AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_file_links_entity_type_widened_invoice_dispute'
               AND conrelid = 'docs.file_links'::regclass) THEN
    ALTER TABLE docs.file_links DROP CONSTRAINT chk_file_links_entity_type_widened_invoice_dispute;
  END IF;
END$$;

COMMIT;

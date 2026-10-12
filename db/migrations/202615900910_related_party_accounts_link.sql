-- 202615900910_related_party_accounts_link.sql
-- LEAD 443.134 #1 (owner standing rule: ONE running "Due to / from <party>" account per related party, created by the app).
-- accounting.related_party_accounts is the durable link related party (vendor) -> its one running account. It is written
-- only by ensureRelatedPartyAccount (apps/backend/src/accounting/related-party-loan-posting/party-account.service.ts), which
-- numbers the account under 2410 with the allocator and records this row in the same transaction. Before this the party
-- was linked to its account only by NAME ("Due to / from <party>") and by the owner's Relay card map, so a party without a
-- card row (vendor Alberto Lozano, card 1993) could never get an account through the app.
-- Backfill: the 4 existing 2410-00-00N accounts, from the owner's card map (integrations.relay_company_cards party rows:
-- party_vendor_id + funding_account_number) — derived from existing data, one row per vendor. Apply-twice safe.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS accounting.related_party_accounts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  uuid NOT NULL REFERENCES org.companies(id),
  party_vendor_id       uuid NOT NULL,
  account_id            uuid NOT NULL,
  created_by_user_id    uuid REFERENCES identity.users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT related_party_accounts_vendor_same_company_fk
    FOREIGN KEY (operating_company_id, party_vendor_id) REFERENCES mdata.vendors (operating_company_id, id),
  CONSTRAINT related_party_accounts_account_same_company_fk
    FOREIGN KEY (operating_company_id, account_id) REFERENCES catalogs.accounts (operating_company_id, id),
  CONSTRAINT related_party_accounts_one_per_party_uk UNIQUE (operating_company_id, party_vendor_id),
  CONSTRAINT related_party_accounts_one_party_per_account_uk UNIQUE (operating_company_id, account_id)
);
COMMENT ON TABLE accounting.related_party_accounts IS
  'LEAD 443.134 #1 — one running "Due to / from <party>" account per related party (vendor), written only by ensureRelatedPartyAccount.';

ALTER TABLE accounting.related_party_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting.related_party_accounts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS related_party_accounts_entity_scope ON accounting.related_party_accounts;
CREATE POLICY related_party_accounts_entity_scope ON accounting.related_party_accounts
  FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid)
  WITH CHECK (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid);
GRANT SELECT, INSERT ON accounting.related_party_accounts TO ih35_app;

DO $audit$
BEGIN
  IF to_regprocedure('audit.tg_audit_row()') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_audit_related_party_accounts ON accounting.related_party_accounts';
    EXECUTE 'CREATE TRIGGER trg_audit_related_party_accounts AFTER INSERT OR UPDATE OR DELETE ON accounting.related_party_accounts
             FOR EACH ROW EXECUTE FUNCTION audit.tg_audit_row()';
  END IF;
END
$audit$;

-- Backfill the existing party accounts from the owner's card map (one row per vendor; an account named by two vendors is
-- left out rather than guessed).
DO $backfill$
BEGIN
  IF to_regclass('integrations.relay_company_cards') IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO accounting.related_party_accounts (operating_company_id, party_vendor_id, account_id)
  SELECT DISTINCT ON (m.operating_company_id, m.party_vendor_id) m.operating_company_id, m.party_vendor_id, a.id
    FROM integrations.relay_company_cards m
    JOIN catalogs.accounts a
      ON a.operating_company_id = m.operating_company_id AND a.account_number = m.funding_account_number
     AND a.deactivated_at IS NULL
    JOIN mdata.vendors v ON v.operating_company_id = m.operating_company_id AND v.id = m.party_vendor_id
   WHERE m.funding_kind = 'party' AND m.party_vendor_id IS NOT NULL AND m.funding_account_number IS NOT NULL
     AND m.voided_at IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM integrations.relay_company_cards m2
        WHERE m2.operating_company_id = m.operating_company_id AND m2.funding_kind = 'party'
          AND m2.funding_account_number = m.funding_account_number AND m2.voided_at IS NULL
          AND m2.party_vendor_id IS DISTINCT FROM m.party_vendor_id)
   ORDER BY m.operating_company_id, m.party_vendor_id, a.id
  ON CONFLICT DO NOTHING;
END
$backfill$;

COMMIT;

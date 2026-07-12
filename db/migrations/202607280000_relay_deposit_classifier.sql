-- [HOLD-FOR-JORGE — FINANCIAL] Relay deposit-funding CLASSIFIER + review queue (Part B, storage ONLY).
--
-- *** DO NOT MERGE. DO NOT RUN ON PROD. *** BUILT-AND-HELD per Jorge's instruction: this creates new
-- tables in a financial-cluster area (constitution §1.4) — run ONLY on a Neon branch by Jorge's hand,
-- then ledger-backfilled so prod db:migrate skips it.
--
-- SCOPE (approved 2026-07-12, non-blocking): store every Relay ACCOUNT-FUNDING deposit (the CSV
-- `type=deposit` rows — money put INTO the Relay wallet, NOT fuel pumped), parse the funding card's
-- last-4 from the deposit Note ("9104. Card deposit."), and CLASSIFY each deposit against an
-- OWNER-EDITABLE company-card set. Company-sourced deposits are flagged for bank/card reconciliation;
-- external/unknown-card deposits route to an owner-review queue. **DISPLAY ONLY — nothing posts.**
--
-- WHAT THIS DOES NOT DO (still HOLD-FOR-JORGE, needs owner card-names + accounting sign-off):
--   * NO GL/JE posting. NO booking of company deposits as company cash. NO booking of external
--     deposits as Loan-from-Owner / Capital-Contribution. posted_to_gl stays false everywhere.
--   * Does NOT auto-label an unmatched card "personal" — a company card never connected to the bank
--     feed would also be absent. Unmatched = 'unclassified', pending owner identification.
--   * Three layers stay separate and are NEVER summed: fuel pumped (type=code, ~$569,502.99) vs
--     funded into Relay (type=deposit settled, ~$590,053.13) vs paid to Relay from the bank
--     (banking.bank_transactions, ~$708,598.48). See docs/trackers/RELAY-DEPOSIT-FUNDING-RECON-2026-07-12.md.
--
-- Money stored as *_cents integers (converted at ingest time in the backend service).
-- Idempotent (CREATE IF NOT EXISTS / DO blocks), atomic, additive-only, void-not-delete.

BEGIN;

-- ── 1. integrations schema already exists + grant-covered; re-assert USAGE defensively ──
GRANT USAGE ON SCHEMA integrations TO ih35_app;

-- ── 2. integrations.relay_company_cards — OWNER-EDITABLE set of cards confirmed to belong to the
--       operating company. A deposit funded by a card in this set classifies as 'company'; any other
--       card is 'unclassified' until the owner adds it here (as company) or books it as a loan/capital
--       source elsewhere. Seeded with the three LIVE-VERIFIED company cards for TRANSP (5007 Amex,
--       9104 & 9869 WF debit on checking …6103 — verified vs prod banking.bank_transactions). ──
CREATE TABLE IF NOT EXISTS integrations.relay_company_cards (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  uuid NOT NULL REFERENCES org.companies(id),
  card_last4            text NOT NULL CHECK (card_last4 ~ '^[0-9]{4}$'),
  label                 text NULL,                 -- e.g. 'Amex Platinum', 'WF debit / checking 6103'
  source_hint           text NULL,                 -- optional free-text: which bank/card account
  is_active             boolean NOT NULL DEFAULT true,
  voided_at             timestamptz NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- One row per (company, card) regardless of active state, so the owner can toggle a card active/inactive
-- via a clean upsert (ON CONFLICT) rather than accumulating duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS uq_relay_company_cards_opco_card
  ON integrations.relay_company_cards (operating_company_id, card_last4);

-- Seed the three verified TRANSP company cards (idempotent). TRANSP operating_company_id is fixed.
-- FK-SAFE for a fresh CI DB (built from 0001, where TRANSP does not exist): INSERT ... SELECT guarded
-- by EXISTS on org.companies, so on a fresh/empty DB this seeds 0 rows instead of violating the FK
-- (CLAUDE.md §2 landmine: db:migrate runs on a fresh DB in CI — never fail on absent synced data).
INSERT INTO integrations.relay_company_cards (operating_company_id, card_last4, label, source_hint)
SELECT v.opco, v.card, v.label, v.hint
FROM (VALUES
  ('91e0bf0a-133f-4ce8-a734-2586cfa66d96'::uuid, '5007', 'Amex Business Platinum', 'live-verified vs banking.bank_transactions'),
  ('91e0bf0a-133f-4ce8-a734-2586cfa66d96'::uuid, '9104', 'WF debit — checking 6103', 'live-verified vs banking.bank_transactions'),
  ('91e0bf0a-133f-4ce8-a734-2586cfa66d96'::uuid, '9869', 'WF debit — checking 6103', 'live-verified vs banking.bank_transactions')
) AS v(opco, card, label, hint)
WHERE EXISTS (SELECT 1 FROM org.companies c WHERE c.id = v.opco)
ON CONFLICT DO NOTHING;

-- ── 3. integrations.relay_deposits — one row per Relay deposit id (type=deposit). Stores the funding
--       card last-4 and the resolved classification. classification is a stored snapshot recomputed on
--       ingest; the review queue reads it. External deposits never post — they wait for the owner. ──
CREATE TABLE IF NOT EXISTS integrations.relay_deposits (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id      uuid NOT NULL REFERENCES org.companies(id),

  deposit_id                text NOT NULL,          -- Relay row `id` (txn_...), idempotency key
  relay_created_at          timestamptz NOT NULL,
  status                    text NOT NULL,          -- 'settled' | 'canceled' (canceled = NOT money)
  total_amount_cents        bigint NOT NULL,        -- total funded (settled) — cents

  funding_card_last4        text NULL,              -- parsed from the deposit Note ("9104. Card deposit.")
  note_raw                  text NULL,              -- the verbatim Note (evidence)

  -- Resolved classification snapshot (recomputed each ingest against relay_company_cards):
  --   'company'      — funding card is in the owner-confirmed company-card set → reconcile to bank
  --   'unclassified' — funding card not in the set → owner review queue (NOT auto-"personal")
  --   'canceled'     — canceled pre-auth, not money, excluded from spend
  classification            text NOT NULL DEFAULT 'unclassified'
                            CHECK (classification IN ('company','unclassified','canceled')),

  -- Design-only reconciliation link (never posts): a bank/card outflow this deposit ties to.
  matched_bank_transaction_id uuid NULL REFERENCES banking.bank_transactions(id) ON DELETE SET NULL,

  raw_payload               jsonb NOT NULL,
  ingest_source             text NOT NULL DEFAULT 'csv_import'
                            CHECK (ingest_source IN ('daily_pull','webhook','csv_import')),

  -- HELD posting placeholder — always false. Booking (company cash vs Loan-from-Owner / Capital) is
  -- the deferred financial follow-up; never set true by this classifier path.
  posted_to_gl              boolean NOT NULL DEFAULT false,

  is_active                 boolean NOT NULL DEFAULT true,
  voided_at                 timestamptz NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_relay_deposits_company_deposit
  ON integrations.relay_deposits (operating_company_id, deposit_id);

CREATE INDEX IF NOT EXISTS idx_relay_deposits_opco_classification
  ON integrations.relay_deposits (operating_company_id, classification)
  WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_relay_deposits_card
  ON integrations.relay_deposits (operating_company_id, funding_card_last4)
  WHERE is_active;

-- ── 4. FORCED entity-scoped RLS (canonical predicate) on both new tables ──
ALTER TABLE integrations.relay_company_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations.relay_company_cards FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS relay_company_cards_entity_select ON integrations.relay_company_cards;
DROP POLICY IF EXISTS relay_company_cards_entity_write  ON integrations.relay_company_cards;
CREATE POLICY relay_company_cards_entity_select ON integrations.relay_company_cards FOR SELECT
  USING (identity.is_lucia_bypass()
         OR operating_company_id::text = current_setting('app.operating_company_id', true));
CREATE POLICY relay_company_cards_entity_write ON integrations.relay_company_cards FOR ALL
  USING (identity.is_lucia_bypass()
         OR (operating_company_id::text = current_setting('app.operating_company_id', true)
             AND identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum,'Administrator'::identity.role_enum])))
  WITH CHECK (identity.is_lucia_bypass()
         OR (operating_company_id::text = current_setting('app.operating_company_id', true)
             AND identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum,'Administrator'::identity.role_enum])));

ALTER TABLE integrations.relay_deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations.relay_deposits FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS relay_deposits_entity_select ON integrations.relay_deposits;
DROP POLICY IF EXISTS relay_deposits_entity_write  ON integrations.relay_deposits;
CREATE POLICY relay_deposits_entity_select ON integrations.relay_deposits FOR SELECT
  USING (identity.is_lucia_bypass()
         OR operating_company_id::text = current_setting('app.operating_company_id', true));
CREATE POLICY relay_deposits_entity_write ON integrations.relay_deposits FOR ALL
  USING (identity.is_lucia_bypass()
         OR (operating_company_id::text = current_setting('app.operating_company_id', true)
             AND identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum,'Administrator'::identity.role_enum])))
  WITH CHECK (identity.is_lucia_bypass()
         OR (operating_company_id::text = current_setting('app.operating_company_id', true)
             AND identity.current_user_role() = ANY (ARRAY['Owner'::identity.role_enum,'Administrator'::identity.role_enum])));

-- ── 5. Grants to ih35_app runtime role. NO DELETE (void-not-delete via is_active/voided_at). ──
GRANT SELECT, INSERT, UPDATE ON integrations.relay_company_cards TO ih35_app;
GRANT SELECT, INSERT, UPDATE ON integrations.relay_deposits TO ih35_app;
REVOKE DELETE ON integrations.relay_company_cards FROM ih35_app;
REVOKE DELETE ON integrations.relay_deposits FROM ih35_app;

COMMIT;

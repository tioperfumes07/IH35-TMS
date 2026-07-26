-- [HOLD-FOR-JORGE — FINANCIAL CLUSTER] DO NOT RUN ON PROD — run ONLY on a Neon branch by GUARD/owner
-- hand, then ledger-backfill so prod db:migrate skips it.
--
-- CANONICAL-CHECK: intercompany_entity_pair. banking.intercompany_entity_pairs is a CONFIGURATION
-- map (entity + counterparty -> which catalogs.accounts row is that entity's intercompany control
-- account), NOT a money ledger. It holds no amount column and no balance. Money lives in
-- accounting.journal_entries via the shared poster; the reciprocal legs themselves live in
-- banking.transfers. Nothing here duplicates a money ledger — it replaces the vendor/customer NAME
-- matching that consolidated-statements.service.ts falls back on today.
--
-- BANK-DOM-05 — intercompany transfers: owner-editable entity-pair map + reciprocal transfer legs.
--
-- FINDING: BANK-DOM-05 (P2 · multi-entity). banking/transfers.service.ts binds BOTH legs to a single
-- operating_company_id, so a TRANSP<->USMCA or TRANSP<->TRK movement is unrepresentable.
--
-- PROD TRUTH verified on br-fancy-credit-akjnd07a 2026-07-26 (bypass_rls=lucia, positive control
-- mdata.vendors=2789):
--   * org.companies: TRANSP, TRK, USMCA all is_active=true (USMCA is the ACTIVE test entity)
--   * banking.transfers = 0 rows  -> no backfill, no data risk
--   * banking.intercompany_entity_pairs = MISSING
--   * catalogs.accounts: ONLY USMCA carries an intercompany account —
--       8000 'Inter-company - IH35 Transportation', Asset/Other Current Assets,
--       system_purpose = 'intercompany_ih35'   (seeded by 202606300060_usmca_coa_seed.sql:66)
--     TRANSP and TRK carry ZERO intercompany accounts.
--
-- OWNER RULING 2026-07-26: mirror the EXISTING 8000 pattern — one "Inter-company - <Counterparty>"
-- account per entity per counterparty, system_purpose 'intercompany_<x>'. Do NOT introduce a parallel
-- "Due to / Due from" convention; a second style alongside 8000 is a C2 split-brain. Prod decides the
-- pattern. Enforced statically by scripts/verify-bank-dom-05-intercompany-reciprocal-legs.mjs (A5).
--
-- ACCOUNT CREATION IS NOT DONE HERE. GUARD applies the intercompany accounts directly on Neon so they
-- are live for the USMCA/TRK/TRANSP test. This migration therefore resolves accounts by
-- system_purpose and seeds ONLY pairs whose account provably exists — it never invents an account
-- number. Re-running after GUARD adds accounts picks them up (idempotent, ON CONFLICT DO NOTHING).
--
-- Idempotent (DO + IF NOT EXISTS + ON CONFLICT). Additive only — no DROP, no DELETE, no UPDATE of
-- existing rows. Dynamic org.companies resolution — NO hardcoded UUID (a fresh-from-0001 CI DB seeds
-- gen_random_uuid() companies). Validated apply-twice on a local throwaway Postgres 16.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The owner-editable entity-pair map.
--    consolidated-statements.service.ts states in its own header that intercompany identification
--    "reuses the vendor/customer name-identity pattern ... there is no owner-editable entity-pair map
--    table in the schema yet". This is that table. Elimination and reciprocal-leg resolution become
--    deterministic instead of name-matched.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS banking.intercompany_entity_pairs (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id     uuid NOT NULL REFERENCES org.companies(id),
  counterparty_company_id  uuid NOT NULL REFERENCES org.companies(id),
  intercompany_account_id  uuid NOT NULL REFERENCES catalogs.accounts(id),
  notes                    text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  created_by_user_id       uuid REFERENCES identity.users(id),
  deactivated_at           timestamptz,
  deactivated_by_user_id   uuid REFERENCES identity.users(id),
  CONSTRAINT ck_intercompany_pair_not_self CHECK (operating_company_id <> counterparty_company_id)
);

COMMENT ON TABLE banking.intercompany_entity_pairs IS
  'BANK-DOM-05. Owner-editable map: for entity A transacting with counterparty B, which catalogs.accounts row is A''s intercompany control account. Replaces vendor/customer NAME matching in consolidated-statements.service.ts. void-not-delete: deactivate, never DELETE.';

-- One ACTIVE mapping per (entity, counterparty). Deactivated history is retained (void-not-delete).
CREATE UNIQUE INDEX IF NOT EXISTS uq_intercompany_pair_active
  ON banking.intercompany_entity_pairs (operating_company_id, counterparty_company_id)
  WHERE deactivated_at IS NULL;

CREATE INDEX IF NOT EXISTS ix_intercompany_pair_counterparty
  ON banking.intercompany_entity_pairs (counterparty_company_id);

ALTER TABLE banking.intercompany_entity_pairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE banking.intercompany_entity_pairs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS intercompany_pairs_company_scope ON banking.intercompany_entity_pairs;
CREATE POLICY intercompany_pairs_company_scope ON banking.intercompany_entity_pairs
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  )
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

GRANT SELECT, INSERT, UPDATE ON banking.intercompany_entity_pairs TO ih35_app;
REVOKE DELETE ON banking.intercompany_entity_pairs FROM ih35_app;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Reciprocal-leg columns on banking.transfers.
--    STMT-3 locks "read-only roll-up with elimination, NEVER shared rows" — so an intercompany
--    movement is TWO rows, one in each entity's own book, joined by intercompany_transfer_group_id.
--    Both columns are NULLable: an ordinary intra-entity transfer leaves them NULL and is unaffected.
-- ─────────────────────────────────────────────────────────────────────────────
-- The group is a REAL PARENT ROW, not a bare uuid. A grouping id with no table to point at is
-- exactly the C13 defect class (an id Postgres cannot put a FOREIGN KEY on), so the two legs FK into
-- this table and orphaned/dangling group ids become structurally impossible. Deliberately carries NO
-- amount and NO balance — the money lives on the legs and in accounting.journal_entries — so this is
-- a linkage row, not a second money ledger (see the CANONICAL-CHECK block at the top of this file).
-- operating_company_id IS the initiating entity — it is the row's owning entity and the canonical
-- scoping column every business table must carry (entity-isolation guard / §4). The counterparty is
-- recorded alongside it and may READ the row (policy below), but ownership is unambiguous.
CREATE TABLE IF NOT EXISTS banking.intercompany_transfer_groups (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id     uuid NOT NULL REFERENCES org.companies(id),
  counterparty_company_id  uuid NOT NULL REFERENCES org.companies(id),
  created_at               timestamptz NOT NULL DEFAULT now(),
  created_by_user_id       uuid REFERENCES identity.users(id),
  CONSTRAINT ck_ic_group_two_distinct_entities CHECK (operating_company_id <> counterparty_company_id)
);

COMMENT ON TABLE banking.intercompany_transfer_groups IS
  'BANK-DOM-05. Parent of the two reciprocal banking.transfers legs of one intercompany movement. Linkage only — no amount, no balance.';

ALTER TABLE banking.intercompany_transfer_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE banking.intercompany_transfer_groups FORCE ROW LEVEL SECURITY;

-- Spans two books by construction, so EITHER party may read its own movement.
DROP POLICY IF EXISTS intercompany_groups_either_party_scope ON banking.intercompany_transfer_groups;
CREATE POLICY intercompany_groups_either_party_scope ON banking.intercompany_transfer_groups
  USING (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
    OR counterparty_company_id::text = current_setting('app.operating_company_id', true)
  )
  -- WRITE is owner-only: an entity may create its OWN intercompany movement, never one booked
  -- under another entity's name. Reads are two-party; writes are not.
  WITH CHECK (
    identity.is_lucia_bypass()
    OR operating_company_id::text = current_setting('app.operating_company_id', true)
  );

GRANT SELECT, INSERT ON banking.intercompany_transfer_groups TO ih35_app;
REVOKE DELETE, UPDATE ON banking.intercompany_transfer_groups FROM ih35_app;

ALTER TABLE banking.transfers
  ADD COLUMN IF NOT EXISTS intercompany_transfer_group_id uuid REFERENCES banking.intercompany_transfer_groups(id),
  ADD COLUMN IF NOT EXISTS counterparty_company_id        uuid REFERENCES org.companies(id),
  ADD COLUMN IF NOT EXISTS intercompany_leg               text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_transfers_intercompany_leg'
  ) THEN
    ALTER TABLE banking.transfers
      ADD CONSTRAINT ck_transfers_intercompany_leg
      CHECK (intercompany_leg IS NULL OR intercompany_leg IN ('initiator', 'counterparty'));
  END IF;

  -- The three intercompany columns travel together: either all NULL (ordinary transfer) or all set.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_transfers_intercompany_complete'
  ) THEN
    ALTER TABLE banking.transfers
      ADD CONSTRAINT ck_transfers_intercompany_complete
      CHECK (
        (intercompany_transfer_group_id IS NULL AND counterparty_company_id IS NULL AND intercompany_leg IS NULL)
        OR
        (intercompany_transfer_group_id IS NOT NULL AND counterparty_company_id IS NOT NULL AND intercompany_leg IS NOT NULL)
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_transfers_intercompany_group
  ON banking.transfers (intercompany_transfer_group_id)
  WHERE intercompany_transfer_group_id IS NOT NULL;

COMMENT ON COLUMN banking.transfers.intercompany_transfer_group_id IS
  'BANK-DOM-05. Joins the two reciprocal legs of one intercompany movement. NULL for ordinary intra-entity transfers.';
COMMENT ON COLUMN banking.transfers.counterparty_company_id IS
  'BANK-DOM-05. The OTHER entity in an intercompany movement. NULL for ordinary intra-entity transfers.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Seed the pair map from accounts that PROVABLY EXIST (never invent an account number).
--    Today that is exactly one: USMCA -> TRANSP via system_purpose 'intercompany_ih35' (account 8000).
--    Once GUARD applies the reciprocal accounts on Neon with system_purpose 'intercompany_<code>',
--    re-running this migration seeds those pairs too. Dynamic resolution, no hardcoded UUIDs.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_pairs CONSTANT text[][] := ARRAY[
    -- [owning entity code, counterparty code, account system_purpose]
    ['USMCA',  'TRANSP', 'intercompany_ih35'],    -- EXISTS on prod today (8000)
    ['TRANSP', 'USMCA',  'intercompany_usmca'],   -- pending GUARD Neon apply
    ['TRANSP', 'TRK',    'intercompany_trk'],     -- pending GUARD Neon apply
    ['TRK',    'TRANSP', 'intercompany_transp'],  -- pending GUARD Neon apply
    ['TRK',    'USMCA',  'intercompany_usmca'],   -- pending GUARD Neon apply
    ['USMCA',  'TRK',    'intercompany_trk']      -- pending GUARD Neon apply
  ];
  v_row      text[];
  v_owner    uuid;
  v_counter  uuid;
  v_account  uuid;
  v_seeded   int := 0;
BEGIN
  FOREACH v_row SLICE 1 IN ARRAY v_pairs LOOP
    SELECT id INTO v_owner   FROM org.companies WHERE code = v_row[1];
    SELECT id INTO v_counter FROM org.companies WHERE code = v_row[2];
    IF v_owner IS NULL OR v_counter IS NULL THEN
      CONTINUE;  -- entity absent in this database (fresh CI seed) — skip, never fail
    END IF;

    SELECT id INTO v_account
      FROM catalogs.accounts
     WHERE operating_company_id = v_owner
       AND system_purpose = v_row[3]
       AND deactivated_at IS NULL
     LIMIT 1;

    IF v_account IS NULL THEN
      RAISE NOTICE 'BANK-DOM-05: no account with system_purpose % for % — pair %->% left unseeded (GUARD applies the account, then re-run)',
        v_row[3], v_row[1], v_row[1], v_row[2];
      CONTINUE;
    END IF;

    INSERT INTO banking.intercompany_entity_pairs
      (operating_company_id, counterparty_company_id, intercompany_account_id, notes)
    VALUES
      (v_owner, v_counter, v_account, format('BANK-DOM-05 seed: %s -> %s via %s', v_row[1], v_row[2], v_row[3]))
    ON CONFLICT DO NOTHING;

    v_seeded := v_seeded + 1;
  END LOOP;

  RAISE NOTICE 'BANK-DOM-05: % intercompany pair(s) resolved and seeded', v_seeded;
END $$;

-- [HOLD-FOR-JORGE — TIER 1 FINANCIAL] FUEL-03 — fuel-card overage engine (evaluate → flag → approve → receivable).
--
-- *** DO NOT RUN ON PROD via db:migrate. Owner/agent Neon-applies then ledger-backfills. ***
--
-- ROOT CAUSE: fuel.fuel_card_overage_policies existed but no engine evaluated spend vs cap; over-cap
--   events sat unprocessed — no receivable, no review flag, no linkage.
--
-- OWNER A3/A3b/A3c (2026-07-26): approve-then-recover; dedicated fuel_overage_receivable (FUEL-04);
--   contract authority (signed_on_paper + scan) required before a driver receivable; DEFAULT =
--   pending_review — never auto-charge a driver without signed contract authority.
--
-- NO NEW GL MATH in this migration. Posting reuses createJournalEntry + resolveRoleAccount in code.
-- RENUMBER 2026-07-27 (BAND FIX): was 202609250000 then 202609270000 — Cursor band is 20260901xxxx–20260910xxxx.
-- Body unchanged; Neon dual-ledger stamp for 202609090010_*.

BEGIN;

-- §1 — Overage event subledger (one active row per fuel transaction).
DO $$
BEGIN
  IF to_regclass('org.companies') IS NULL THEN
    RAISE NOTICE 'fuel_card_overage_events: org.companies absent — skipping';
  ELSE
    CREATE TABLE IF NOT EXISTS fuel.fuel_card_overage_events (
      id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      operating_company_id        uuid NOT NULL REFERENCES org.companies(id),
      fuel_transaction_id         uuid NOT NULL,
      driver_id                   uuid NULL,
      unit_id                     uuid NULL,
      policy_id                   uuid NULL,
      overage_cents               bigint NOT NULL CHECK (overage_cents > 0),
      total_cents                 bigint NOT NULL CHECK (total_cents > 0),
      overage_rule                text NOT NULL CHECK (overage_rule IN ('non_fuel_purchase', 'over_transaction_limit')),
      status                      text NOT NULL DEFAULT 'pending_review'
                                    CHECK (status IN ('pending_review', 'approved', 'posted', 'company_variance', 'voided')),
      review_reason               text NULL,
      has_contract_authority      boolean NOT NULL DEFAULT false,
      journal_entry_id            uuid NULL,
      approved_at                 timestamptz NULL,
      approved_by_user_id         uuid NULL,
      voided_at                   timestamptz NULL,
      voided_by_user_id           uuid NULL,
      void_reason                 text NULL,
      created_at                  timestamptz NOT NULL DEFAULT now(),
      updated_at                  timestamptz NOT NULL DEFAULT now(),
      created_by_user_id          uuid NULL
    );

    IF to_regclass('fuel.fuel_transactions') IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM pg_constraint
         WHERE conname = 'fuel_card_overage_events_fuel_txn_fkey'
           AND conrelid = 'fuel.fuel_card_overage_events'::regclass
       ) THEN
      ALTER TABLE fuel.fuel_card_overage_events
        ADD CONSTRAINT fuel_card_overage_events_fuel_txn_fkey
        FOREIGN KEY (fuel_transaction_id) REFERENCES fuel.fuel_transactions(id);
    END IF;

    IF to_regclass('fuel.fuel_card_overage_policies') IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM pg_constraint
         WHERE conname = 'fuel_card_overage_events_policy_fkey'
           AND conrelid = 'fuel.fuel_card_overage_events'::regclass
       ) THEN
      ALTER TABLE fuel.fuel_card_overage_events
        ADD CONSTRAINT fuel_card_overage_events_policy_fkey
        FOREIGN KEY (policy_id) REFERENCES fuel.fuel_card_overage_policies(id);
    END IF;

    IF to_regclass('mdata.drivers') IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM pg_constraint
         WHERE conname = 'fuel_card_overage_events_driver_fkey'
           AND conrelid = 'fuel.fuel_card_overage_events'::regclass
       ) THEN
      ALTER TABLE fuel.fuel_card_overage_events
        ADD CONSTRAINT fuel_card_overage_events_driver_fkey
        FOREIGN KEY (driver_id) REFERENCES mdata.drivers(id);
    END IF;

    IF to_regclass('accounting.journal_entries') IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM pg_constraint
         WHERE conname = 'fuel_card_overage_events_je_fkey'
           AND conrelid = 'fuel.fuel_card_overage_events'::regclass
       ) THEN
      ALTER TABLE fuel.fuel_card_overage_events
        ADD CONSTRAINT fuel_card_overage_events_je_fkey
        FOREIGN KEY (journal_entry_id) REFERENCES accounting.journal_entries(id);
    END IF;

    CREATE UNIQUE INDEX IF NOT EXISTS uq_fuel_card_overage_events_active_txn
      ON fuel.fuel_card_overage_events (operating_company_id, fuel_transaction_id)
      WHERE voided_at IS NULL;

    CREATE INDEX IF NOT EXISTS idx_fuel_card_overage_events_status
      ON fuel.fuel_card_overage_events (operating_company_id, status)
      WHERE voided_at IS NULL;

    ALTER TABLE fuel.fuel_card_overage_events ENABLE ROW LEVEL SECURITY;
    ALTER TABLE fuel.fuel_card_overage_events FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS fuel_card_overage_events_select ON fuel.fuel_card_overage_events;
    DROP POLICY IF EXISTS fuel_card_overage_events_write ON fuel.fuel_card_overage_events;
    CREATE POLICY fuel_card_overage_events_select ON fuel.fuel_card_overage_events FOR SELECT
      USING (identity.is_lucia_bypass()
             OR operating_company_id::text = current_setting('app.operating_company_id', true));
    CREATE POLICY fuel_card_overage_events_write ON fuel.fuel_card_overage_events FOR ALL
      USING (identity.is_lucia_bypass()
             OR operating_company_id::text = current_setting('app.operating_company_id', true))
      WITH CHECK (identity.is_lucia_bypass()
             OR operating_company_id::text = current_setting('app.operating_company_id', true));

    GRANT SELECT, INSERT, UPDATE ON fuel.fuel_card_overage_events TO ih35_app;
    REVOKE DELETE ON fuel.fuel_card_overage_events FROM ih35_app;
  END IF;
END
$$;

-- §2 — Reverse link on fuel transaction (Rule 14).
DO $$
BEGIN
  IF to_regclass('fuel.fuel_transactions') IS NOT NULL THEN
    ALTER TABLE fuel.fuel_transactions
      ADD COLUMN IF NOT EXISTS overage_event_id uuid NULL;

    IF to_regclass('fuel.fuel_card_overage_events') IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM pg_constraint
         WHERE conname = 'fuel_transactions_overage_event_fkey'
           AND conrelid = 'fuel.fuel_transactions'::regclass
       ) THEN
      ALTER TABLE fuel.fuel_transactions
        ADD CONSTRAINT fuel_transactions_overage_event_fkey
        FOREIGN KEY (overage_event_id) REFERENCES fuel.fuel_card_overage_events(id);
    END IF;

    CREATE INDEX IF NOT EXISTS idx_fuel_txn_overage_event
      ON fuel.fuel_transactions (overage_event_id)
      WHERE overage_event_id IS NOT NULL;
  END IF;
END
$$;

-- §3 — Engine flag DEFAULT OFF (evaluate + flag only; GL post is a separate gate in code).
DO $$
BEGIN
  IF to_regclass('lib.feature_flags') IS NOT NULL THEN
    INSERT INTO lib.feature_flags (flag_key, description, default_enabled, rollout_pct)
    VALUES (
      'FUEL_CARD_OVERAGE_ENGINE_ENABLED',
      'FUEL-03: evaluate fuel-card spend vs fuel.fuel_card_overage_policies; create '
        || 'fuel.fuel_card_overage_events (pending_review by default). Never auto-charge a driver '
        || 'without signed contract authority. Receivable JE posts only after manager approval + '
        || 'FUEL_CARD_OVERAGE_GL_POSTING_ENABLED. Per-entity override only.',
      false,
      0
    )
    ON CONFLICT (flag_key) DO NOTHING;

    INSERT INTO lib.feature_flags (flag_key, description, default_enabled, rollout_pct)
    VALUES (
      'FUEL_CARD_OVERAGE_GL_POSTING_ENABLED',
      'FUEL-03: when an approved overage event has contract authority, post Dr fuel_overage_receivable '
        || '/ Cr fuel expense via createJournalEntry (reuse poster resolver — no new GL math). '
        || 'Per-entity override only. OFF until owner authorizes.',
      false,
      0
    )
    ON CONFLICT (flag_key) DO NOTHING;
  END IF;
END
$$;

-- §4 — Re-assert grants (0065 pattern).
DO $$
BEGIN
  IF to_regclass('fuel.fuel_transactions') IS NOT NULL THEN
    GRANT SELECT, INSERT, UPDATE ON fuel.fuel_transactions TO ih35_app;
  END IF;
END
$$;

COMMIT;

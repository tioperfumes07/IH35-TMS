-- GO-20 slice A — banking.reconciliation_drift_alerts (docs/lockdown/GO-20-EIGHT-FEATURES.txt SLICE A).
-- "Drift means the bank says one number and the books say another. Today nothing watches for it
-- and nothing tells the owner." Additive, idempotent. A drift alert is never a posting -- resolving
-- one MAY create a journal entry elsewhere, this table only records which one, it never posts
-- itself.
--
-- Live-verified 2026-09-02: banking.reconciliation_sessions/bank_accounts already carry every
-- column the spec's WHAT EXISTS section names. No tolerance setting existed anywhere -- the spec
-- says "Tolerance lives in a setting, not a constant... Owner editable per bank account", so it is
-- added directly on banking.bank_accounts (the natural per-account home) rather than a global flag.
--
-- CANONICAL-CHECK: banking.reconciliation_matches and banking.reconciliation_sessions are the
-- canonical RECONCILIATION LEDGER (which bank rows cleared which book rows, and the session that
-- closed them). banking.reconciliation_drift_alerts is not a second ledger: it is a WATCH/ALERT
-- queue. It records that bank and books disagree beyond tolerance. Resolving an alert MAY create a
-- journal entry elsewhere (resolving_journal_entry_id is a pointer only). This table never posts,
-- never matches a transaction, and never closes a session.

BEGIN;

ALTER TABLE banking.bank_accounts
  ADD COLUMN IF NOT EXISTS drift_tolerance_cents integer NOT NULL DEFAULT 100;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_bank_accounts_drift_tolerance_nonneg'
      AND conrelid = 'banking.bank_accounts'::regclass
  ) THEN
    ALTER TABLE banking.bank_accounts
      ADD CONSTRAINT chk_bank_accounts_drift_tolerance_nonneg CHECK (drift_tolerance_cents >= 0);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS banking.reconciliation_drift_alerts (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id        uuid NOT NULL REFERENCES org.companies(id),
  bank_account_id             uuid NOT NULL REFERENCES banking.bank_accounts(id),
  reconciliation_session_id   uuid NULL REFERENCES banking.reconciliation_sessions(id),
  detected_at                 timestamptz NOT NULL DEFAULT now(),
  as_of_date                  date NOT NULL,
  drift_kind                  text NOT NULL,
  bank_balance_cents          bigint NOT NULL,
  book_balance_cents          bigint NOT NULL,
  drift_cents                 bigint NOT NULL,
  tolerance_cents             bigint NOT NULL,
  severity                    text NOT NULL,
  resolved_at                 timestamptz NULL,
  resolved_by_user_id         uuid NULL REFERENCES identity.users(id),
  resolution_note             text NULL,
  resolving_journal_entry_id  uuid NULL REFERENCES accounting.journal_entries(id),
  voided_at                   timestamptz NULL,
  voided_by_user_id           uuid NULL REFERENCES identity.users(id),
  void_reason                 text NULL,
  is_sample_data              boolean NOT NULL DEFAULT false,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_drift_alerts_kind'
      AND conrelid = 'banking.reconciliation_drift_alerts'::regclass
  ) THEN
    ALTER TABLE banking.reconciliation_drift_alerts
      ADD CONSTRAINT chk_drift_alerts_kind CHECK (drift_kind IN ('session_variance', 'live_balance', 'stale_feed'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_drift_alerts_severity'
      AND conrelid = 'banking.reconciliation_drift_alerts'::regclass
  ) THEN
    ALTER TABLE banking.reconciliation_drift_alerts
      ADD CONSTRAINT chk_drift_alerts_severity CHECK (severity IN ('warning', 'critical'));
  END IF;
END $$;

-- one open alert per account per kind
CREATE UNIQUE INDEX IF NOT EXISTS uq_drift_open_per_account_kind
  ON banking.reconciliation_drift_alerts (operating_company_id, bank_account_id, drift_kind)
  WHERE resolved_at IS NULL AND voided_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_drift_company_open
  ON banking.reconciliation_drift_alerts (operating_company_id, detected_at DESC)
  WHERE resolved_at IS NULL AND voided_at IS NULL;

DO $drift_rls$
BEGIN
  IF to_regclass('banking.reconciliation_drift_alerts') IS NULL THEN
    RETURN;
  END IF;
  EXECUTE 'ALTER TABLE banking.reconciliation_drift_alerts ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE banking.reconciliation_drift_alerts FORCE ROW LEVEL SECURITY';
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'banking' AND tablename = 'reconciliation_drift_alerts'
      AND policyname = 'reconciliation_drift_alerts_tenant'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY reconciliation_drift_alerts_tenant ON banking.reconciliation_drift_alerts
        FOR ALL
        USING (
          identity.is_lucia_bypass()
          OR operating_company_id::text = current_setting('app.operating_company_id', true)
        )
        WITH CHECK (
          identity.is_lucia_bypass()
          OR operating_company_id::text = current_setting('app.operating_company_id', true)
        )
    $policy$;
  END IF;
  EXECUTE 'GRANT SELECT, INSERT, UPDATE ON banking.reconciliation_drift_alerts TO ih35_app';
  EXECUTE 'REVOKE DELETE ON banking.reconciliation_drift_alerts FROM ih35_app';
  EXECUTE 'REVOKE ALL ON banking.reconciliation_drift_alerts FROM PUBLIC';
END
$drift_rls$;

COMMENT ON COLUMN banking.bank_accounts.drift_tolerance_cents IS
  'GO-20 slice A -- owner-editable per-account tolerance for reconciliation drift detection. Default $1.00 (100 cents). Never hard-coded in the detector.';
COMMENT ON TABLE banking.reconciliation_drift_alerts IS
  'GO-20 slice A -- a drift is not a posting. Resolving one MAY create a journal entry (resolving_journal_entry_id records which); the detector itself never posts.';

COMMIT;

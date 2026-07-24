-- [HOLD-FOR-JORGE — TIER 1 · FINANCIAL CLUSTER] DO NOT RUN ON PROD — run ONLY on a Neon branch by
-- Jorge's hand, then ledger-backfill so prod db:migrate skips it. Registered in
-- db/migrations/.held-migrations.json. Depends on 202607860000 (mirror table) applied first.
--
-- QBO-AP-BILLPAY-PULL-2 — make accounting.bill_payments idempotency key FAN-OUT-safe + register the two
-- default-OFF pull/projection flags.
--
-- WHY (fan-out): one QBO BillPayment can pay MANY bills — its Line[] carries one LinkedTxn(Bill) per
-- allocation. The projection creates ONE accounting.bill_payments row per (payment, bill) allocation
-- (bill_id is NOT NULL on that table). The existing partial unique
--   uq_bill_payments_company_qbo_bp_id (operating_company_id, qbo_bill_payment_id)
-- would collapse those N rows into one — the second allocation of the same QBO BillPayment would violate
-- it. We REPLACE it with the composite
--   uq_bill_payments_company_qbo_bp_bill (operating_company_id, qbo_bill_payment_id, bill_id)
-- which is a STRICT SUPERSET (more permissive): any set of rows unique under the 2-col key stays unique
-- under the 3-col key, so no existing prod row can newly conflict. This is ALSO the ON CONFLICT target
-- the projection upserts on, keeping re-runs idempotent, and it correctly models QBO's real many-bills
-- -per-payment shape (the outbound batch writer already stamps the same qbo_bill_payment_id on multiple
-- TMS rows, which the old 2-col key silently disallowed).
--
-- WHY (flags): register BOTH default-OFF flags so isEnabled() (single source of truth, resolved
-- per-entity via lib.feature_flag_overrides) has catalog rows. NO per-entity ON override is seeded here
-- — the pull/projection stay dark until the OWNER flips them per entity. Financial cluster; posts nothing.
--
-- Additive/idempotent. CI-safe fresh-from-0001 (bill_payments + the old index both exist by 0178;
-- lib.feature_flags seeds unconditionally). Apply-twice safe (validated on throwaway Postgres).

BEGIN;

DROP INDEX IF EXISTS accounting.uq_bill_payments_company_qbo_bp_id;
-- Fan-out-safe composite replaces the 2-col partial unique (opco, qbo_bill_payment_id, bill_id).
-- Comment kept BELOW DROP so verify-migration-application-consistency's statement splitter
-- (which does not strip -- line comments) still sees a leading DROP INDEX keyword.

CREATE UNIQUE INDEX IF NOT EXISTS uq_bill_payments_company_qbo_bp_bill
  ON accounting.bill_payments (operating_company_id, qbo_bill_payment_id, bill_id)
  WHERE qbo_bill_payment_id IS NOT NULL;

DO $$
BEGIN
  -- Register both flags DEFAULT OFF. No per-entity override seeded — owner enables later.
  IF to_regclass('lib.feature_flags') IS NOT NULL THEN
    INSERT INTO lib.feature_flags (flag_key, description, default_enabled, rollout_pct)
    VALUES
      (
        'QBO_AP_BILL_PAYMENT_MIRROR_PULL_ENABLED',
        'QBO-AP-BILLPAY-PULL Stage 1: clone QuickBooks BillPayments into the read-only mirror '
          || 'mdata.qbo_ap_bill_payments (upsert by qbo_id). Inbound reconcile-only; no GL. '
          || 'Resolved per-entity via overrides. OFF by default.',
        false,
        0
      ),
      (
        'QBO_AP_BILL_PAYMENTS_PROJECTION_ENABLED',
        'QBO-AP-BILLPAY-PULL Stage 2: fan each QBO BillPayment Line[].LinkedTxn(Bill) out into '
          || 'accounting.bill_payments (source_system=''qbo''), one row per (payment, bill) allocation, '
          || 'matched to accounting.bills by qbo_bill_id. Subledger only, NO GL posting. Unmatched '
          || 'LinkedTxn stay in the mirror (paymentsUnlinked metric). Resolved per-entity via overrides. '
          || 'OFF by default.',
        false,
        0
      )
    ON CONFLICT (flag_key) DO NOTHING;
  END IF;
END $$;

COMMIT;

-- Verification (read-only; harmless on re-run) --------------------------------------------------------
SELECT
  (SELECT count(*) FROM pg_indexes
     WHERE schemaname='accounting' AND indexname='uq_bill_payments_company_qbo_bp_bill') AS composite_index_present,
  (SELECT count(*) FROM pg_indexes
     WHERE schemaname='accounting' AND indexname='uq_bill_payments_company_qbo_bp_id') AS old_index_absent_should_be_0,
  (SELECT count(*) FROM lib.feature_flags
     WHERE flag_key IN ('QBO_AP_BILL_PAYMENT_MIRROR_PULL_ENABLED','QBO_AP_BILL_PAYMENTS_PROJECTION_ENABLED')) AS flags_registered;

-- ROLLBACK (manual, owner-gated):
--   BEGIN;
--   DROP INDEX IF EXISTS accounting.uq_bill_payments_company_qbo_bp_bill;
--   CREATE UNIQUE INDEX IF NOT EXISTS uq_bill_payments_company_qbo_bp_id
--     ON accounting.bill_payments (operating_company_id, qbo_bill_payment_id)
--     WHERE qbo_bill_payment_id IS NOT NULL;
--   -- (flag catalog rows may remain; they are SAFE-OFF without an ON override.)
--   COMMIT;

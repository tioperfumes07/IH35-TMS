-- [HOLD-FOR-JORGE — TIER 1 · FINANCIAL CLUSTER] QBO-AR-PAYMENTS-PULL-2 — register the two default-OFF
-- pull/projection flags. DO NOT RUN ON PROD. Run ONLY on a Neon branch by Jorge's hand, then
-- ledger-backfill so prod db:migrate HELD-SKIPs it. Registered in db/migrations/.held-migrations.json.
-- Depends on 202607920000 (mirror table) applied first.
--
-- WHY (no idempotency-key migration needed here, unlike QBO-AP-BILLPAY-PULL-2 / QBO-EXPENSES-PULL-2):
-- accounting.payments already carries the partial-unique uq_payments_company_qbo_payment_id
-- (operating_company_id, qbo_payment_id) from migration 0178 — the header projection's ON CONFLICT
-- target. accounting.payment_applications already carries the unique uq_payment_applications_target
-- (payment_id, target_kind, target_id) from migration 0222 — the allocation fan-out's ON CONFLICT
-- target. A QBO Payment projects to exactly ONE accounting.payments row (no fan-out at the header,
-- unlike BillPayment, which needed a 2-col -> 3-col composite-key migration); each Line[].LinkedTxn
-- (Invoice) allocation projects to one payment_applications row keyed on the existing composite. Both
-- keys are verified live on Neon br-fancy-credit-akjnd07a (2026-07-24) — no schema change required.
--
-- WHY (flags): register BOTH default-OFF flags so isEnabled() (single source of truth, resolved
-- per-entity via lib.feature_flag_overrides) has catalog rows. NO per-entity ON override is seeded here
-- — the pull/projection stay dark until the OWNER flips them per entity (build-and-HOLD). Financial
-- cluster; posts nothing (subledger only — GL stays QuickBooks' job; the posting engine additionally
-- refuses to post a qbo-sourced customer payment, QBO_CUSTOMER_PAYMENT_POST_GL_REFUSED).
--
-- Additive/idempotent. CI-safe fresh-from-0001 (lib.feature_flags seeds unconditionally). Apply-twice
-- safe (validated on throwaway Postgres).

BEGIN;

DO $$
BEGIN
  IF to_regclass('lib.feature_flags') IS NOT NULL THEN
    INSERT INTO lib.feature_flags (flag_key, description, default_enabled, rollout_pct)
    VALUES
      (
        'QBO_AR_PAYMENT_MIRROR_PULL_ENABLED',
        'QBO-AR-PAYMENTS-PULL Stage 1: clone QuickBooks Payments (Receive Payment / Deposit against an '
          || 'invoice) into the read-only mirror mdata.qbo_ar_payments (upsert by qbo_id). Inbound '
          || 'reconcile-only; no GL. Resolved per-entity via overrides. OFF by default (owner flips ON '
          || 'per-entity).',
        false,
        0
      ),
      (
        'QBO_AR_PAYMENTS_PROJECTION_ENABLED',
        'QBO-AR-PAYMENTS-PULL Stage 2/2b: project the QBO Payment mirror into accounting.payments '
          || '(qbo_payment_id set, one row per Payment) and fan each Line[].LinkedTxn(Invoice) allocation '
          || 'out into accounting.payment_applications, matched to accounting.invoices by qbo_invoice_id. '
          || 'Subledger only, NO GL posting. Unmatched customers/invoices stay in the mirror (metrics), '
          || 'never invented. Resolved per-entity via overrides. OFF by default (owner flips ON '
          || 'per-entity).',
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
     WHERE schemaname = 'accounting' AND tablename = 'payments'
       AND indexname = 'uq_payments_company_qbo_payment_id') AS header_projection_key_present,
  (SELECT count(*) FROM pg_indexes
     WHERE schemaname = 'accounting' AND tablename = 'payment_applications'
       AND indexname = 'uq_payment_applications_target') AS application_projection_key_present,
  (SELECT count(*) FROM lib.feature_flags
     WHERE flag_key IN ('QBO_AR_PAYMENT_MIRROR_PULL_ENABLED','QBO_AR_PAYMENTS_PROJECTION_ENABLED')) AS flags_registered,
  (SELECT count(*) FROM lib.feature_flag_overrides
     WHERE flag_key IN ('QBO_AR_PAYMENT_MIRROR_PULL_ENABLED','QBO_AR_PAYMENTS_PROJECTION_ENABLED')
       AND enabled = true) AS entity_overrides_on;  -- expected 0 until owner flips ON

-- ROLLBACK (manual, owner-gated):
--   DELETE FROM lib.feature_flags WHERE flag_key IN
--     ('QBO_AR_PAYMENT_MIRROR_PULL_ENABLED','QBO_AR_PAYMENTS_PROJECTION_ENABLED');
--   -- (no index/schema change made by this migration to roll back.)

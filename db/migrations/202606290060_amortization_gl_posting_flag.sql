-- FIN-21 — Prepaid amortization + fixed-asset depreciation GL posting engine.
-- BUILD-AND-HOLD (Tier-1 financial; never self-merge — §1.4). This migration ONLY seeds the unified
-- posting money flag AMORTIZATION_GL_POSTING_ENABLED (DEFAULT OFF). The schedule TABLES already exist
-- and are REUSED — no new tables:
--   accounting.prepaid_amortization_rows     (202606271610_prepaid_expenses_data_model.sql)
--   accounting.depreciation_schedule_rows    (202606281060_fixed_assets_data_model.sql)
-- With the flag OFF the FIN-21 poster is a strict no-op (zero journal entries / zero financial rows).
-- Idempotent + fresh-DB-safe.
BEGIN;

INSERT INTO lib.feature_flags (flag_key, description, default_enabled, rollout_pct)
VALUES (
  'AMORTIZATION_GL_POSTING_ENABLED',
  'FIN-21: post prepaid-expense amortization (Dr amortization expense / Cr prepaid asset) and fixed-asset depreciation (Dr depreciation expense / Cr accumulated depreciation) to the GL, one balanced JE per schedule period. Idempotent per (asset, period). DEFAULT OFF — owner-gated.',
  false,
  0
)
ON CONFLICT (flag_key) DO NOTHING;

COMMIT;

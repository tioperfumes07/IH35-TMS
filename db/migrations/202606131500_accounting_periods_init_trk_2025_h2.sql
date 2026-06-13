-- AI-4: extend the accounting-period seed to full coverage.
--
-- BLOCK-11 / 202606080210 seeded ONLY TRANSP Jan–Jun 2026. This adds the rest of the
-- locked p4-periods-balances coverage (2025 + 2026, TRANSP + TRK):
--   * TRANSP: Jul–Dec 2026 + all of 2025  (Jan–Jun 2026 already seeded; skipped via ON CONFLICT)
--   * TRK:    all of 2025 + all of 2026
-- USMCA is intentionally excluded (hidden until the July 2026 launch).
--
-- Portable: companies resolved by org.companies.code (the stable UNIQUE slug), NOT hardcoded UUIDs
--           (the B1-seed lesson). Months generated via generate_series → no leap-year math, no
--           hand-typed rows.
-- Idempotent: ON CONFLICT (operating_company_id, period_start) DO NOTHING.
-- Gated: same PERIODS_INIT_ENABLED confirm flag as the original seed — ops must enable it before
--        any rows are inserted (CI/prod stay empty until then).

BEGIN;

-- Unique index that ON CONFLICT targets (idempotent; already created by 202606080210).
CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_periods_oci_start
  ON accounting.periods (operating_company_id, period_start);

-- Ensure the confirm flag exists (defensive; default OFF). No-op if 202606080210 already registered it.
INSERT INTO lib.feature_flags (flag_key, description, default_enabled, rollout_pct)
VALUES (
  'PERIODS_INIT_ENABLED',
  'Confirm gate for the accounting-period seed (TRANSP + TRK, 2025 + 2026). Ops must enable before rows are inserted.',
  false,
  0
)
ON CONFLICT (flag_key) DO NOTHING;

-- Gated, portable, idempotent seed.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM lib.feature_flags
    WHERE flag_key = 'PERIODS_INIT_ENABLED'
      AND default_enabled = true
  ) THEN
    INSERT INTO accounting.periods (
      operating_company_id,
      period_start,
      period_end,
      fiscal_year,
      period_label,
      status
    )
    SELECT
      c.id,
      m::date,
      (m + INTERVAL '1 month - 1 day')::date,
      EXTRACT(YEAR FROM m)::int,
      to_char(m, 'Mon YYYY'),
      'open'
    FROM (SELECT id FROM org.companies WHERE code IN ('TRANSP', 'TRK')) c
    CROSS JOIN generate_series('2025-01-01'::date, '2026-12-01'::date, INTERVAL '1 month') AS m
    ON CONFLICT (operating_company_id, period_start) DO NOTHING;
  END IF;
END
$$;

COMMIT;

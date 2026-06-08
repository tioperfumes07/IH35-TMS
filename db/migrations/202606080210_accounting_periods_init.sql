-- BLOCK-11 ops seed: accounting periods Jan–Jun 2026 for IH 35 Transportation LLC (TRANSP).
--
-- Guard flag PERIODS_INIT_ENABLED controls whether the INSERT executes.
-- Guard flag OPENING_BALANCE_BOOKKEEPER_CONFIRM is registered here but never auto-posted;
-- bookkeeper must explicitly enable it before any opening-balance entries are allowed.
--
-- Idempotency: unique index on (operating_company_id, period_start) enables ON CONFLICT DO NOTHING.

BEGIN;

-- Unique index so ON CONFLICT DO NOTHING works on period_start per company.
CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_periods_oci_start
  ON accounting.periods (operating_company_id, period_start);

-- Register guard flags (idempotent; DO NOTHING if already present).
INSERT INTO lib.feature_flags (flag_key, description, default_enabled, rollout_pct)
VALUES
  (
    'PERIODS_INIT_ENABLED',
    'Enables the Jan–Jun 2026 accounting period seed for TRANSP. Must be explicitly enabled by ops before seed rows are inserted.',
    false,
    0
  ),
  (
    'OPENING_BALANCE_BOOKKEEPER_CONFIRM',
    'Bookkeeper sign-off gate for opening-balance journal entries. No balance entries may be posted without this flag explicitly enabled. Never auto-posted by migrations.',
    false,
    0
  )
ON CONFLICT (flag_key) DO NOTHING;

-- Gated INSERT: only executes when PERIODS_INIT_ENABLED = true.
-- Uses a subselect so the DO block is safe on databases where the flag row was just inserted above.
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
    VALUES
      ('91e0bf0a-133f-4ce8-a734-2586cfa66d96', '2026-01-01', '2026-01-31', 2026, 'Jan 2026', 'open'),
      ('91e0bf0a-133f-4ce8-a734-2586cfa66d96', '2026-02-01', '2026-02-28', 2026, 'Feb 2026', 'open'),
      ('91e0bf0a-133f-4ce8-a734-2586cfa66d96', '2026-03-01', '2026-03-31', 2026, 'Mar 2026', 'open'),
      ('91e0bf0a-133f-4ce8-a734-2586cfa66d96', '2026-04-01', '2026-04-30', 2026, 'Apr 2026', 'open'),
      ('91e0bf0a-133f-4ce8-a734-2586cfa66d96', '2026-05-01', '2026-05-31', 2026, 'May 2026', 'open'),
      ('91e0bf0a-133f-4ce8-a734-2586cfa66d96', '2026-06-01', '2026-06-30', 2026, 'Jun 2026', 'open')
    ON CONFLICT (operating_company_id, period_start) DO NOTHING;
  END IF;
END
$$;

COMMIT;

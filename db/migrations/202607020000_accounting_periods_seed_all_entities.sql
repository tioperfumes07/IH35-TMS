-- STEP-1 BLOCK A — PERIODS-INIT: seed accounting.periods for ALL entities (calendar-year, all OPEN).
--
-- Root cause (GUARD-verified 2026-06-30): accounting.periods had 0 rows for every entity because the
-- earlier seed (202606080210) was gated behind PERIODS_INIT_ENABLED (default OFF) and only covered
-- Jan–Jun 2026 for TRANSP. Period close, the cash-basis snapshot lock (Block-20.1), and the back-date
-- guard cannot function without period rows. This migration seeds the calendar so those foundations
-- have rows to operate on. It ONLY seeds OPEN periods — it closes/locks nothing and touches no GL.
--
-- Jorge-confirmed inputs (2026-07-02) — NOT guessed:
--   * Fiscal year = CALENDAR (Jan 01 → Dec 31) for every entity.
--   * TRANSP (91e0bf0a-133f-4ce8-a734-2586cfa66d96) + TRK (b49a737b-6cf0-43bb-8758-a6c8ff8a2c4e):
--     books start 2024-01-01 ("we bring in data for Transportation and Trucking from January 01 2024").
--   * USMCA (5c854333-6ea5-4faa-af31-67cb272fef80): no QuickBooks, 0 balances → TMS-only; seed from the
--     current calendar year (2026-01-01) forward.
-- Coverage: each entity's start through END OF NEXT FISCAL YEAR (2027-12) so current + near-future
-- transactions always land in an existing OPEN period. TRANSP/TRK = 48 months each; USMCA = 24 months.
--
-- Idempotent: ON CONFLICT (operating_company_id, period_start) DO NOTHING (unique index guaranteed below).
-- Fresh-DB safe: depends only on tables created by earlier migrations (0183 accounting.periods, its
-- 202606080210 unique index). No prod data assumed. Migrations run as the owner role, so the seed is
-- not blocked by RLS (matches the existing 202606080210 seed pattern).
--
-- [HOLD-FOR-JORGE — TIER 1] Build-and-hold. Do NOT close/lock any period. Year-end retained-earnings
-- logic (period-close-retained-earnings.service.ts "Option Y", Dec-31 only) is intentionally untouched.

BEGIN;

-- Idempotency key (matches 202606080210; IF NOT EXISTS makes this a no-op when already present).
CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_periods_oci_start
  ON accounting.periods (operating_company_id, period_start);

-- Seed contiguous monthly OPEN periods per entity via generate_series (no hand-typed row drift).
-- period_label 'Mon YYYY' matches the existing seed + the format month-close/p7-wave2 expect.
INSERT INTO accounting.periods (
  operating_company_id,
  period_start,
  period_end,
  fiscal_year,
  period_label,
  status
)
SELECT
  ent.company_id,
  m::date                                              AS period_start,
  (m + INTERVAL '1 month' - INTERVAL '1 day')::date    AS period_end,
  EXTRACT(YEAR FROM m)::int                            AS fiscal_year,   -- calendar year = fiscal year
  to_char(m, 'Mon YYYY')                              AS period_label,
  'open'
FROM (
  VALUES
    ('91e0bf0a-133f-4ce8-a734-2586cfa66d96'::uuid, DATE '2024-01-01'),  -- TRANSP
    ('b49a737b-6cf0-43bb-8758-a6c8ff8a2c4e'::uuid, DATE '2024-01-01'),  -- TRK
    ('5c854333-6ea5-4faa-af31-67cb272fef80'::uuid, DATE '2026-01-01')   -- USMCA (no QBO, 0 balances)
) AS ent(company_id, start_date)
CROSS JOIN LATERAL generate_series(ent.start_date, DATE '2027-12-01', INTERVAL '1 month') AS m
ON CONFLICT (operating_company_id, period_start) DO NOTHING;

COMMIT;

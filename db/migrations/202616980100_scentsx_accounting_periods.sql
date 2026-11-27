-- SCENTSX B13 — ScentsX LLC accounting periods: monthly, calendar fiscal year, Jan 2026 through Dec 2027, all OPEN.
--
-- Owner 2026-11-27 06:18 CT "get all perfumes done and built". Measured live 2026-11-27 (owner session,
-- GET /api/v1/accounting/periods?operating_company_id=<SCENTSX>): {"periods":[]} — ScentsX had no period rows, so month-close,
-- the period lock and the cash-basis snapshot had nothing to operate on (the trial balance, P&L, balance sheet and A/R / A/P aging
-- already answer 200 for ScentsX on both bases).
--
-- Same seed as USMCA in 202607020000 (calendar year, TMS-only books with no QuickBooks history → current calendar year forward,
-- through the end of next year): ScentsX's fiscal year end is 12-31 (org.companies, owner via the P1 seat, #29893). This only
-- creates OPEN periods; it closes and locks nothing, posts nothing and enters no balance. The owner closes a month when he decides.
-- Idempotent: ON CONFLICT on the existing unique index uq_accounting_periods_oci_start. Fresh-DB safe: no SCENTSX row → no-op.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_periods_oci_start
  ON accounting.periods (operating_company_id, period_start);

INSERT INTO accounting.periods (operating_company_id, period_start, period_end, fiscal_year, period_label, status)
SELECT c.id,
       m::date,
       (m + INTERVAL '1 month' - INTERVAL '1 day')::date,
       EXTRACT(YEAR FROM m)::int,
       to_char(m, 'Mon YYYY'),
       'open'
  FROM org.companies c
 CROSS JOIN LATERAL generate_series(DATE '2026-01-01', DATE '2027-12-01', INTERVAL '1 month') AS m
 WHERE c.code = 'SCENTSX'
ON CONFLICT (operating_company_id, period_start) DO NOTHING;

COMMIT;

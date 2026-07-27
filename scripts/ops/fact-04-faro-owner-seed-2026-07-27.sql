-- FACT-04 OWNER SEED (paste-box) — Faro FARO_FULL_RECOURSE_V1 on TRANSP
-- ============================================================================
-- OWNER APPLIES. Cursor does NOT Neon-apply. Commercial terms are owner-entered
-- (same class as opening balances). Statement figures win over summary terms if
-- they differ. Never store signatures / PII.
--
-- Source: OWNER-DECISIONS-FINAL / sanitized Faro commercial terms (eff 2024-12-02)
-- Architecture: parallel TMS + QBO books; reconcile only; QBO write-back OFF
-- Accounting: secured borrowing / ASC 860 — A/R stays on-book as pledged collateral
--   (no derecognition).
--
-- Locked commercial terms (sanitized):
--   Revolving facility:           $1,000,000
--   Tier-1 fee:                   1.5% of Net at funding
--   Tier-2 fee:                   2.0% of Net at funding
--   Security reserve:             1.5% of Net
--   Purchase Price:               Net − Fee − Reserve
--   Proceeds:                     Purchase Price − wire fees
--   Repurchase term:              30 days
--   Grace:                        5 days (interest accrual after day 35)
--   Repurchase deadline:          95 days
--   Default interest:             0.067%/day compounded daily after day 35
--
-- advance_rate 0.9700 = 1 − fee(0.015) − reserve(0.015) (Purchase Price / Net at Tier-1).
-- Profile notes carry the revolving $1M (no revolving_limit column on these tables).
--
-- Status: already present on Neon prod (br-fancy-credit-akjnd07a) as of 2026-07-27
-- under owner word. This file is the repo paste-box / re-apply artifact for fresh
-- branches — idempotent; safe to re-run; DO NOT self-seed without owner order.
-- ============================================================================
BEGIN;
SELECT set_config('app.bypass_rls','lucia',true);

-- TRANSP Faro vendor (QBO-synced): 3585f27e-611b-48f9-9ab2-ebfa5360071e
-- TRANSP opco: 91e0bf0a-133f-4ce8-a734-2586cfa66d96

INSERT INTO factoring.factor (
  tenant_id, operating_company_id, name,
  advance_rate, fee_rate, reserve_rate, recourse_days, active,
  fee_application_mode, notes
) VALUES (
  '91e0bf0a-133f-4ce8-a734-2586cfa66d96',
  '91e0bf0a-133f-4ce8-a734-2586cfa66d96',
  'Faro Factoring Full Recourse V1',
  0.9700, 0.0150, 0.0150, 95, true, 'replace',
  'Owner-seeded from executed Faro Factoring Agreement (eff 2024-12-02). Revolving facility $1,000,000. Purchase Price = Net − Fee − Reserve; Proceeds = Purchase Price − wire fees. Secured borrowing — A/R on-book as pledged collateral. Reconcile-only vs QBO — no TMS→QBO write-back.'
)
ON CONFLICT (tenant_id, name) DO UPDATE SET
  advance_rate = EXCLUDED.advance_rate,
  fee_rate = EXCLUDED.fee_rate,
  reserve_rate = EXCLUDED.reserve_rate,
  recourse_days = EXCLUDED.recourse_days,
  active = true,
  updated_at = now(),
  notes = EXCLUDED.notes;

INSERT INTO factoring.canonical_factor_agreements (
  tenant_id, factor_profile_id, factor_vendor_id, agreement_code,
  effective_from, effective_to, is_full_recourse,
  fee_rate_tier1, fee_rate_tier2, reserve_rate,
  repurchase_term_days, grace_days, repurchase_deadline_days,
  default_interest_daily_rate
)
SELECT
  '91e0bf0a-133f-4ce8-a734-2586cfa66d96',
  f.id,
  '3585f27e-611b-48f9-9ab2-ebfa5360071e',
  'FARO_FULL_RECOURSE_V1',
  '2024-12-02'::date, NULL, true,
  0.0150, 0.0200, 0.0150,
  30, 5, 95, 0.00067000
FROM factoring.factor f
WHERE f.tenant_id = '91e0bf0a-133f-4ce8-a734-2586cfa66d96'
  AND f.name = 'Faro Factoring Full Recourse V1'
  AND NOT EXISTS (
    SELECT 1 FROM factoring.canonical_factor_agreements a
    WHERE a.tenant_id = f.tenant_id
      AND a.agreement_code = 'FARO_FULL_RECOURSE_V1'
      AND a.voided_at IS NULL
  );

COMMIT;

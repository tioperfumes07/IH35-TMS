-- CI-FRESH-DB-FACTOR-PROFILE-GENESIS — fresh-DB migration replay currently fails on
-- 202612690000_usmca_faro_factoring_canonical_agreement.sql: that migration's
-- factoring.canonical_factor_agreements INSERT FKs factor_profile_id to
-- factoring.factor.id = '40b3690b-f1d4-44b4-90cf-c1cfd4f79c33', a row that exists on prod
-- (created 2026-08-16T08:46:08Z per LV-USMCA-NO-ACTIVE-FACTOR-BLOCKS-PROFILE, live-verified via
-- Neon lucia-bypass query 2026-08-16) but was never itself created by any migration — a genuine
-- genesis-anchor gap, not a backfill. On a fresh database (CI, DR, a new clone) the row does not
-- exist, so 202612690000's INSERT hits "canonical_factor_agreements_factor_profile_id_fkey" and
-- the whole migration replay aborts. Confirmed live on the real GitHub Actions CI run for PR #7883
-- (build-typecheck job, fresh Postgres service, standard db:migrate replay).
--
-- Numbered to sort BEFORE 202612690000 so a fresh-DB replay creates this row first; on prod
-- (where 202612690000 is already applied) this is a pure no-op — ON CONFLICT (id) DO NOTHING
-- against the exact row that's already there.
--
-- Same TRANSP-derived Faro Full Recourse V1 terms 202612690000 already documents (97% advance /
-- 1.5% fee / 1.5% security reserve / 95-day recourse). No application logic touched; data-only.
--
-- Note: factoring.factor has NO migration-created rows at all today (TRANSP's own row is in the
-- same out-of-band state) — that pre-existing gap is out of scope here since nothing in the
-- current migration replay sequence FKs to TRANSP's row. This migration closes only the specific
-- dependency 202612690000 introduced.

BEGIN;

INSERT INTO factoring.factor (
  id,
  tenant_id,
  operating_company_id,
  name,
  advance_rate,
  fee_rate,
  reserve_rate,
  recourse_days,
  active,
  fee_application_mode,
  notes
)
SELECT
  '40b3690b-f1d4-44b4-90cf-c1cfd4f79c33'::uuid,
  c.id,
  c.id,
  'Faro Factoring Full Recourse V1',
  0.9700,
  0.0150,
  0.0150,
  95,
  true,
  'replace',
  'Created 2026-08-16 (LV-USMCA-NO-ACTIVE-FACTOR-BLOCKS-PROFILE) — mirrors TRANSP''s live Faro '
  || 'Factoring Full Recourse V1 terms (same factor company, same contract terms per FARO '
  || 'FACTORING AGREEMENT.docx: 97% advance / 1.5% fee / 1.5% security reserve / 95-day recourse), '
  || 'scoped to USMCA. USMCA data is TMS-native test data per standing owner ruling; this is a '
  || 'real contract-term row, not a placeholder. Backfilled into a migration (CI-FRESH-DB-FACTOR-'
  || 'PROFILE-GENESIS) after the original out-of-band insert broke fresh-DB replay.'
FROM org.companies c
WHERE c.code = 'USMCA'
ON CONFLICT (id) DO NOTHING;

COMMIT;

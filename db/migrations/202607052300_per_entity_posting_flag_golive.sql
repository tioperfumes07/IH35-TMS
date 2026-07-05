-- 202607052300_per_entity_posting_flag_golive.sql
-- [HOLD-FOR-JORGE — TIER 1 / §1.4 FINANCIAL] Per-entity GL-posting go-live flag state.
-- NEVER self-merge — this turns MONEY-POSTING on for two operating entities. Owner (Jorge)
-- approved the per-entity enablement below; this migration only ENCODES that decision as
-- lib.feature_flag_overrides rows (enabled=true, keyed on operating_company_id, user_uuid NULL).
--
-- MECHANISM
--   A posting flag gates whether TMS writes to the GL for a given operating company. Per
--   apps/backend/src/lib/feature-flags/service.ts these flags are PER-ENTITY-ONLY: the resolver
--   ignores global default_enabled / rollout_pct and honors ONLY an explicit per-entity
--   (operating_company_id) or per-user override. So the single lever to turn posting on for an
--   entity is a tenant override row in lib.feature_flag_overrides. This migration seeds exactly
--   those rows for USMCA and TRK. It NEVER posts a journal entry and NEVER touches TRANSP.
--
--   Entities resolve BY CODE from org.companies (code = 'USMCA' / 'TRK') — no hardcoded UUIDs
--   (prod secrets). set_by_user_uuid resolves to the current Owner (identity.users.role='Owner').
--   Every clause is a JOIN, so a missing entity code OR a missing Owner is a graceful NO-OP
--   (0 rows inserted), never an error.
--
-- ┌──────────────────────────── PER-ENTITY FLAG MATRIX (this migration) ─────────────────────────────┐
-- │ flag_key                          │ USMCA │ TRK  │ TRANSP │ why                                    │
-- ├───────────────────────────────────┼───────┼──────┼────────┼────────────────────────────────────────┤
-- │ GL_POSTING_ENABLED (master)       │  ON   │  ON  │  (n/c) │ master GL switch for the entity         │
-- │ BILL_GL_POSTING_ENABLED           │  ON   │  ON  │  (n/c) │ A/P bills — both entities incur bills   │
-- │ BILL_PAYMENT_GL_POSTING_ENABLED   │  ON   │  ON  │  (n/c) │ bill payments                           │
-- │ EXPENSE_GL_POSTING_ENABLED        │  ON   │  ON  │  (n/c) │ direct expenses                         │
-- │ BANK_FEED_GL_POSTING_ENABLED      │  ON   │  ON  │  (n/c) │ bank-feed categorize → GL               │
-- │ AMORTIZATION_GL_POSTING_ENABLED   │  ON   │  ON  │  (n/c) │ prepaid/amortization schedules          │
-- │ INVOICE_AR_GL_POSTING_ENABLED     │  ON   │ OFF  │  (n/c) │ customers/A/R live under TRANSP, not TRK│
-- │ SETTLEMENT_GL_POSTING_ENABLED     │  ON   │ OFF  │  (n/c) │ drivers settle under TRANSP, not TRK    │
-- │ LEASE_GL_POSTING_ENABLED          │  OFF  │  ON  │  (n/c) │ TRK is the LESSOR (owns units); USMCA   │
-- │                                   │       │      │        │ owns no units → nothing to lease-post   │
-- │ FACTORING_GL_POSTING_ENABLED      │  OFF  │ OFF  │  (n/c) │ factoring is contractually TRANSP-only  │
-- │                                   │       │      │        │ (Faro ↔ IH35 TRANSPORTATION)            │
-- └───────────────────────────────────┴───────┴──────┴────────┴────────────────────────────────────────┘
--   ON  = a tenant override row (enabled=true) is seeded here.
--   OFF = intentionally NO row seeded (default is OFF; the resolver returns false).
--   (n/c)= TRANSP is deliberately NOT touched by this migration.
--
-- WHY FACTORING/LEASE ARE ENTITY-RESTRICTED (not a blind all-ON)
--   • FACTORING: the factoring relationship (Faro Factoring, secured-borrowing) is a contract of
--     IH35 TRANSPORTATION (TRANSP) only. Turning FACTORING_GL_POSTING_ENABLED on for USMCA or TRK
--     would let a non-party entity book factoring GL — wrong entity, the highest-cost error class.
--     → OFF for both USMCA and TRK.
--   • LEASE: TRK is the asset holder and the LESSOR — it owns the units and leases them out, so
--     lease posting is TRK's core activity → ON for TRK. USMCA owns NO units (TRK owns them), so
--     USMCA has nothing to lease-post → OFF for USMCA.
--   • INVOICE_AR / SETTLEMENT for TRK: customers (A/R) and drivers (settlements) operate under the
--     operating carrier TRANSP, not the asset holder TRK. TRK issues no customer invoices and pays
--     no drivers → both OFF for TRK. (ON for USMCA, which is a clean 0-start operating carrier where
--     TMS is the system of record.)
--
-- TRANSP is deliberately untouched: its already-live posters stay as they are, and its new-engine
-- flags (SETTLEMENT / LEASE / FACTORING) flip per-engine in separate, sequenced migrations after each
-- engine deploys + a JE proof. This migration is ordered to apply AFTER the engine migrations (high
-- timestamp) and is self-registering (see step 1), so it is correct regardless of engine ordering.
--
-- IDEMPOTENT: re-run converges to the same enabled=true rows (ON CONFLICT DO UPDATE). Guarded:
-- missing entity code or missing Owner → 0 rows, no error. Reversible (see ROLLBACK footer).

BEGIN;

-- 1. Ensure every referenced flag exists in lib.feature_flags (FK target for the overrides).
--    All are registered already EXCEPT the master GL_POSTING_ENABLED; ON CONFLICT DO NOTHING makes
--    this a no-op for the pre-registered ones and self-registers the master. All DEFAULT OFF — the
--    override rows below are the only thing that turns anything on, and only per named entity.
INSERT INTO lib.feature_flags (flag_key, description, default_enabled, rollout_pct)
VALUES
  ('GL_POSTING_ENABLED',
   'Master GL-posting switch for an entity. Per-entity-only (overrides); DEFAULT OFF.', false, 0),
  ('BILL_GL_POSTING_ENABLED',
   'Bill -> GL posting (Dr expense / Cr A/P). Per-entity-only (overrides); DEFAULT OFF.', false, 0),
  ('BILL_PAYMENT_GL_POSTING_ENABLED',
   'Bill payment -> GL posting. Per-entity-only (overrides); DEFAULT OFF.', false, 0),
  ('EXPENSE_GL_POSTING_ENABLED',
   'Direct expense -> GL posting. Per-entity-only (overrides); DEFAULT OFF.', false, 0),
  ('BANK_FEED_GL_POSTING_ENABLED',
   'Bank-feed categorize -> GL posting. Per-entity-only (overrides); DEFAULT OFF.', false, 0),
  ('AMORTIZATION_GL_POSTING_ENABLED',
   'Amortization schedule -> GL posting. Per-entity-only (overrides); DEFAULT OFF.', false, 0),
  ('INVOICE_AR_GL_POSTING_ENABLED',
   'Invoice -> A/R GL posting. Per-entity-only (overrides); DEFAULT OFF.', false, 0),
  ('SETTLEMENT_GL_POSTING_ENABLED',
   'Driver settlement -> GL posting. Per-entity-only (overrides); DEFAULT OFF.', false, 0),
  ('LEASE_GL_POSTING_ENABLED',
   'Lease -> GL posting (lessor). Per-entity-only (overrides); DEFAULT OFF.', false, 0)
ON CONFLICT (flag_key) DO NOTHING;

-- 2. Seed the ON overrides. One INSERT ... SELECT so every dependency is a JOIN and any absent
--    dependency (entity code, registered flag, Owner user) drops the row rather than erroring.
--    Only ON rows are seeded; OFF entries in the matrix are represented by the ABSENCE of a row.
DO $seed$
BEGIN
  -- lib.feature_flag_overrides admin policy gates writes on identity.is_lucia_bypass(); set the GUC
  -- so the seed succeeds whether the migration runs as the table owner or as ih35_app. Transaction-
  -- local (reset at COMMIT).
  PERFORM set_config('app.bypass_rls', 'lucia', true);

  INSERT INTO lib.feature_flag_overrides
    (flag_key, operating_company_id, user_uuid, enabled, set_by_user_uuid)
  SELECT v.flag_key, c.id, NULL::uuid, true, owner_user.id
  FROM (VALUES
      -- USMCA (clean 0-start operating carrier; TMS is system of record). NO factoring, NO lease.
      ('USMCA', 'GL_POSTING_ENABLED'),
      ('USMCA', 'BILL_GL_POSTING_ENABLED'),
      ('USMCA', 'BILL_PAYMENT_GL_POSTING_ENABLED'),
      ('USMCA', 'INVOICE_AR_GL_POSTING_ENABLED'),
      ('USMCA', 'EXPENSE_GL_POSTING_ENABLED'),
      ('USMCA', 'BANK_FEED_GL_POSTING_ENABLED'),
      ('USMCA', 'AMORTIZATION_GL_POSTING_ENABLED'),
      ('USMCA', 'SETTLEMENT_GL_POSTING_ENABLED'),
      -- TRK (asset holder / lessor; low volume). LEASE is its core. NO factoring, NO A/R, NO settlement.
      ('TRK',   'GL_POSTING_ENABLED'),
      ('TRK',   'LEASE_GL_POSTING_ENABLED'),
      ('TRK',   'BILL_GL_POSTING_ENABLED'),
      ('TRK',   'BILL_PAYMENT_GL_POSTING_ENABLED'),
      ('TRK',   'EXPENSE_GL_POSTING_ENABLED'),
      ('TRK',   'BANK_FEED_GL_POSTING_ENABLED'),
      ('TRK',   'AMORTIZATION_GL_POSTING_ENABLED')
    ) AS v(company_code, flag_key)
  -- entity resolved BY CODE (never a hardcoded prod UUID); missing code -> row dropped (no-op)
  JOIN org.companies c      ON c.code = v.company_code
  -- FK target must exist; step 1 guarantees it, but the JOIN keeps this self-consistent
  JOIN lib.feature_flags ff ON ff.flag_key = v.flag_key
  -- set_by = current Owner; if none resolvable the LATERAL yields 0 rows -> whole INSERT is a no-op
  CROSS JOIN LATERAL (
    SELECT u.id
    FROM identity.users u
    WHERE u.role = 'Owner'
      AND u.deactivated_at IS NULL
      AND u.archived_at IS NULL
    ORDER BY u.created_at
    LIMIT 1
  ) AS owner_user
  ON CONFLICT (flag_key, operating_company_id)
    WHERE user_uuid IS NULL AND operating_company_id IS NOT NULL
  DO UPDATE SET
    enabled          = true,
    set_by_user_uuid = EXCLUDED.set_by_user_uuid,
    set_at           = now();
END
$seed$;

COMMIT;

-- ROLLBACK (owner-run only, reversible — turns posting back OFF for USMCA + TRK):
-- DELETE FROM lib.feature_flag_overrides o
-- USING org.companies c
-- WHERE o.operating_company_id = c.id
--   AND o.user_uuid IS NULL
--   AND c.code IN ('USMCA','TRK')
--   AND o.flag_key IN (
--     'GL_POSTING_ENABLED','BILL_GL_POSTING_ENABLED','BILL_PAYMENT_GL_POSTING_ENABLED',
--     'INVOICE_AR_GL_POSTING_ENABLED','EXPENSE_GL_POSTING_ENABLED','BANK_FEED_GL_POSTING_ENABLED',
--     'AMORTIZATION_GL_POSTING_ENABLED','SETTLEMENT_GL_POSTING_ENABLED','LEASE_GL_POSTING_ENABLED'
--   );

-- [HOLD-FOR-JORGE — TIER 1] DO NOT RUN ON PROD — run ONLY on a Neon branch by Jorge's hand, then
-- ledger-backfill so prod db:migrate skips it. Registered in db/migrations/.held-migrations.json.
-- Apply AFTER 202607820000 (held_apply_order); they are independent, but the batch is applied in
-- number order so the ledger reads in the order the work was authored.
--
-- SAF-F09 — escrow target. OWNER DECISION 2026-07-24: "escrow the maximum we usually keep is
-- 2500.00" → 250000 cents, per entity, CONFIGURABLE. Never a code constant.
--
-- ============================================================================================
-- VERIFY-FIRST (C1) — checked against PROD branch br-fancy-credit-akjnd07a before authoring:
--   * There is NO escrow config store anywhere. Searched information_schema for any column
--     matching %escrow%target% / %escrow%max% and any table matching %escrow%config% → nothing.
--     The only per-driver money-policy store is driver_finance.driver_pay_settings
--     (operating_company_id, driver_id, net_pay_floor_pct, worker_class,
--     flsa_min_wage_cents_per_hour). So the $1,000 in api/driverFinance.ts was not "overriding a
--     config" — there was no config to override.
--   * driver_pay_settings.driver_id is NOT NULL, so that table CANNOT hold a per-ENTITY default
--     row. A per-entity store must be its own table. (This is exactly why the check came first:
--     the obvious move — add a column to driver_pay_settings and seed a NULL-driver row — is
--     impossible on the real schema.)
--   * org.companies confirmed on prod: TRANSP 91e0bf0a-133f-4ce8-a734-2586cfa66d96,
--     TRK b49a737b-6cf0-43bb-8758-a6c8ff8a2c4e, USMCA 5c854333-6ea5-4faa-af31-67cb272fef80.
--   * legal.contract_instances EXISTS (FORCED RLS) with status enum
--     draft|sent|viewed|signed_electronically|voided|expired, signed_at, voided_at, signer_type
--     (driver|employee|customer|vendor|other), signer_entity_id, template_code — but it carries NO
--     escrow-target and NO escrow-clause field, and has 0 rows on prod.
--     → Per the work order: the per-contract TARGET OVERRIDE is a DECLARED DEFERRAL pointing at the
--       Legal-contract block. has_signed_clause is wired to the best available real signal (a
--       signed, non-voided driver contract instance) instead of being inferred from
--       bucket-existence. What it must never remain is a data side-effect gating real money.
-- ============================================================================================
--
-- WHY A NEW TABLE AND NOT A COLUMN ON org.companies: org.companies is the entity registry and
-- already carries two settlement knobs (min_net_settlement_pct/_cents); piling driver-finance policy
-- onto it spreads money config across two schemas. driver_finance owns driver money policy, so the
-- per-entity escrow default lives there next to the per-driver settings it defaults for.
--
-- SAFETY: additive + idempotent. Seed is ON CONFLICT DO NOTHING — re-running never overwrites a
-- value the owner has since changed. TRK is intentionally NOT seeded: it is the asset holder and
-- runs no drivers (company_type='asset_holder' on prod), so seeding it would invent a policy for a
-- population that does not exist. POSTS NOTHING.

-- CANONICAL-CHECK: driver_escrow_target_config vs driver_finance.escrow_ledger.
-- driver_finance.escrow_ledger REMAINS the canonical escrow money ledger — every balance, deposit,
-- release and forfeiture stays there and this migration does not touch it, read it, or copy it.
-- driver_finance.escrow_settings is a CONFIG CATALOG, not a second ledger: one row per operating
-- company holding ONE owner-set policy number (escrow_target_cents). It has no amount owed, no
-- balance, no posting, no driver dimension and no relationship to any transaction — so it cannot
-- diverge from escrow_ledger, because it never restates anything escrow_ledger records.
-- The two answer different questions: escrow_ledger answers "how much does this driver have?",
-- escrow_settings answers "how much are we aiming to hold?". The second question previously had no
-- store at all — verified on prod before authoring, there is no %escrow%target% / %escrow%max%
-- column and no %escrow%config% table anywhere — so the answer lived as a constant invented in the
-- client (ESCROW_TARGET_DEFAULT = 1000) that drove the accumulation percentage on real money.
-- This introduces a store that had no predecessor rather than a second copy of one.

BEGIN;

CREATE TABLE IF NOT EXISTS driver_finance.escrow_settings (
  operating_company_id  uuid PRIMARY KEY REFERENCES org.companies(id),
  -- The COMPANY-WIDE default target. Owner-set, not derived. Cents, like every other money column.
  escrow_target_cents   bigint NOT NULL CHECK (escrow_target_cents >= 0),
  is_active             boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id    uuid REFERENCES identity.users(id)
);

COMMENT ON TABLE driver_finance.escrow_settings IS
  'Per-entity default driver escrow target (SAF-F09). Replaces the hardcoded ESCROW_TARGET_DEFAULT '
  '= 1000 in apps/frontend/src/api/driverFinance.ts, which drove the accumulation-rate math on real '
  'money. Resolution order: per-driver override (driver_pay_settings.escrow_target_cents) -> this '
  'per-entity default. A signed-hire-contract target is the intended top of that order and is '
  'DEFERRED until the Legal contract store carries the field.';

ALTER TABLE driver_finance.escrow_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_finance.escrow_settings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS escrow_settings_tenant_scope ON driver_finance.escrow_settings;
CREATE POLICY escrow_settings_tenant_scope
  ON driver_finance.escrow_settings
  FOR ALL TO ih35_app
  USING (identity.is_lucia_bypass()
         OR operating_company_id::text = current_setting('app.operating_company_id', true))
  WITH CHECK (identity.is_lucia_bypass()
         OR operating_company_id::text = current_setting('app.operating_company_id', true));

-- No DELETE: a policy row is deactivated (is_active), never removed — the history of what the
-- target was when a forfeiture was computed has to survive.
GRANT SELECT, INSERT, UPDATE ON driver_finance.escrow_settings TO ih35_app;

-- Per-driver override. Nullable: NULL means "use the entity default", which is the common case.
ALTER TABLE driver_finance.driver_pay_settings
  ADD COLUMN IF NOT EXISTS escrow_target_cents bigint;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid='driver_finance.driver_pay_settings'::regclass
                   AND conname='chk_driver_pay_settings_escrow_target_nonneg') THEN
    ALTER TABLE driver_finance.driver_pay_settings
      ADD CONSTRAINT chk_driver_pay_settings_escrow_target_nonneg
      CHECK (escrow_target_cents IS NULL OR escrow_target_cents >= 0);
  END IF;
END
$$;

COMMENT ON COLUMN driver_finance.driver_pay_settings.escrow_target_cents IS
  'Per-driver escrow target override in cents (SAF-F09). NULL = use driver_finance.escrow_settings '
  'for the entity. This is where a signed hire-contract target is recorded once the Legal contract '
  'store carries it.';

-- OWNER-SET SEED: $2,500.00 = 250000 cents, for the two entities that actually run drivers.
-- ON CONFLICT DO NOTHING so a later owner change is never clobbered by a re-run.
INSERT INTO driver_finance.escrow_settings (operating_company_id, escrow_target_cents)
SELECT c.id, 250000
FROM org.companies c
WHERE c.id IN (
  '91e0bf0a-133f-4ce8-a734-2586cfa66d96',  -- TRANSP (operating carrier)
  '5c854333-6ea5-4faa-af31-67cb272fef80'   -- USMCA  (operating carrier, launches 2026)
)
ON CONFLICT (operating_company_id) DO NOTHING;

COMMIT;

-- ===========================================================================================
-- POST-APPLY VERIFY (by hand on the Neon branch; NOT part of the migration)
-- ===========================================================================================
--  SELECT c.code, s.escrow_target_cents, s.is_active
--    FROM driver_finance.escrow_settings s JOIN org.companies c ON c.id = s.operating_company_id
--   ORDER BY c.code;
--  -- expect exactly TRANSP 250000 and USMCA 250000. TRK absent BY DESIGN (asset holder, no drivers).
--
--  SELECT relrowsecurity, relforcerowsecurity FROM pg_class
--   WHERE oid='driver_finance.escrow_settings'::regclass;
--  -- expect t | t
--
--  SELECT string_agg(privilege_type, ',' ORDER BY privilege_type)
--    FROM information_schema.role_table_grants
--   WHERE table_schema='driver_finance' AND table_name='escrow_settings' AND grantee='ih35_app';
--  -- expect INSERT,SELECT,UPDATE — and NO DELETE
--
--  SELECT column_name FROM information_schema.columns
--   WHERE table_schema='driver_finance' AND table_name='driver_pay_settings'
--     AND column_name='escrow_target_cents';
--  -- expect 1 row
--
-- DOWN (manual rollback):
--   DROP TABLE IF EXISTS driver_finance.escrow_settings;
--   ALTER TABLE driver_finance.driver_pay_settings DROP COLUMN IF EXISTS escrow_target_cents;

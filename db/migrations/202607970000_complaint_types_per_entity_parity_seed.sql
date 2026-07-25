-- 202607970000_complaint_types_per_entity_parity_seed.sql
--
-- HELD — DO NOT RUN ON PROD. This migration runs ONLY on a Neon branch by the owner's hand, then is
-- ledger-backfilled so prod db:migrate skips it. catalogs.* data change = owner-gated (financial
-- cluster). Registered in .held-migrations.json.
--
-- LST-SEED-01 — catalogs.complaint_types is per-entity but was only SEEDED to the primary company, so
-- the "same values on every active entity" ruling (owner 2026-07-24) is violated and a complaint logged
-- under a TRANSP-only code cannot be classified on TRK or USMCA at all.
--
-- PROD TRUTH (Neon br-fancy-credit-akjnd07a, lucia bypass, 2026-07-25):
--     TRANSP 91e0bf0a  271 total / 271 active
--     TRK    b49a737b   12 total /  12 active
--     USMCA  5c854333   12 total /  12 active
--     295 rows, 271 DISTINCT type_code  -> TRK's and USMCA's 12 codes are a strict SUBSET of TRANSP's
--     271, so the copy below inserts exactly 259 + 259 = 518 rows and collides on nothing else.
--     Positive control (RLS visibility sanity check): catalogs.accounts = 1392 visible. 0 is not absence.
--
-- The table is ALREADY correctly scoped — this is a DATA parity seed, not a conversion:
--     operating_company_id uuid NOT NULL + FK org.companies(id)   [complaint_types_operating_company_id_fkey]
--     UNIQUE (operating_company_id, type_code)                    [complaint_types_operating_company_id_type_code_key]
--     relrowsecurity = true AND relforcerowsecurity = true
--     policy complaint_types_tenant_scope_usmca1 FOR ALL USING
--       (identity.is_lucia_bypass() OR operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid)
--   That policy is DELIBERATELY LEFT UNTOUCHED. Its NULLIF + ::uuid form is the hardened shape required by
--   verify-rls-uuid-cast-nullif; replacing it with a `::text =` company_scope policy would be a REGRESSION,
--   and adding a second permissive policy would only OR in a duplicate predicate. Invariant #24: nothing
--   dropped, nothing renamed.
--
-- COLUMN LIST VERIFIED LIVE BEFORE WRITING (packet 01 says "verify the real column list live first — do
-- not invent"). catalogs.complaint_types has exactly SIX columns:
--     id uuid NOT NULL DEFAULT gen_random_uuid(), operating_company_id uuid NOT NULL,
--     type_code text NOT NULL, type_name text NOT NULL, default_severity text NULL,
--     is_active boolean NOT NULL DEFAULT true
--   There is NO deactivated_at and NO created_at/updated_at on this table. The construction-packet draft
--   of this migration named deactivated_at in the INSERT column list; that column does not exist on prod
--   and the statement would have failed. is_active is carried instead, so a copied inactive row stays
--   inactive.
--
-- ALSO FIXED HERE (same table, same finding, additive): ih35_app still held DELETE on
-- catalogs.complaint_types, which every other converted per-entity catalog has REVOKEd. void-not-delete.
--
-- Existing rows keep their PKs, so safety.complaints.complaint_type_id FK rows are undisturbed
-- (safety.complaints = 0 rows on prod today; the FK becomes satisfiable on all three entities after this).
-- IDEMPOTENT (ON CONFLICT DO NOTHING + dynamic resolution); safe apply-twice and on the fresh-DB CI
-- migrate from 0001, where org.companies is seeded by 0013 and code='TRANSP' resolves without any UUID
-- literal (the pattern used by 0014/0015/0022/0387).

DO $mig$
DECLARE
  -- Resolve the primary DYNAMICALLY. No hardcoded UUID: code is NOT NULL on org.companies and 'TRANSP'
  -- is seeded by 0013 on a fresh CI database. Fallback = earliest active company, so this still resolves
  -- on any database where that code is absent.
  v_primary uuid := COALESCE(
    (SELECT id FROM org.companies WHERE code = 'TRANSP' AND deactivated_at IS NULL ORDER BY created_at, id LIMIT 1),
    (SELECT id FROM org.companies WHERE deactivated_at IS NULL ORDER BY created_at, id LIMIT 1)
  );
  v_seed uuid;
  v_expected bigint;
  v_off bigint;
BEGIN
  IF v_primary IS NULL THEN
    RAISE EXCEPTION 'complaint_types_parity: no active org.companies row to own the catalog';
  END IF;

  -- Copy every code the primary owns into every OTHER active company. Fresh PKs via the column default.
  -- Carries type_name (NOT NULL), default_severity and is_active so a copied inactive row stays inactive.
  FOR v_seed IN SELECT id FROM org.companies WHERE deactivated_at IS NULL AND id <> v_primary LOOP
    INSERT INTO catalogs.complaint_types
      (operating_company_id, type_code, type_name, default_severity, is_active)
      SELECT v_seed, type_code, type_name, default_severity, is_active
      FROM catalogs.complaint_types
      WHERE operating_company_id = v_primary
    ON CONFLICT (operating_company_id, type_code) DO NOTHING;
  END LOOP;

  -- Re-assert scoping idempotently. Both are no-ops on prod (already true) and build the invariant on a
  -- fresh CI database. The existing tenant-scope policy is intentionally not dropped or replaced.
  ALTER TABLE catalogs.complaint_types ENABLE ROW LEVEL SECURITY;
  ALTER TABLE catalogs.complaint_types FORCE ROW LEVEL SECURITY;

  -- Acceptance assertion: every active company must carry exactly the primary's row count.
  SELECT count(*) INTO v_expected FROM catalogs.complaint_types WHERE operating_company_id = v_primary;

  SELECT count(*) INTO v_off FROM (
    SELECT c.id
    FROM org.companies c
    LEFT JOIN catalogs.complaint_types ct ON ct.operating_company_id = c.id
    WHERE c.deactivated_at IS NULL
    GROUP BY c.id
    HAVING count(ct.id) <> v_expected
  ) x;

  RAISE NOTICE 'complaint_types parity: primary=% rows, entities off parity=% (expect 0)', v_expected, v_off;
  IF v_off <> 0 THEN
    RAISE EXCEPTION 'complaint_types_parity: % active entity(ies) not at parity with the primary (% rows)', v_off, v_expected;
  END IF;
END
$mig$;

-- void-not-delete: the app may deactivate (is_active=false) but never DELETE a catalog row.
REVOKE DELETE ON catalogs.complaint_types FROM ih35_app;

-- [HOLD-FOR-JORGE — TIER 1] DO NOT RUN ON PROD — run ONLY on a Neon branch by Jorge's hand, then
-- ledger-backfill so prod db:migrate skips it. Registered in db/migrations/.held-migrations.json
-- (verify-hold-migrations-registered enforces this).
--
-- SAFETY GATED BATCH (owner work order 2026-07-24) — items 1-4 of 5. Item 5 (escrow target) is
-- 202607830000; see held_apply_order.
--
-- ============================================================================================
-- VERIFY-FIRST (C1) — every statement below was checked against the PROD branch
-- br-fancy-credit-akjnd07a BEFORE authoring, not against docs or migration files:
--   to_regclass: safety.company_violations, safety.incidents, safety.clearinghouse_query,
--                safety.civil_fines, safety.internal_fines, mdata.drivers, mdata.units,
--                mdata.vendors, mdata.customers, catalogs.accounts, insurance.claim,
--                identity.users  → ALL non-null. None is a RETIRE table (FINAL-TABLES-WIRING §A:
--                the RETIRE set is payroll.*/settlement.*, accounting.qbo_*, bank.*, maint.*,
--                catalogs.load_cancellation_reasons — none referenced here).
--   safety.company_violations really does carry related_drivers / related_units /
--     related_fine_ids as jsonb (confirmed on prod, not inferred from 0050).
--   safety.incidents has NO voided_at / voided_reason / voided_by_user_id and NO recovery_rail.
--   safety.clearinghouse_query has NO query_type (it has query_status, an enum
--     clear|record_found|pending|error, plus consent_on_file, expires_at, voided_at).
--   Row counts (pg_stat_user_tables, with a POSITIVE CONTROL so a masked read cannot read as 0:
--     mdata.drivers=178, org.companies=3 in the same query):
--     safety.company_violations=0, safety.incidents=0, safety.clearinghouse_query=0,
--     safety.civil_fines=0, safety.internal_fines=0.
--   → The F29 backfill therefore has NOTHING to backfill. That is stated plainly rather than
--     dressed up: the 0-orphan check below is real code and will run, but on current prod data it
--     proves an empty set. It earns its keep the first time a violation is created.
--
-- DEVIATION DECLARED (work order said UUIDv7 PKs): prod has NO uuidv7 generator — checked
-- pg_proc for any uuid*v7 function, none exists — and every existing safety table uses
-- gen_random_uuid(). Minting a v7 implementation inside a held migration would diverge these three
-- tables from every sibling and add an untested function to the financial cluster. Using
-- gen_random_uuid() for consistency; if UUIDv7 is wanted it should land once, repo-wide, as its own
-- decision.
-- ============================================================================================
--
-- §10.3 LINKAGE MATRIX for the records touched here:
--   company violation → drivers (join) · units (join) · civil fines (join) · source doc ·
--                       catalogs.company_violation_types (existing FK) · audit
--   incident          → driver · unit · trailer · load · claimant customer · insurance claim ·
--                       recovery rail → accounting (expense account) / vendor / customer / driver ·
--                       audit
--   clearinghouse     → driver · evidence document · queried-by user · dispatch gate (reads it) ·
--                       audit
--
-- SAFETY: additive + idempotent throughout (CREATE TABLE/INDEX IF NOT EXISTS, ADD COLUMN IF NOT
-- EXISTS, DO blocks for constraints, ON CONFLICT DO NOTHING). No UPDATE of existing rows, no DELETE,
-- no column drops. The jsonb columns on company_violations are deliberately NOT dropped — additive
-- only; the code stops writing/reading them and they stay for history.
-- POSTS NOTHING: no GL, no journal entry, no flag flip. Item 3 is SCHEMA ONLY.

BEGIN;

-- ---------------------------------------------------------------------------------------------
-- 1. F29 — company_violations relational linkage. A jsonb array of ids is not a link (Law C4):
--    no FK, no cascade, no reverse query, and it can point at a deleted or wrong row.
-- ---------------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS safety.company_violation_drivers (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  uuid NOT NULL REFERENCES org.companies(id),
  violation_id          uuid NOT NULL REFERENCES safety.company_violations(id) ON DELETE CASCADE,
  driver_id             uuid NOT NULL REFERENCES mdata.drivers(id),
  is_active             boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by_user_id    uuid REFERENCES identity.users(id),
  CONSTRAINT uq_company_violation_drivers UNIQUE (violation_id, driver_id)
);

CREATE TABLE IF NOT EXISTS safety.company_violation_units (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  uuid NOT NULL REFERENCES org.companies(id),
  violation_id          uuid NOT NULL REFERENCES safety.company_violations(id) ON DELETE CASCADE,
  -- mdata.units has NO operating_company_id (owner_company_id / currently_leased_to_company_id).
  -- The FK is to the unit; ENTITY scoping is the RLS policy below plus the owner/lessee predicate
  -- that every reader must apply — it cannot be expressed as a composite FK here.
  unit_id               uuid NOT NULL REFERENCES mdata.units(id),
  is_active             boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by_user_id    uuid REFERENCES identity.users(id),
  CONSTRAINT uq_company_violation_units UNIQUE (violation_id, unit_id)
);

CREATE TABLE IF NOT EXISTS safety.company_violation_fines (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_company_id  uuid NOT NULL REFERENCES org.companies(id),
  violation_id          uuid NOT NULL REFERENCES safety.company_violations(id) ON DELETE CASCADE,
  -- CANONICAL TARGET = safety.civil_fines, and here is the reasoning rather than a guess:
  -- a COMPANY violation (FMCSA audit / DOT inspection / state audit) is answered by an EXTERNAL
  -- fine from an authority, which is civil_fines. Driver discipline lives in internal_fines, and
  -- company_violations ALREADY has a dedicated column for that link
  -- (auto_created_internal_fine_uuid) — so related_fine_ids pointing at internal fines would
  -- duplicate an existing relationship. Both tables are 0 rows on prod, so no existing data could
  -- confirm or refute this; the choice is documented so it can be challenged rather than assumed.
  fine_id               uuid NOT NULL REFERENCES safety.civil_fines(id),
  is_active             boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by_user_id    uuid REFERENCES identity.users(id),
  CONSTRAINT uq_company_violation_fines UNIQUE (violation_id, fine_id)
);

CREATE INDEX IF NOT EXISTS idx_cv_drivers_company_violation
  ON safety.company_violation_drivers (operating_company_id, violation_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_cv_drivers_reverse
  ON safety.company_violation_drivers (operating_company_id, driver_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_cv_units_company_violation
  ON safety.company_violation_units (operating_company_id, violation_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_cv_units_reverse
  ON safety.company_violation_units (operating_company_id, unit_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_cv_fines_company_violation
  ON safety.company_violation_fines (operating_company_id, violation_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_cv_fines_reverse
  ON safety.company_violation_fines (operating_company_id, fine_id) WHERE is_active;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['company_violation_drivers','company_violation_units','company_violation_fines']
  LOOP
    EXECUTE format('ALTER TABLE safety.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE safety.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON safety.%I', t || '_tenant_scope', t);
    EXECUTE format($p$
      CREATE POLICY %I ON safety.%I
        FOR ALL TO ih35_app
        USING (identity.is_lucia_bypass()
               OR operating_company_id::text = current_setting('app.operating_company_id', true))
        WITH CHECK (identity.is_lucia_bypass()
               OR operating_company_id::text = current_setting('app.operating_company_id', true))
    $p$, t || '_tenant_scope', t);
    -- 0065 grant pattern. No DELETE: these rows are retired via is_active, never removed.
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON safety.%I TO ih35_app', t);
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------------------------
-- 1b. F29 BACKFILL from the jsonb, with a 0-ORPHAN CHECK.
--     Every id must resolve to a real row in the same entity, or the migration ABORTS. An id that
--     cannot be resolved is never silently dropped — that would convert a data problem into a
--     quiet data loss, which is the whole reason jsonb "links" are banned.
--     On current prod (company_violations = 0 rows) this inserts nothing and proves an empty set.
-- ---------------------------------------------------------------------------------------------
DO $$
DECLARE orphan_drivers int; orphan_units int; orphan_fines int;
BEGIN
  SELECT count(*) INTO orphan_drivers
  FROM safety.company_violations cv
  CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(cv.related_drivers, '[]'::jsonb)) AS j(val)
  WHERE j.val ~ '^[0-9a-fA-F-]{36}$'
    AND NOT EXISTS (SELECT 1 FROM mdata.drivers d
                    WHERE d.id = j.val::uuid AND d.operating_company_id = cv.operating_company_id);

  SELECT count(*) INTO orphan_units
  FROM safety.company_violations cv
  CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(cv.related_units, '[]'::jsonb)) AS j(val)
  WHERE j.val ~ '^[0-9a-fA-F-]{36}$'
    AND NOT EXISTS (SELECT 1 FROM mdata.units u
                    WHERE u.id = j.val::uuid
                      AND (u.owner_company_id = cv.operating_company_id
                           OR u.currently_leased_to_company_id = cv.operating_company_id));

  SELECT count(*) INTO orphan_fines
  FROM safety.company_violations cv
  CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(cv.related_fine_ids, '[]'::jsonb)) AS j(val)
  WHERE j.val ~ '^[0-9a-fA-F-]{36}$'
    AND NOT EXISTS (SELECT 1 FROM safety.civil_fines f
                    WHERE f.id = j.val::uuid AND f.operating_company_id = cv.operating_company_id);

  IF orphan_drivers > 0 OR orphan_units > 0 OR orphan_fines > 0 THEN
    RAISE EXCEPTION
      'F29 backfill ABORTED — unresolvable ids in jsonb: % driver(s), % unit(s), % fine(s). Resolve or record them before migrating; they must not be dropped.',
      orphan_drivers, orphan_units, orphan_fines;
  END IF;
END
$$;

INSERT INTO safety.company_violation_drivers (operating_company_id, violation_id, driver_id)
SELECT cv.operating_company_id, cv.id, j.val::uuid
FROM safety.company_violations cv
CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(cv.related_drivers, '[]'::jsonb)) AS j(val)
WHERE j.val ~ '^[0-9a-fA-F-]{36}$'
ON CONFLICT (violation_id, driver_id) DO NOTHING;

INSERT INTO safety.company_violation_units (operating_company_id, violation_id, unit_id)
SELECT cv.operating_company_id, cv.id, j.val::uuid
FROM safety.company_violations cv
CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(cv.related_units, '[]'::jsonb)) AS j(val)
WHERE j.val ~ '^[0-9a-fA-F-]{36}$'
ON CONFLICT (violation_id, unit_id) DO NOTHING;

INSERT INTO safety.company_violation_fines (operating_company_id, violation_id, fine_id)
SELECT cv.operating_company_id, cv.id, j.val::uuid
FROM safety.company_violations cv
CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(cv.related_fine_ids, '[]'::jsonb)) AS j(val)
WHERE j.val ~ '^[0-9a-fA-F-]{36}$'
ON CONFLICT (violation_id, fine_id) DO NOTHING;

COMMENT ON COLUMN safety.company_violations.related_drivers IS
  'RETIRED (SAF-F29, 2026-07-24). Superseded by safety.company_violation_drivers. Kept for history '
  '(additive-only); no code writes or reads it. Do not reintroduce a jsonb id array as a link.';
COMMENT ON COLUMN safety.company_violations.related_units IS
  'RETIRED (SAF-F29, 2026-07-24). Superseded by safety.company_violation_units. Kept for history.';
COMMENT ON COLUMN safety.company_violations.related_fine_ids IS
  'RETIRED (SAF-F29, 2026-07-24). Superseded by safety.company_violation_fines. Kept for history.';

-- ---------------------------------------------------------------------------------------------
-- 2. Incident VOID (void-not-delete). safety.incidents had no void columns at all, so an incident
--    filed in error could only be closed — never marked void — and "closed" is a lifecycle state,
--    not a retraction.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE safety.incidents
  ADD COLUMN IF NOT EXISTS voided_at         timestamptz,
  ADD COLUMN IF NOT EXISTS voided_reason     text,
  ADD COLUMN IF NOT EXISTS voided_by_user_id uuid REFERENCES identity.users(id);

COMMENT ON COLUMN safety.incidents.voided_at IS
  'void-not-delete. A voided incident is immutable and excluded from operational lists, never '
  'DELETEd. Requires voided_reason — enforced at the route, and by chk_safety_incidents_void_reason.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid='safety.incidents'::regclass AND conname='chk_safety_incidents_void_reason') THEN
    ALTER TABLE safety.incidents
      ADD CONSTRAINT chk_safety_incidents_void_reason
      CHECK (voided_at IS NULL OR (voided_reason IS NOT NULL AND length(btrim(voided_reason)) >= 3));
  END IF;
END
$$;

-- ---------------------------------------------------------------------------------------------
-- 3. F34 — incident damage ask-rail. OWNER RULING: ALWAYS ASK. No default, no threshold.
--    damage_amount_cents was already captured and went nowhere; this records WHERE it goes.
--    SCHEMA ONLY — no GL, no posting, no flag flip. Mirrors the claim-economics recovery_rail
--    pattern so the two read the same way.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE safety.incidents
  ADD COLUMN IF NOT EXISTS recovery_rail                text NOT NULL DEFAULT 'ask',
  ADD COLUMN IF NOT EXISTS recovery_expense_account_id  uuid REFERENCES catalogs.accounts(id),
  ADD COLUMN IF NOT EXISTS responsible_party_vendor_id  uuid REFERENCES mdata.vendors(id),
  ADD COLUMN IF NOT EXISTS responsible_party_customer_id uuid REFERENCES mdata.customers(id),
  ADD COLUMN IF NOT EXISTS insurance_claim_id           uuid REFERENCES insurance.claim(id),
  ADD COLUMN IF NOT EXISTS recovery_driver_id           uuid REFERENCES mdata.drivers(id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid='safety.incidents'::regclass AND conname='chk_safety_incidents_recovery_rail') THEN
    ALTER TABLE safety.incidents
      ADD CONSTRAINT chk_safety_incidents_recovery_rail
      CHECK (recovery_rail IN ('expense','bill_to_responsible_party','insurance_receivable','driver_recovery','ask'));
  END IF;
END
$$;

COMMENT ON COLUMN safety.incidents.recovery_rail IS
  'OWNER RULING 2026-07-24: ALWAYS ASK. Default ''ask'' means undecided and is NOT a silent '
  'classification — nothing posts on ''ask''. No dollar threshold exists or may be added; an '
  'invented threshold is a known failure class (PR #3231). Posting stays behind a default-OFF flag '
  'and fails loud when a rail is chosen without its counterparty.';

-- ---------------------------------------------------------------------------------------------
-- 4. Clearinghouse query_type (49 CFR §382.701). The prohibition is already read by the dispatch
--    gate (#3375); without query_type the ANNUAL-limited-query cadence cannot be tracked and a DOT
--    auditor cannot be shown which query was run. reference_number + document_id make the record
--    answerable at audit instead of from memory.
-- ---------------------------------------------------------------------------------------------
ALTER TABLE safety.clearinghouse_query
  ADD COLUMN IF NOT EXISTS query_type       text NOT NULL DEFAULT 'annual_limited',
  ADD COLUMN IF NOT EXISTS reference_number text,
  ADD COLUMN IF NOT EXISTS document_id      uuid REFERENCES docs.files(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid='safety.clearinghouse_query'::regclass AND conname='chk_clearinghouse_query_type') THEN
    ALTER TABLE safety.clearinghouse_query
      ADD CONSTRAINT chk_clearinghouse_query_type
      CHECK (query_type IN ('pre_employment_full','annual_limited','full'));
  END IF;
END
$$;

COMMENT ON COLUMN safety.clearinghouse_query.query_type IS
  '49 CFR 382.701: pre_employment_full (before safety-sensitive duty) | annual_limited (the '
  'at-least-every-12-months requirement) | full. DEFAULT annual_limited is the conservative choice '
  'for the 0 existing rows on prod — a limited query does NOT satisfy the pre-employment '
  'requirement, so defaulting the other way could make an unmet obligation look satisfied.';

COMMIT;

-- ===========================================================================================
-- POST-APPLY VERIFY (by hand on the Neon branch; NOT part of the migration)
-- ===========================================================================================
--  -- 1. join tables exist, FORCED RLS, no DELETE grant
--  SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
--    FROM pg_class c WHERE c.relname IN
--    ('company_violation_drivers','company_violation_units','company_violation_fines');
--  -- expect 3 rows, all t | t
--
--  SELECT table_name, string_agg(privilege_type, ',' ORDER BY privilege_type)
--    FROM information_schema.role_table_grants
--   WHERE table_schema='safety' AND grantee='ih35_app'
--     AND table_name LIKE 'company_violation_%' GROUP BY table_name;
--  -- expect INSERT,SELECT,UPDATE for each — and NO DELETE
--
--  -- 2. 0-orphan proof AFTER backfill (must all be 0)
--  SELECT (SELECT count(*) FROM safety.company_violation_drivers d
--            LEFT JOIN mdata.drivers x ON x.id=d.driver_id WHERE x.id IS NULL) AS orphan_drivers,
--         (SELECT count(*) FROM safety.company_violation_units u
--            LEFT JOIN mdata.units x ON x.id=u.unit_id WHERE x.id IS NULL) AS orphan_units,
--         (SELECT count(*) FROM safety.company_violation_fines f
--            LEFT JOIN safety.civil_fines x ON x.id=f.fine_id WHERE x.id IS NULL) AS orphan_fines;
--
--  -- 3. incident void + ask-rail columns
--  SELECT column_name, column_default FROM information_schema.columns
--   WHERE table_schema='safety' AND table_name='incidents'
--     AND column_name IN ('voided_at','voided_reason','voided_by_user_id','recovery_rail');
--  -- expect 4 rows; recovery_rail default 'ask'
--
--  -- 4. clearinghouse query_type
--  SELECT column_name, column_default FROM information_schema.columns
--   WHERE table_schema='safety' AND table_name='clearinghouse_query'
--     AND column_name IN ('query_type','reference_number','document_id');
--  -- expect 3 rows; query_type default 'annual_limited'
--
-- DOWN (manual rollback):
--   DROP TABLE IF EXISTS safety.company_violation_fines, safety.company_violation_units,
--                        safety.company_violation_drivers;
--   ALTER TABLE safety.incidents DROP COLUMN IF EXISTS voided_at, DROP COLUMN IF EXISTS voided_reason,
--     DROP COLUMN IF EXISTS voided_by_user_id, DROP COLUMN IF EXISTS recovery_rail,
--     DROP COLUMN IF EXISTS recovery_expense_account_id, DROP COLUMN IF EXISTS responsible_party_vendor_id,
--     DROP COLUMN IF EXISTS responsible_party_customer_id, DROP COLUMN IF EXISTS insurance_claim_id,
--     DROP COLUMN IF EXISTS recovery_driver_id;
--   ALTER TABLE safety.clearinghouse_query DROP COLUMN IF EXISTS query_type,
--     DROP COLUMN IF EXISTS reference_number, DROP COLUMN IF EXISTS document_id;

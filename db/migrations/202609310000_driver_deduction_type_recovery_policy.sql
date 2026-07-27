-- [HOLD-FOR-JORGE — FINANCIAL CLUSTER / catalogs.*] DO NOT RUN ON PROD — owner/GUARD applies on Neon,
-- then ledger-backfills.
--
-- DRIVER RECOVERY POLICY PER SITUATION (owner ruling 2026-07-27).
--
-- THE PROBLEM THIS SOLVES. Three owner rulings appeared to contradict each other:
--   00_LOCKED_DECISIONS §9.3 (07-04)  "recovery ordering = PAY FIRST, escrow only for shortfall —
--                                      escrow is a last-resort buffer that must keep GROWING,
--                                      because a fine can arrive 30-45 days AFTER a driver leaves"
--   owner decisions A3d / C1 (07-26)  "escrow -> if short -> Driver Damage Loss"  (escrow first)
--   DEFINITION-OF-DONE §8 (binding)   "recovery rail = ALWAYS ASK. Never auto-default."
-- They never actually conflicted. The rule is not per-company, it is PER RECOVERY SITUATION:
--   * ABANDONMENT / WALKOFF — the driver is GONE. There is no future settlement, so pay-first is
--     impossible and escrow is the only source. §9.3 cannot apply.
--   * DAMAGE / AT-FAULT ACCIDENT — the driver is still employed and still settles, so PAY FIRST is
--     correct and §9.3's reasoning holds exactly.
--   * SAFETY FINE — can arrive long after separation, so it must survive separation and reach escrow.
-- Nothing in the schema could express that difference, so the argument had nowhere to land. This
-- migration gives it somewhere.
--
-- WHY COLUMNS AND NOT CODE. Branching on situation inside each caller is precisely the drift that put
-- HOS enforcement on 2 of 4 dispatch assignment paths (HOS-1, same session). A catalog row means a new
-- recovery situation is DATA, not a deployment, and the table is already entity-scoped so TRANSP, TRK
-- and USMCA can differ. WHY NOT `metadata` jsonb (the column already there): a flag that decides
-- whether a driver's escrow may be drawn is a money control — it must be a real, CHECK-constrained
-- column, not a jsonb key no FOREIGN KEY or constraint can reach (the C13 defect class, 31 open findings).
--
-- THE ASK IS STILL MANDATORY. DoD §8 is unchanged: the operator is always asked. These columns decide
-- WHICH options are offered and WHICH is pre-selected. They never decide silently.
--
-- ONE VOCABULARY, NOT TWO. The rail values here are NOT invented for this migration — they are the
-- vocabulary the owner already locked (#1, 2026-07-22) and that prod already enforces on
-- insurance.claim.recovery_rail: CHECK (recovery_rail IN ('escrow','settlement','split','ask'))
-- DEFAULT 'ask', applied via 202607730000 and pinned by claim.shared.ts +
-- __tests__/claim.shared.test.ts. A first draft of this file used ('pay_first','escrow_first',
-- 'ask_only') — the same money decision under a second, incompatible set of words. That is the C13
-- defect class, so it was corrected before shipping rather than reconciled later:
--   'settlement' IS "pay first" here — driver pay lands on driver_finance.settlement_lines, so the
--                locked word names the actual table the deduction hits and is strictly better.
--   'split'      names the §9.3 shortfall case (settlement first, escrow covers the remainder).
--   'ask'        is the owner's permanent neutral default and satisfies DoD §8 by construction.
-- The COLUMN name stays distinct on purpose: catalogs holds default_recovery_rail (the PRE-SELECTION),
-- insurance.claim holds recovery_rail (the CHOICE actually made on one event). Same words, different
-- jobs — never a second dialect.
--
-- PROD TRUTH verified on br-fancy-credit-akjnd07a 2026-07-27:
--   insurance.claim.recovery_rail    CHECK ('escrow','settlement','split','ask') DEFAULT 'ask' —
--                                    read live from pg_constraint, so the locked vocabulary is REAL
--                                    on prod, not just asserted in TypeScript.
--   catalogs.driver_deduction_types  3 rows — one per entity, ALL of them 'INS-DED' (Insurance
--                                    deduction). No abandonment, no damage, no safety-fine reason.
--   may_draw_escrow                  does not exist as a column ANYWHERE in the database (0 hits in
--                                    information_schema.columns across all three new names).
--   driver_finance.driver_liabilities.type  has NO check constraint and 0 rows — free text.
--   the table already carries FORCE RLS + 1 policy + ih35_app grants, so no RLS work is needed here.
--
-- READ-METHOD WARNING for whoever verifies this next. catalogs.driver_deduction_types' only policy is
--   company_scope => operating_company_id::text = current_setting('app.operating_company_id', true)
-- with NO app.bypass_rls='lucia' escape branch — the same gap already fixed for
-- accounting.chart_of_accounts_roles and mdata.qbo_connections. So `SET app.bypass_rls='lucia'` ALONE
-- returns a FALSE 0 on this table even while a positive control (mdata.drivers=178) proves the bypass
-- is working. Verified both ways 2026-07-27: bypass-only => 0 rows; pg_class.n_live_tup (RLS-immune)
-- => 3; opco GUC set to TRANSP => INS-DED. Count this table with the opco GUC or n_live_tup, never
-- with the lucia bypass alone. The missing escape branch is a real gap, filed separately — NOT patched
-- here, because widening an RLS policy is its own owner-reviewed change and must not ride along on a
-- catalog seed.
--
-- SAFE DEFAULTS. Every new column defaults to the MOST RESTRICTIVE value, so the pre-existing
-- INS-DED rows come out as: may_draw_escrow = false, rail = 'ask_only', survives_separation = false.
-- An existing reason therefore CANNOT reach escrow until someone deliberately enables it. A permissive
-- default here would silently authorise escrow draws on a live money table.
--
-- NUMBERING (re-checked against the PROD LEDGER at push time, 2026-07-27T21:5x). Numbered
-- 202609310000, not 202609300000. That number was consumed on prod at 20:15:42Z by
-- 202609300000_flt_02_fixed_asset_classes_seed.sql (applied_by cursor-owner-neon-apply-2026-07-27),
-- a migration that is applied on prod but does NOT exist in this repo — so a repo-only check cannot
-- see the clash. The prod ledger max is therefore 202609300000 and §2 requires strictly above it.
-- The runner keys on FILENAME, so a duplicate number would still have applied; it would simply have
-- left two different migrations sharing one number in the ledger, which every number-keyed tool
-- (held registry, GUARD cross-check, dual-ledger backfill) then reports ambiguously.
--
-- Idempotent (IF NOT EXISTS + NOT EXISTS guards). Dynamic org.companies resolution — NO hardcoded
-- UUID. Additive only: no DROP, no DELETE, no UPDATE of existing rows.

ALTER TABLE catalogs.driver_deduction_types
  ADD COLUMN IF NOT EXISTS may_draw_escrow       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_recovery_rail text    NOT NULL DEFAULT 'ask',
  ADD COLUMN IF NOT EXISTS survives_separation   boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  -- Same four values as insurance.claim.recovery_rail (owner lock #1) — verified live on prod, not copied
  -- from a doc. If that lock ever changes, BOTH constraints change together; they are one vocabulary.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_driver_deduction_types_recovery_rail') THEN
    ALTER TABLE catalogs.driver_deduction_types
      ADD CONSTRAINT ck_driver_deduction_types_recovery_rail
      CHECK (default_recovery_rail IN ('escrow', 'settlement', 'split', 'ask'));
  END IF;

  -- Integrity: a row may not PRE-SELECT a rail that touches escrow while also forbidding escrow.
  -- Without this, may_draw_escrow=false + rail='escrow' is storable, and the UI would offer a
  -- pre-selected option the policy says is not allowed — an incoherent money control.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_driver_deduction_types_escrow_rail_coherent') THEN
    ALTER TABLE catalogs.driver_deduction_types
      ADD CONSTRAINT ck_driver_deduction_types_escrow_rail_coherent
      CHECK (may_draw_escrow OR default_recovery_rail NOT IN ('escrow', 'split'));
  END IF;
END $$;

COMMENT ON COLUMN catalogs.driver_deduction_types.may_draw_escrow IS
  'Owner policy: may a recovery of this type EVER draw the driver escrow liability? Default false. Escrow is a last-resort buffer that must keep growing (00_LOCKED_DECISIONS §9.3).';
COMMENT ON COLUMN catalogs.driver_deduction_types.default_recovery_rail IS
  'The PRE-SELECTED option in the mandatory recovery ask (DoD §8) — never applied silently. Same four values as insurance.claim.recovery_rail (owner lock #1, 2026-07-22): settlement for an employed driver; escrow where no future settlement exists (abandonment); split for settlement-then-escrow-shortfall; ask when there should be no default.';
COMMENT ON COLUMN catalogs.driver_deduction_types.survives_separation IS
  'May this recovery still be collected after the driver leaves? True for safety fines, which can arrive 30-45 days post-separation, and for abandonment.';

-- Seed the three situations the owner named (C2), per entity, with their per-situation policy.
DO $$
DECLARE
  v_rows CONSTANT text[][] := ARRAY[
    -- [code, display_name, may_draw_escrow, default_recovery_rail, survives_separation, description]
    ['ABANDONMENT','Load abandonment / walkoff','true','escrow','true',
     'Driver abandoned a load or walked off. There is no future settlement to deduct from, so escrow is the only available source and settlement-first is not possible.'],
    ['DAMAGE','Driver-at-fault damage','true','split','true',
     'Driver-at-fault damage or accident recovery. The driver is still employed and still settles, so settlement comes first and escrow covers only the shortfall (00_LOCKED_DECISIONS §9.3) — which is exactly what the locked rail ''split'' means. The driver owes the FULL company-funded repair, not just a deductible (DoD §8).'],
    ['SAFETY-FINE','Safety fine (driver-responsible)','true','settlement','true',
     'A driver-responsible safety or civil fine. Settlement first while employed; must survive separation because fines routinely arrive 30-45 days after a driver leaves, at which point escrow is the only remaining source.']
  ];
  v_row   text[];
  v_co    record;
  v_added int := 0;
BEGIN
  FOR v_co IN SELECT id, code FROM org.companies LOOP
    FOREACH v_row SLICE 1 IN ARRAY v_rows LOOP
      IF NOT EXISTS (
        SELECT 1 FROM catalogs.driver_deduction_types
         WHERE operating_company_id = v_co.id AND code = v_row[1]
      ) THEN
        INSERT INTO catalogs.driver_deduction_types
          (operating_company_id, code, display_name, description,
           may_draw_escrow, default_recovery_rail, survives_separation, is_active)
        VALUES
          (v_co.id, v_row[1], v_row[2], v_row[6],
           v_row[3]::boolean, v_row[4], v_row[5]::boolean, true);
        v_added := v_added + 1;
      END IF;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'driver recovery policy: % reason row(s) seeded across all entities', v_added;
END $$;

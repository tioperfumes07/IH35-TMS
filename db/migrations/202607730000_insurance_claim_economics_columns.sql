-- [HOLD-FOR-JORGE — TIER 1 · FINANCIAL CLUSTER] DO NOT RUN ON PROD — run ONLY on a Neon branch by
-- Jorge's hand, then ledger-backfill so prod db:migrate skips it. Registered in
-- db/migrations/.held-migrations.json (verify-hold-migrations-registered enforces this).
--
-- WIZARD-CLAIM-ECONOMICS-DEPTH slice 2 — insurance.claim economics columns (fault / responsibility /
-- trailer / deductible / recovery rail / uninsured-repair books treatment).
--
-- WHY (docs/trackers/FULL-SYSTEM-AUDIT-AND-WIRING-MASTER-PLAN-2026-07-22.md §0.1 Example A2, honest gap
-- confirmed in code 2026-07-22): insurance.claim already carries policy_id / asset_id / accident_report_id
-- / load_id / driver_id (0285, 202607410000) but has NO way to record WHO was at fault, WHETHER the
-- driver is responsible, WHICH trailer was involved, the deductible amount, HOW a driver deductible is
-- recovered, or HOW an uninsured/company-funded repair is booked. Without these the claim cannot drive the
-- fault -> money decision tree the owner locked (§0.1 Example A2 / Example D / Example E) — slice 3 (the
-- actual deductible/driver-A-R money object + GL posting, Option C, financial HOLD) cannot be built on top
-- of a claim that has nowhere to store the decision. This slice is PURE SCHEMA + UI CAPTURE — it creates
-- NO expense/JE/settlement-deduction/escrow-draw row and posts NOTHING. Money-object creation + GL posting
-- is explicitly OUT OF SCOPE (future slice, financial HOLD, CPA sign-off + Neon required).
--
-- OWNER LOCKS (2026-07-22, verbatim from the master plan — do not invent alternate defaults):
--   #1 Driver deductible recovery rail = ALWAYS ASK (escrow / next settlement / split) — never auto-default.
--   #2 Uninsured/company-funded repair: Choice Z = ALWAYS ASK (expense vs capitalize). NO dollar threshold.
--      If driver fault/responsible, driver owes the FULL company-funded repair amount (not "deductible
--      only") — recovered via the same always-ask rail.
--   #3 Deductible books shape = Option C (expense residual + Driver A/R) — decided for slice 3; this slice
--      only needs recovery_rail to exist so the future poster has somewhere to read the owner's choice.
--
-- COLUMNS ADDED to insurance.claim (all nullable-safe / non-breaking; existing rows get sane neutral
-- defaults, never a false "yes"/"escrow"/"expense"):
--   fault                  text    NOT NULL DEFAULT 'undetermined' — 'undetermined' | 'company' |
--                          'third_party' | 'shared'. Mirrors the safety.accident_reports.at_fault
--                          precedent (202607050830): a fresh claim is undetermined, never defaulted to a
--                          specific fault finding.
--   driver_responsible     boolean NULL = not yet determined (tri-state: NULL / true / false). Never
--                          defaults to false — an un-assessed claim must not silently read as "driver is
--                          not responsible".
--   trailer_id             uuid    NULL, REFERENCES mdata.equipment(id) ON DELETE SET NULL. Canonical
--                          trailer hub per the repo-locked 2026-07 repoint (see
--                          202607031600_safety_incidents_trailer_fk_to_equipment.sql comment: trailers
--                          live in mdata.equipment — DryVan/Reefer/Flatbed/etc — NOT mdata.units, which is
--                          trucks/tractors only). asset_id already covers the truck/unit side; this is
--                          the trailer side (§0.1 Example A2: "Trailer | When a trailer was involved").
--   deductible_cents       bigint  NOT NULL DEFAULT 0, CHECK >= 0. The policy deductible amount (Example D:
--                          $2,500). Zero is the correct default for a claim with no deductible exposure —
--                          never NULL (this is a real dollar amount that must always compare cleanly).
--   recovery_rail          text    NOT NULL DEFAULT 'ask' — 'escrow' | 'settlement' | 'split' | 'ask'.
--                          'ask' is the PERMANENT neutral state for "not decided yet" (owner lock #1 —
--                          this column exists so the future recovery-money-object step always has an
--                          explicit value to read; it is NEVER silently advanced past 'ask' by this slice
--                          or any migration/backfill).
--   repair_books_treatment text  NOT NULL DEFAULT 'ask' — 'expense' | 'capitalize' | 'ask'. Same
--                          always-ask discipline (owner lock #2 / Choice Z) for the uninsured/company-
--                          funded repair's company-books treatment. No $ threshold anywhere in the schema
--                          or CHECK — the choice is per-claim, every time, forever.
--
-- IDEMPOTENT + FRESH-DB SAFE: ADD COLUMN IF NOT EXISTS (whole clause is a no-op if the column already
-- exists, so a re-run cannot double-add or clobber a CHECK). CHECK constraints are declared inline on the
-- ADD COLUMN clause, so they only get created the first time the column itself is created — safe to run
-- twice. These are brand-new columns, so every existing row gets the neutral default atomically as part
-- of ADD COLUMN — no separate backfill step, no orphan risk.
--
-- RLS / GRANTS: UNCHANGED. New columns on an existing table inherit the table's current FORCED RLS policy
-- (insurance_claim_opco_scope, 202607490000, keyed on operating_company_id) and the existing
-- GRANT SELECT, INSERT, UPDATE, DELETE ON insurance.claim TO ih35_app (0285) — Postgres column grants
-- follow the table grant automatically. No new table, no new schema, no policy change needed.
--
-- NO GL / NO POSTING / NO FLAG: this migration does not touch accounting.*, does not create a flag, and
-- does not seed any account_role / JE. Pure claim-record schema capture, per Rule 13 financial law (build
-- and HOLD for review even though it posts nothing, because it is schema in the financial cluster).

BEGIN;

DO $$
BEGIN
  IF to_regclass('insurance.claim') IS NOT NULL THEN
    ALTER TABLE insurance.claim
      ADD COLUMN IF NOT EXISTS fault text NOT NULL DEFAULT 'undetermined'
        CHECK (fault IN ('undetermined', 'company', 'third_party', 'shared')),
      ADD COLUMN IF NOT EXISTS driver_responsible boolean NULL,
      ADD COLUMN IF NOT EXISTS trailer_id uuid NULL REFERENCES mdata.equipment(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS deductible_cents bigint NOT NULL DEFAULT 0
        CHECK (deductible_cents >= 0),
      ADD COLUMN IF NOT EXISTS recovery_rail text NOT NULL DEFAULT 'ask'
        CHECK (recovery_rail IN ('escrow', 'settlement', 'split', 'ask')),
      ADD COLUMN IF NOT EXISTS repair_books_treatment text NOT NULL DEFAULT 'ask'
        CHECK (repair_books_treatment IN ('expense', 'capitalize', 'ask'));

    -- Both indexes live INSIDE the to_regclass guard on purpose. Left at top level they reference
    -- trailer_id / recovery_rail unconditionally, so on a database where insurance.claim does not
    -- exist the DO block above would correctly no-op and then the bare CREATE INDEX would hard-fail
    -- with "relation does not exist" — defeating the guard the file opens with.

    -- Reverse drill-through (LAW OF THE LAND §10a): a trailer profile must be able to find claims
    -- that involved it, without a full table scan. Partial index — most claims have no trailer.
    CREATE INDEX IF NOT EXISTS idx_insurance_claim_trailer
      ON insurance.claim (trailer_id)
      WHERE trailer_id IS NOT NULL;

    -- Recovery-rail queue index — the future slice-3 poster/worklist needs to find every claim still
    -- sitting at the neutral 'ask' state (owner lock: never silently advance past 'ask').
    CREATE INDEX IF NOT EXISTS idx_insurance_claim_recovery_rail_ask
      ON insurance.claim (recovery_rail)
      WHERE recovery_rail = 'ask';
  END IF;
END
$$;

COMMIT;

-- POST-DEPLOY VERIFICATION (run on the Neon branch after apply):
--   SELECT column_name, data_type, column_default, is_nullable
--   FROM information_schema.columns
--   WHERE table_schema = 'insurance' AND table_name = 'claim'
--     AND column_name IN ('fault','driver_responsible','trailer_id','deductible_cents',
--                          'recovery_rail','repair_books_treatment')
--   ORDER BY column_name;
--   -- expect all 6 rows present; fault/recovery_rail/repair_books_treatment NOT NULL with the documented
--   -- defaults; driver_responsible/trailer_id nullable.
--
-- ROLLBACK (additive only; forward-only chain otherwise):
--   ALTER TABLE insurance.claim
--     DROP COLUMN IF EXISTS fault,
--     DROP COLUMN IF EXISTS driver_responsible,
--     DROP COLUMN IF EXISTS trailer_id,
--     DROP COLUMN IF EXISTS deductible_cents,
--     DROP COLUMN IF EXISTS recovery_rail,
--     DROP COLUMN IF EXISTS repair_books_treatment;
--   -- Only safe while 0 rows have a non-default value in any of the 6 columns (verify first).

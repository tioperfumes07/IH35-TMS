-- [HOLD-FOR-JORGE — TIER 1] DO NOT RUN ON PROD — run ONLY on a Neon branch by Jorge's hand, then
-- ledger-backfill so prod db:migrate skips it. Registered in db/migrations/.held-migrations.json
-- (verify-hold-migrations-registered enforces this).
--
-- SAF-F05 — the accident wizard renders 7 fields it silently discards on save because the columns do
-- not exist. Verified on Neon br-fancy-credit-akjnd07a (2026-07-23): safety.accident_reports has ONLY
-- id, operating_company_id, driver_id, accident_at, description, unit_id, vendor_id, load_id, at_fault,
-- preventable, insurance_claim_id, status, updated_at. The drawer renders Police Report Number,
-- Insurance Claim Number, Location, 3rd Party Name, 3rd Party Plate, Vendor Invoice, Bill/Expense ref
-- as uncontrolled <input>s whose values never reach the payload — accident evidence is lost.
--
-- These are standard accident-report fields (McLeod/Samsara capture them), so they are PERSISTED, not
-- removed. insurance_claim_number is the EXTERNAL insurer's claim number (free text) — distinct from
-- the existing insurance_claim_id uuid FK to insurance.claim; both are legitimate and kept separate.
--
-- SAFETY: additive/idempotent (ADD COLUMN IF NOT EXISTS, all nullable text, no backfill, no UPDATE of
-- existing rows). Columns inherit the table's FORCED RLS + the 0065 grants on the safety schema — no
-- new grants needed. Posts nothing; no GL, no flag.
--
-- Numbering: main's current max is 202607780000; this is in the Claude-reserved migration block
-- (202607800000-…9999, see docs/trackers/LANE-ASSIGNMENT-2026-07-23.md §2a). 202607800000 is taken by
-- the escrow-forfeit HOLD; this is the next free number in the block.

BEGIN;

ALTER TABLE safety.accident_reports
  ADD COLUMN IF NOT EXISTS police_report_number   text,
  ADD COLUMN IF NOT EXISTS insurance_claim_number text,
  ADD COLUMN IF NOT EXISTS location               text,
  ADD COLUMN IF NOT EXISTS third_party_name       text,
  ADD COLUMN IF NOT EXISTS third_party_plate      text,
  ADD COLUMN IF NOT EXISTS vendor_invoice_number  text,
  ADD COLUMN IF NOT EXISTS bill_or_expense_ref    text;

COMMENT ON COLUMN safety.accident_reports.insurance_claim_number IS
  'External insurer claim NUMBER (free text). Distinct from insurance_claim_id, the uuid FK to '
  'insurance.claim. A driver/officer records the insurer-issued number here before an internal claim '
  'row exists.';
COMMENT ON COLUMN safety.accident_reports.bill_or_expense_ref IS
  'Free-text reference to the related bill/expense document. Not an FK — the accounting linkage is a '
  'separate (deferred) build; this captures the operator-entered reference so it is not lost.';

COMMIT;

-- POST-APPLY VERIFY (by hand on the Neon branch):
--   SELECT column_name FROM information_schema.columns
--   WHERE table_schema='safety' AND table_name='accident_reports'
--     AND column_name IN ('police_report_number','insurance_claim_number','location',
--                         'third_party_name','third_party_plate','vendor_invoice_number','bill_or_expense_ref');
--   -- expect all 7.

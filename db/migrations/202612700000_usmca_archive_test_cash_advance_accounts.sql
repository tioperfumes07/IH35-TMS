-- FINDING: row 259 (AUDIT-COVERAGE-LIVE) — "USMCA chart NULL account_number (2 test cash-advance
-- assets)". Live-verified the scope had grown to 7 test/audit-fixture accounts live in USMCA's
-- production catalogs.accounts, all created by ad-hoc testing/audit runs between 2026-08-02 and
-- 2026-08-16 (names: "TEST DRIVER-USMCA", "Juan USMCA-Battery", "TEST Driver-One-20260806",
-- "SAMPLE Cascade-2042/1612", "CODEX AUDIT-SPINE-DRIVER-20260816-0329", and an orphan
-- "CC2-BATTERY-20260807 account_name" that still had a raw NULL account_number). Verified live:
-- zero accounting.journal_entry_postings rows reference any of the 7 ids — safe to archive.
--
-- FIX (TMS-native, no QBO — USMCA has none): deactivate (void-not-delete), never delete. The one
-- row that still had a bare NULL account_number gets an ARCHIVED- placeholder first so the new
-- guard constraint below has a clean baseline.
--
-- GUARD: an account may have NULL account_number only while deactivated. Prevents this exact class
-- of defect (test/seed accounts left live+unnumbered in a production entity's chart) from
-- recurring, without touching any legitimately-imported QBO account (all of which already carry a
-- real account_number).

BEGIN;

UPDATE catalogs.accounts
SET account_number = 'ARCHIVED-TEST-' || substr(id::text, 1, 8),
    updated_at = now()
WHERE id = '05cf308d-5444-4387-8e1f-caf5ba645642'
  AND account_number IS NULL;

UPDATE catalogs.accounts
SET deactivated_at = now(),
    updated_at = now()
WHERE id IN (
  'c0755db6-a0a4-44a6-a437-55d8d0af90ec', -- Driver Cash Advance- TEST DRIVER-USMCA
  'f8da2072-10b1-4956-a7e1-597c1a38496d', -- Driver Cash Advance- Juan USMCA-Battery
  '08731ab6-ed9c-40c0-b066-14192dc3a758', -- Driver Cash Advance- TEST Driver-One-20260806
  '1c9bcf06-fb59-4de1-bd5c-dc575d7b35ec', -- Driver Cash Advance- SAMPLE Cascade-2042
  '26c97624-8782-4402-9407-274d9e579862', -- Driver Cash Advance- SAMPLE Cascade-1612
  '03abc7a3-033c-4e96-a727-5b457226fcdd', -- Driver Cash Advance- CODEX AUDIT-SPINE-DRIVER-20260816-0329
  '05cf308d-5444-4387-8e1f-caf5ba645642'  -- CC2-BATTERY-20260807 account_name
)
AND deactivated_at IS NULL;

ALTER TABLE catalogs.accounts DROP CONSTRAINT IF EXISTS accounts_active_requires_account_number;
ALTER TABLE catalogs.accounts
  ADD CONSTRAINT accounts_active_requires_account_number
  CHECK (account_number IS NOT NULL OR deactivated_at IS NOT NULL);

COMMIT;

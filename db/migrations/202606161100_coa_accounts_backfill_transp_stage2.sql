-- MULTI-ENTITY COA SEPARATION — Path B, STAGE 2 (backfill entity ownership; data only).
-- Assigns operating_company_id = TRANSP (91e0bf0a) to every catalogs.accounts row EXCEPT the
-- retired duplicate #6999 (account_number='6999' AND deactivated_at IS NOT NULL), which stays
-- NULL/retired per Jorge's decision. TRK + USMCA get their OWN accounts in Stages 3 + 5 —
-- never by re-tagging TRANSP's accounts.
--
-- Ownership (owner-confirmed by Jorge 2026-06-15): 365 QBO accounts (TRANSP's single QuickBooks
-- import) + 5 non-QBO operational (1000 Cash, 1100 AR, 2000 AP, 4100 Freight Revenue, 6100 Fuel)
-- = 370 -> TRANSP. Retired #6999 -> NULL (excluded).
--
-- NO NOT NULL, NO default, NO unique index, NO RLS change. FK already added in Stage 1.
-- system_purpose stays NULL here (set per-purpose in Stage 4 convergence).
--
-- PORTABILITY: TRANSP is resolved by its stable UNIQUE code 'TRANSP', NOT by hardcoded uuid.
-- org.companies (0013) seeds with DEFAULT gen_random_uuid() + ON CONFLICT(code), so the company id
-- differs per environment; prod TRANSP = 91e0bf0a, but CI's fresh DB gets a random uuid. Hardcoding
-- the prod uuid violates accounts_operating_company_id_fkey in CI. Resolve-by-code is the repo idiom
-- and yields 91e0bf0a in prod (code is UNIQUE) — prod GUARD result unchanged.
--
-- Idempotent: the WHERE matches only still-NULL non-6999 rows; after the first run none remain,
-- so re-running is a no-op.
-- Reversible (rollback SQL — run manually to undo this stage):
--   UPDATE catalogs.accounts SET operating_company_id = NULL
--    WHERE operating_company_id = (SELECT id FROM org.companies WHERE code = 'TRANSP');
-- Forward-only. See docs/specs/PATH-B-STAGED-EXECUTION-PLAN.md (Stage 2) + STAGE-2-BACKFILL-OWNERSHIP.txt.

BEGIN;

UPDATE catalogs.accounts
   SET operating_company_id = (SELECT id FROM org.companies WHERE code = 'TRANSP')  -- prod = 91e0bf0a
 WHERE operating_company_id IS NULL
   AND NOT (account_number = '6999' AND deactivated_at IS NOT NULL);   -- skip retired #6999 duplicate

COMMIT;

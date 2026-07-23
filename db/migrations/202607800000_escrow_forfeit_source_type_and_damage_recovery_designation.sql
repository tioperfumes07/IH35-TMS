-- [HOLD-FOR-JORGE — TIER 1 · FINANCIAL CLUSTER] DO NOT RUN ON PROD — run ONLY on a Neon branch by
-- Jorge's hand, then ledger-backfill so prod db:migrate skips it. Registered in
-- db/migrations/.held-migrations.json (verify-hold-migrations-registered enforces this).
--
-- SAF-F01 Escrow Forfeit — the two DB changes the forfeit route depends on.
--
-- WHY (verified on Neon br-fancy-credit-akjnd07a, 2026-07-23):
--   1. accounting.escrow_postings.source_type CHECK today = driver_settlement|factoring_advance|
--      vendor_bill|manual|reconciliation. A forfeit posting needs a source_type that says WHY the escrow
--      left the liability, and none of those fit. Add 'forfeit'. We deliberately do NOT add a new
--      posting_type — the posting_type CHECK (deposit|release|adjustment) stays untouched and a forfeit
--      uses 'adjustment' (verify-driver-escrow-separation-90day-gate.mjs forbids a 'forfeiture'
--      posting_type; source_type is the correct discriminator).
--   2. The forfeit JE credits the 'damage_recovery' CoA role. That role ALREADY exists in the
--      chart_of_accounts_roles.role CHECK (no CHECK migration needed) but is UNDESIGNATED for every
--      entity, so the PRIMARY resolver fails loud. Owner ruling 2026-07-23: forfeited escrow is a
--      RECOVERY against a recorded loss, never income. It is designated to the account that already
--      records driver-caused damage — QBO-1150040091 "Driver Accident Damages & Repairs" (OtherExpense
--      / VehicleRepairs) — so a forfeit OFFSETS the exact expense the damage created (contra-expense,
--      the same shape as the locked insurer-recovery ruling). No NEW account is minted: reusing the
--      existing QBO account keeps the damage story in one place and stays aligned with QBO as SoR.
--
-- SAFETY: additive/idempotent. The CHECK swap is DROP-IF-EXISTS + ADD (apply-twice safe). The
-- designation is INSERT ... ON CONFLICT DO NOTHING, keyed by (operating_company_id, role). No UPDATE of
-- existing rows, no DELETE, no backfill. Posting stays DARK until the owner applies this and the escrow
-- GL posting flag is ON — the route fails loud otherwise.
--
-- Numbering: renumbered 202607760000 -> 202607800000 after a collision — main merged
-- 202607760000_cash_dip_coa_role.sql (accounting lane) and 202607780000; Cursor's pending #3347 holds
-- 202607790000. 202607800000 is strictly above every claimed number in both lanes.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. accounting.escrow_postings.source_type — add 'forfeit'
-- ---------------------------------------------------------------------------
ALTER TABLE accounting.escrow_postings
  DROP CONSTRAINT IF EXISTS escrow_postings_source_type_check;

ALTER TABLE accounting.escrow_postings
  ADD CONSTRAINT escrow_postings_source_type_check
  CHECK (source_type = ANY (ARRAY[
    'driver_settlement'::text,
    'factoring_advance'::text,
    'vendor_bill'::text,
    'manual'::text,
    'reconciliation'::text,
    'forfeit'::text
  ]));

-- ---------------------------------------------------------------------------
-- 2. Designate the damage_recovery CoA role (OWNER-APPLIED)
-- ---------------------------------------------------------------------------
-- Points damage_recovery at the existing "Driver Accident Damages & Repairs" account for the two active
-- operating carriers. Keyed by (operating_company_id, role) so re-running is a no-op and an existing
-- designation is never overwritten. TRK is intentionally omitted (no driver escrow forfeiture path).
--
-- account_id is resolved by (operating_company_id, account_number) so this is portable across the
-- per-entity account ids. If the account is missing for an entity the INSERT simply designates nothing
-- for that entity (the SELECT returns no row), and the route continues to fail loud — never a wrong post.

INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
SELECT a.operating_company_id, 'damage_recovery', a.id, true
FROM catalogs.accounts a
WHERE a.account_number = 'QBO-1150040091'
  AND a.deactivated_at IS NULL
  AND a.is_postable = true
  AND a.operating_company_id IN (
    '91e0bf0a-133f-4ce8-a734-2586cfa66d96',  -- TRANSP
    '5c854333-6ea5-4faa-af31-67cb272fef80'   -- USMCA
  )
-- Conflict target matches the PARTIAL unique index uq_coa_roles_company_role_active
-- (operating_company_id, role) WHERE is_active = true — so the predicate is required here.
ON CONFLICT (operating_company_id, role) WHERE is_active = true DO NOTHING;

COMMIT;

-- ===========================================================================
-- POST-APPLY VERIFY (run by hand on the Neon branch; not part of the migration)
-- ===========================================================================
--   SET app.operating_company_id = '91e0bf0a-133f-4ce8-a734-2586cfa66d96';
--   SELECT r.role, a.account_number, a.account_name
--   FROM accounting.chart_of_accounts_roles r JOIN catalogs.accounts a ON a.id = r.account_id
--   WHERE r.role = 'damage_recovery';           -- expect QBO-1150040091 for TRANSP (and USMCA)
--   -- and confirm 'forfeit' is now accepted:
--   -- INSERT ... source_type='forfeit' no longer violates escrow_postings_source_type_check.

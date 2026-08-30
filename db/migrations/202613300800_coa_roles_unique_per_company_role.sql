-- IH35_MIGRATION_NO_TRANSACTION
-- COA-ROLES-UNIQUE-PER-COMPANY-ROLE — latent-risk repair, not a live wrong-money defect.
--
-- Honest scope (2026-08-30): with is_active=true applied, zero (operating_company_id, role)
-- groups have more than one active row and zero active roles resolve to more than one account.
-- Fourteen duplicate groups exist only in inactive WORM history; they are intentionally retained.
--
-- Migration 0223 originally declared this same partial invariant, and the live database currently
-- carries it. Reassert it idempotently as the reserved permanence/catch-up migration without touching
-- history. CONCURRENTLY avoids a write-blocking table lock if a drifted environment must recreate it.

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_coa_roles_company_role_active
  ON accounting.chart_of_accounts_roles (operating_company_id, role)
  WHERE is_active;

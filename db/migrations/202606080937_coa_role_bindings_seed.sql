-- AI-5: Seed confirmed chart-of-accounts role bindings for all active companies.
--
-- Source: docs/accounting/ROLE-BINDINGS-BOOKKEEPER-WORKSHEET.md
-- Only the three ✅ VERIFIED bindings that map to roles defined in the
-- accounting.chart_of_accounts_roles CHECK constraint are seeded here.
-- Ambiguous roles (maintenance_expense, factor_advances_receivable, etc.) are
-- intentionally omitted pending bookkeeper sign-off.
--
-- Idempotent: ON CONFLICT DO NOTHING (partial unique index on is_active=true).
--
-- Account UUIDs confirmed from catalogs.accounts (Neon IH35-TMS, Jun 8 2026):
--   ar_control        → 16ba4453-dfdb-4cdd-b50a-7ab3a2be57ec  (Accounts Receivable, 1100)
--   ap_control        → 47c792e9-ba5b-4766-a904-4346122053eb  (Accounts Payable, 2000)
--   undeposited_funds → 3d580499-9efb-4fed-9327-d2eb70ed9264  (Undeposited Funds, QBO-168)

BEGIN;

INSERT INTO accounting.chart_of_accounts_roles (
  operating_company_id,
  role,
  account_id,
  is_active
)
SELECT
  c.id AS operating_company_id,
  r.role,
  r.account_id::uuid,
  true AS is_active
FROM org.companies c
CROSS JOIN (
  VALUES
    ('ar_control',        '16ba4453-dfdb-4cdd-b50a-7ab3a2be57ec'),
    ('ap_control',        '47c792e9-ba5b-4766-a904-4346122053eb'),
    ('undeposited_funds', '3d580499-9efb-4fed-9327-d2eb70ed9264')
) AS r(role, account_id)
WHERE c.is_active = true
  AND c.deactivated_at IS NULL
  AND EXISTS (
    SELECT 1 FROM catalogs.accounts a
    WHERE a.id = r.account_id::uuid
  )
ON CONFLICT DO NOTHING;

-- Verify: should show 3 rows per active company
-- SELECT operating_company_id, role, account_id FROM accounting.chart_of_accounts_roles WHERE is_active = true ORDER BY operating_company_id, role;

COMMIT;

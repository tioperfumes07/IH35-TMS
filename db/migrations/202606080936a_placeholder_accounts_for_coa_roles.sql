-- AI-5a: Placeholder accounts for chart-of-accounts role bindings (CI compatibility).
--
-- These placeholder accounts allow migration 0937 to succeed in fresh CI databases
-- where the real QBO accounts don't exist. In production, these are replaced by
-- actual QBO-synced accounts with the same UUIDs.
--
-- Idempotent: ON CONFLICT DO NOTHING.

BEGIN;

INSERT INTO catalogs.accounts (
  id,
  name,
  account_type,
  detail_type,
  description,
  is_active,
  is_placeholder
) VALUES
  (
    '16ba4453-dfdb-4cdd-b50a-7ab3a2be57ec',
    'Accounts Receivable (Placeholder)',
    'Accounts Receivable',
    'AccountsReceivable',
    'Placeholder for ar_control role binding',
    true,
    true
  ),
  (
    '47c792e9-ba5b-4766-a904-4346122053eb',
    'Accounts Payable (Placeholder)',
    'Accounts Payable',
    'AccountsPayable',
    'Placeholder for ap_control role binding',
    true,
    true
  ),
  (
    '3d580499-9efb-4fed-9327-d2eb70ed9264',
    'Undeposited Funds (Placeholder)',
    'Other Current Asset',
    'UndepositedFunds',
    'Placeholder for undeposited_funds role binding',
    true,
    true
  )
ON CONFLICT (id) DO NOTHING;

COMMIT;

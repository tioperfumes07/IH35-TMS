-- Migration: Link generic seeded accounts (1100, 2000) to their corresponding QBO accounts
-- This helps prevent conflicts during QBO sync and ensures these accounts are properly associated with QBO IDs
-- Date: 2026-06-08
-- Author: Devin AI

BEGIN;

-- Link the generic A/R account (1100) to the most recently mirrored QBO A/R account
-- Uses a subquery to get the correct QBO account (ORDER BY/LIMIT inside subquery is legal)
UPDATE catalogs.accounts ca
SET qbo_account_id = sub.qbo_id,
    account_number = CONCAT('QBO-', sub.qbo_id),
    qbo_synced_at = now(),
    notes = COALESCE(ca.notes, '') || ' | Linked to QBO via migration 202606080934'
FROM (
    SELECT qa.qbo_id
    FROM mdata.qbo_accounts qa
    WHERE qa.account_type = 'Accounts Receivable'
    ORDER BY qa.mirrored_at DESC
    LIMIT 1
) AS sub
WHERE ca.account_number = '1100'
  AND ca.account_subtype = 'AccountsReceivable'
  AND ca.qbo_account_id IS NULL
  AND NOT EXISTS (
      SELECT 1 FROM catalogs.accounts ca2 WHERE ca2.qbo_account_id = sub.qbo_id
  );

-- Link the generic A/P account (2000) to the most recently mirrored QBO A/P account
-- Uses a subquery to get the correct QBO account (ORDER BY/LIMIT inside subquery is legal)
UPDATE catalogs.accounts ca
SET qbo_account_id = sub.qbo_id,
    account_number = CONCAT('QBO-', sub.qbo_id),
    qbo_synced_at = now(),
    notes = COALESCE(ca.notes, '') || ' | Linked to QBO via migration 202606080934'
FROM (
    SELECT qa.qbo_id
    FROM mdata.qbo_accounts qa
    WHERE qa.account_type = 'Accounts Payable'
    ORDER BY qa.mirrored_at DESC
    LIMIT 1
) AS sub
WHERE ca.account_number = '2000'
  AND ca.account_subtype = 'AccountsPayable'
  AND ca.qbo_account_id IS NULL
  AND NOT EXISTS (
      SELECT 1 FROM catalogs.accounts ca2 WHERE ca2.qbo_account_id = sub.qbo_id
  );

COMMIT;

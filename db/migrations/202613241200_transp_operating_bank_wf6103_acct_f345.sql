-- FINDING: ACCT-F345 — TRANSP bill_payment last-resort credited QBO-168 Undeposited Funds (JE dcbe5700 $5).
-- Owner 2026-08-28: WF …6103 / QBO-1150040141 is Transportation's main operating bank. Bind operating_bank.
-- USMCA already bound by 202612481130. TRK 6103 bank rows have no ledger_account_id — leave unbound (fail closed).
-- Additive role bind only. No posting in this migration. Reversals use reverseJournalEntryNoFlip.

INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active)
SELECT
  '91e0bf0a-133f-4ce8-a734-2586cfa66d96'::uuid,
  'operating_bank',
  a.id,
  true
FROM catalogs.accounts a
WHERE a.operating_company_id = '91e0bf0a-133f-4ce8-a734-2586cfa66d96'::uuid
  AND a.account_number = 'QBO-1150040141'
  AND a.qbo_account_id = '1150040141'
  AND a.deactivated_at IS NULL
  AND a.is_postable = true
ON CONFLICT (operating_company_id, role) WHERE is_active = true DO NOTHING;

-- 202616270000: USMCA fuel-card-payable role bindings (443.277-B)
--
-- Root cause: resolveRoleAccountOptional('fuel_card_payable_dreamline') and
-- ('fuel_card_payable_wex') both return NULL for USMCA because catalogs.account_role_bindings
-- has no row for either role on operating_company_id 5c854333-…. The rolling ledger
-- (cash-flow.service.ts) skips the card-payable queries when the role is unbound, so the
-- $187,894.21 Dreamline balance and $29,156.88 WEX balance are invisible in the ledger.
--
-- Fix: insert the two missing role bindings, keyed to the accounts that already exist in
-- catalogs.accounts for USMCA (verified live 2026-10-25):
--   2510 "Dreamline Diesel Card Payable" → be1f70f8-fec4-463b-893d-dfc0acfe264d
--   2520 "England Logistics WEX Fuel Card Payable" → 807777a4-59ff-4441-981c-90e67e94e874

INSERT INTO catalogs.account_role_bindings
  (role_key, account_id, operating_company_id, description)
VALUES
  (
    'fuel_card_payable_dreamline',
    'be1f70f8-fec4-463b-893d-dfc0acfe264d',
    '5c854333-6ea5-4faa-af31-67cb272fef80',
    '443.277-B: USMCA Dreamline Diesel Card Payable (2510) — rolling ledger cash obligation'
  ),
  (
    'fuel_card_payable_wex',
    '807777a4-59ff-4441-981c-90e67e94e874',
    '5c854333-6ea5-4faa-af31-67cb272fef80',
    '443.277-B: USMCA England Logistics WEX Fuel Card Payable (2520) — rolling ledger cash obligation'
  )
ON CONFLICT DO NOTHING;

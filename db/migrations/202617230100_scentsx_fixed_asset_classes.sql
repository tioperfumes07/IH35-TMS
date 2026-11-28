-- SCENTSX fixed asset classes — ROUND L.31 M14 (owner 2026-11-27 19:38 CT "ASSETS, LIABILITIES … ALL FULLY COMPLETELY DONE").
-- ScentsX LLC's chart carries 1500 Store Fixtures & Equipment, 1600 Accumulated Depreciation and 6800 Depreciation Expense, and the
-- fixed-assets engine (accounting.fixed_assets + the FIN-21 depreciation poster; FIXED_ASSETS_ENABLED and AMORTIZATION_GL_POSTING_ENABLED
-- are ON for ScentsX) needs a class to register an asset in. ScentsX has none (measured 2026-11-28 02:10 UTC: 0 classes, 0 assets).
-- Four classes on those three accounts, straight line, the usual lives; the owner can change an asset's life when he registers it.
-- Catalog rows only (no asset, no money). Idempotent: a class code already there is left alone.

BEGIN;

INSERT INTO accounting.fixed_asset_classes (operating_company_id, class_code, class_name, is_depreciable, default_method, default_useful_life_months,
                                            default_asset_account_id, default_accum_depr_account_id, default_depr_expense_account_id)
SELECT co.id, t.code, t.name, true, 'straight_line', t.months,
       (SELECT a.id FROM catalogs.accounts a WHERE a.operating_company_id = co.id AND a.account_number = '1500' AND a.deactivated_at IS NULL),
       (SELECT a.id FROM catalogs.accounts a WHERE a.operating_company_id = co.id AND a.account_number = '1600' AND a.deactivated_at IS NULL),
       (SELECT a.id FROM catalogs.accounts a WHERE a.operating_company_id = co.id AND a.account_number = '6800' AND a.deactivated_at IS NULL)
  FROM org.companies co
 CROSS JOIN (VALUES ('STORE_FIXTURES', 'Store fixtures & displays', 84), ('FURNITURE', 'Furniture & office equipment', 84),
                    ('COMPUTERS', 'Computers, POS & electronics', 60), ('LEASEHOLD', 'Leasehold improvements', 180)) AS t(code, name, months)
 WHERE co.code = 'SCENTSX'
   AND NOT EXISTS (SELECT 1 FROM accounting.fixed_asset_classes x WHERE x.operating_company_id = co.id AND x.class_code = t.code AND x.is_active = true);

COMMIT;

-- SCENTSX expense items — ROUND L.31 M5 (owner ruling 2026-11-27 22:40 CT "Exempt ScentsX": ScentsX LLC has no trucks, its expenses
-- post with no unit). Every expense / check line must name a Products & Services item (CHECK expense_lines_item_id_required), and the
-- item carries the expense account the line posts to (expense-writer.service completeExpenseLine). ScentsX has items only for its
-- sales, freight-in and customs (measured 2026-11-28 04:50 UTC: 3 Service + 4 NonInventory + 1 Charge + 1 Discount + 31,385 Inventory),
-- so no rent, utility or card-fee expense can be written. One Service item per ScentsX expense category (catalogs.expense_categories,
-- metadata.account_number), same code, its account as default_expense_account_id; plus "Supplier deposit" → 1310 for deposits paid by
-- check. Catalog rows only (no money). Idempotent: an item code already there (FREIGHT_IN / CUSTOMS exist as FREIGHT-IN / CUSTOMS) is left alone.

BEGIN;

INSERT INTO catalogs.items (operating_company_id, item_name, item_code, item_type, description, taxable, default_expense_account_id)
SELECT co.id, e.display_name, 'EXP-' || e.code, 'Service', 'Expense — ' || e.display_name, false,
       (SELECT a.id FROM catalogs.accounts a WHERE a.operating_company_id = co.id AND a.account_number = e.metadata->>'account_number' AND a.deactivated_at IS NULL LIMIT 1)
  FROM org.companies co
  JOIN catalogs.expense_categories e ON e.operating_company_id = co.id AND e.is_active
 WHERE co.code = 'SCENTSX'
   AND e.code NOT IN ('FREIGHT_IN', 'CUSTOMS')
   AND EXISTS (SELECT 1 FROM catalogs.accounts a WHERE a.operating_company_id = co.id AND a.account_number = e.metadata->>'account_number' AND a.deactivated_at IS NULL)
   AND NOT EXISTS (SELECT 1 FROM catalogs.items i WHERE i.operating_company_id = co.id AND i.item_code = 'EXP-' || e.code AND i.deactivated_at IS NULL);

INSERT INTO catalogs.items (operating_company_id, item_name, item_code, item_type, description, taxable, default_expense_account_id)
SELECT co.id, 'Supplier deposit', 'EXP-SUPPLIER-DEPOSIT', 'Service', 'Paid to a supplier before the goods arrive (1310 Supplier Deposits)', false,
       (SELECT a.id FROM catalogs.accounts a WHERE a.operating_company_id = co.id AND a.account_number = '1310' AND a.deactivated_at IS NULL LIMIT 1)
  FROM org.companies co
 WHERE co.code = 'SCENTSX'
   AND EXISTS (SELECT 1 FROM catalogs.accounts a WHERE a.operating_company_id = co.id AND a.account_number = '1310' AND a.deactivated_at IS NULL)
   AND NOT EXISTS (SELECT 1 FROM catalogs.items i WHERE i.operating_company_id = co.id AND i.item_code = 'EXP-SUPPLIER-DEPOSIT' AND i.deactivated_at IS NULL);

COMMIT;

-- ROUND 443.29 a (owner 2026-10-10 7:15 PM CT: "when creating fuel transactions from relay in a load, we must be able to
-- create the 2 dollar fee they charge so we can match that transaction ... and have it give the same totals"; 7:19 PM CT:
-- the Relay fee posts to "Fuel Card Fees" (5005)).
--
-- ROOT CAUSE: the Relay fill poster (apps/backend/src/accounting/fuel-posting/poster.service.ts:294) and the fuel expense
-- document (apps/backend/src/fuel/fuel-expense-document.service.ts:117) resolve the fee leg by the item named
-- "Fuel Card Fee". Measured 2026-10-11 on production: that item exists in NO company, every USMCA Relay fill (252) reports
-- a fee, and 0 Relay fills have ever posted to 1295 — the fee leg could never resolve.
--
-- FIX: one catalog item per company that HAS a "Fuel Card Fees" (5005) account and no "Fuel Card Fee" item yet — today that
-- is USMCA only. NonInventory, same category as the other fuel items, default expense account 5005. Idempotent; no
-- hardcoded ids (resolved by account number and item name); a fresh database without those rows is a no-op.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT a.operating_company_id AS company_id, a.id AS fee_account_id,
           (SELECT i.category_id FROM catalogs.items i
             WHERE i.operating_company_id = a.operating_company_id AND i.item_name = 'Fuel-Truck Diesel'
               AND i.deactivated_at IS NULL LIMIT 1) AS category_id
      FROM catalogs.accounts a
      JOIN org.companies c ON c.id = a.operating_company_id AND c.code = 'USMCA'
     WHERE a.account_number = '5005'
       AND NOT EXISTS (SELECT 1 FROM catalogs.items i
                        WHERE i.operating_company_id = a.operating_company_id AND i.item_name = 'Fuel Card Fee')
  LOOP
    INSERT INTO catalogs.items (operating_company_id, item_name, item_type, description, default_expense_account_id, category_id, taxable)
    VALUES (r.company_id, 'Fuel Card Fee', 'NonInventory',
            'Fee the fuel card network charges per transaction (Relay: $2.00 fill, $1.50 scale, $5.00 lumper — the value Relay reports). Posts to Fuel Card Fees (5005).',
            r.fee_account_id, r.category_id, false);
  END LOOP;
END $$;

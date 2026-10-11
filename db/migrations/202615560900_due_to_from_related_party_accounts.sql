-- 202615560900_due_to_from_related_party_accounts.sql
-- CC-3 · OWNER DECISION 2026-10-11 10:00 CT (Lead 443.59) / RULING 443.62 #3-#4. Taken from CC-1 #26377, whose 202610110100
-- sorted before the newest applied migration (the class that blocked every prod deploy for two hours on 2026-10-11).
-- One running ledger account per related party, "Due to / from <party>", carrying a debit OR a credit balance (presentation
-- follows the sign at the report date; the account does not move). The existing USMCA sub-accounts 2410-00-001..004 are
-- reused: only account_name changes — id, account_number, type, parent and every posting stay exactly as they are.
-- Measured on prod 2026-10-11 16:40 UTC: the 4 rows carry "<party> — Related-Party Loan"; 2410-00-001 holds today's two
-- card-0210 Relay JEs (Cr 5,162.50 + Cr 2,065.00 = 7,227.50), which read on the renamed account unchanged.
-- Apply-twice safe; touches no other company; on a database without these accounts it changes nothing.
BEGIN;
SET LOCAL lock_timeout = '5s';

UPDATE catalogs.accounts a
   SET account_name = v.new_name,
       updated_at = now()
  FROM (VALUES
          ('2410-00-001', 'Due to / from Jorge Pablo Guadalupe Muñoz Gonzalez'),
          ('2410-00-002', 'Due to / from Scentsx'),
          ('2410-00-003', 'Due to / from Tio Perfumes 2'),
          ('2410-00-004', 'Due to / from Laura Muñoz')
       ) AS v(account_number, new_name)
 WHERE a.operating_company_id = (SELECT id FROM org.companies WHERE code = 'USMCA')
   AND a.account_number = v.account_number
   AND a.account_name IS DISTINCT FROM v.new_name;

-- Fail closed: every one of the four that exists must now carry its new name.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM catalogs.accounts a
      JOIN org.companies c ON c.id = a.operating_company_id AND c.code = 'USMCA'
     WHERE a.account_number IN ('2410-00-001', '2410-00-002', '2410-00-003', '2410-00-004')
       AND a.account_name NOT LIKE 'Due to / from %'
  ) THEN
    RAISE EXCEPTION '202615560900: a USMCA 2410-00-00x sub-account does not carry its "Due to / from <party>" name';
  END IF;
END $$;

COMMIT;

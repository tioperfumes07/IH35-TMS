-- item-catalog-seed-03-backfill-category-ids.sql
--
-- Companion to item-catalog-seed-02-137-items-canonical.sql, needed because that seed script's
-- items INSERT is INSERT-only (WHERE NOT EXISTS on item_code, no ON CONFLICT -- catalogs.items
-- has no matching unique constraint for one). The 137 items were already loaded live earlier
-- this session (category_id NULL, reverted from an invented catalogs.qbo_categories linkage
-- pending correction) -- seed-02's own INSERT correctly did nothing for them (they already
-- exist), which left their category_id permanently NULL. This UPDATE backfills category_id for
-- exactly those pre-existing rows, using the identical item_code -> item_category mapping
-- seed-02 itself carries (extracted verbatim from its own src CTE) -- never a second, drifted
-- source of truth for the mapping.
--
-- Idempotent: only touches rows where category_id IS NULL; a second run is a no-op once every
-- row is set.
BEGIN;
SET LOCAL app.bypass_rls = 'lucia';

WITH src (item_category, item_code) AS (
  VALUES
  ('Sales of Service Income', 'SALES-OF-SER-LINE-HAUL'),
  ('', 'HOURS'),
  ('Sales of Service Income', 'SALES-OF-SER-WAREHOUSE-LUMPER-FEE'),
  ('', 'FUEL-SURCHARGE'),
  ('Sales of Service Income', 'SALES-OF-SER-LAYOVER-CHARGE'),
  ('Sales of Service Income', 'SALES-OF-SER-CUSTOMER-EXPENSE-PRODUCT-DISPOSAL-FEE'),
  ('Sales of Service Income', 'SALES-OF-SER-SALES-TRANSLOAD'),
  ('Sales of Service Income', 'SALES-OF-SER-EXTRA-DELIVERY-PICK-DROP'),
  ('Sales of Service Income', 'SALES-OF-SER-SALES-DETENTION-CHARGE'),
  ('Sales of Service Income', 'SALES-OF-SER-DEDUCTION-FOR-DAMAGED-PRODUCT'),
  ('Sales of Service Income', 'SALES-OF-SER-CUSTOMER-PMT-FUEL-ADVANCE'),
  ('Driver Salaries', 'DRIVER-SALAR-DRIVER-PAY-EXTRA-PICK-DELIVERY-DROP'),
  ('Sales of Service Income', 'SALES-OF-SER-DEDUCTION-CHARGE-FOR-DAMAGES'),
  ('Sales of Service Income', 'SALES-OF-SER-SALES-PERMIT-FEE-EXPENSE'),
  ('Operational Licenses, Permits & Taxes', 'OPERATIONAL-OVERSIZE-PERMIT'),
  ('Driver Salaries', 'DRIVER-SALAR-DRIVER-PAY-MEXICO-B1-DRIVER-EMPTY-MILES'),
  ('Driver Salaries', 'DRIVER-SALAR-DRIVER-PAY-MEXICO-B1-DRIVER-LOADED-MILES'),
  ('Scale Expense', 'SCALE-EXPENS-OTR-SCALE-EXPENSE'),
  ('Fuel Expenses', 'FUEL-EXPENSE-FUEL-TRUCK-DIESEL'),
  ('Fuel Expenses', 'FUEL-EXPENSE-FUEL-REEFER-DIESEL'),
  ('Sales of Service Income', 'SALES-OF-SER-CUSTOMER-EXPENSE-REEFER-TRAILER-WASHOUT'),
  ('Fuel Expenses', 'FUEL-EXPENSE-FUEL-DEF-DIESEL-EXHAUST-FLUID'),
  ('Driver Deductions', 'DRIVER-DEDUC-DRIVER-DEDUCTION-ESCROW-FOR-CLAIMS-2026'),
  ('Driver Salaries', 'DRIVER-SALAR-DRIVER-PAY-LAYOVER-ESTANCIA'),
  ('Driver Salaries', 'DRIVER-SALAR-DRIVER-PAY-BONUS'),
  ('Driver Salaries', 'DRIVER-SALAR-DRIVER-PAY-TARP-ENLONADA-DESENLONADA'),
  ('Driver Salaries', 'DRIVER-SALAR-DRIVER-PAY-LOCAL-MOVEMENT'),
  ('Driver Salaries', 'DRIVER-SALAR-DRIVER-PAY-OVERSIZE-LOAD'),
  ('Sales of Service Income', 'SALES-OF-SER-SHAG-FEE'),
  ('Driver Reimbursements', 'DRIVER-REIMB-DRIVER-REIMBURSEMENT-FUEL-DEF'),
  ('Driver Reimbursements', 'DRIVER-REIMB-DRIVER-REIMBURSEMENT-OTR-MAINTENANCE-OILS-ADDIT'),
  ('Driver Reimbursements', 'DRIVER-REIMB-DRIVER-REIMBURSEMENT-TPE-TOLL-EXPENSE'),
  ('Driver Reimbursements', 'DRIVER-REIMB-DRIVER-REIMBURSEMENT-SCALE-EXPENSE'),
  ('Driver Deductions', 'DRIVER-DEDUC-DRIVER-DEDUCTION-EXPRESS-CODE-FEE'),
  ('Driver Deductions', 'DRIVER-DEDUC-DRIVER-DEDUCTION-FINES-VIOLATIONS'),
  ('Driver Deductions', 'DRIVER-DEDUC-DRIVER-DEDUCTION-I-94-PERMIT'),
  ('Driver Deductions', 'DRIVER-DEDUC-DRIVER-DEDUCTION-WIRE-ACH-FEE'),
  ('Driver Deductions', 'DRIVER-DEDUC-DRIVER-DEDUCTION-FINE-LATE-DELIVERY-FEE'),
  ('Sales of Service Income', 'SALES-OF-SER-DEDUCTION-COMPANY-FINE-FOR-LATE-DELIVERY'),
  ('Repair & Maintenance-Over the Road', 'REPAIR-MAI-OTR-ADDITIVES-OIL-ANTIFREEZE'),
  ('Software Expenses', 'SOFTWARE-EXP-GOOGLE'),
  ('Software Expenses', 'SOFTWARE-EXP-ALL-WAYS-TRACK'),
  ('Software Expenses', 'SOFTWARE-EXP-ANYDESK'),
  ('Software Expenses', 'SOFTWARE-EXP-APPLE'),
  ('Software Expenses', 'SOFTWARE-EXP-CREDIT-SCORE'),
  ('Software Expenses', 'SOFTWARE-EXP-DAT-SOLUTIONS-360'),
  ('Software Expenses', 'SOFTWARE-EXP-INTUIT-QUICK-BOOKS'),
  ('Software Expenses', 'SOFTWARE-EXP-SAASANT-SOFTWARE'),
  ('Software Expenses', 'SOFTWARE-EXP-SAMSARA-GPS'),
  ('Driver Salaries', 'DRIVER-SALAR-DRIVER-PAY-CDL-EMPTY-MILES'),
  ('Driver Salaries', 'DRIVER-SALAR-DRIVER-PAY-CDL-LOADED-MILES'),
  ('Repair & Maintenance-Over the Road', 'REPAIR-MAI-OTR-MAINTENANCE-TOOLS'),
  ('Driver Reimbursements', 'DRIVER-REIMB-DRIVER-REIMBURSEMENT-WAREHOUSE-LUMPER-FEE'),
  ('Driver Deductions', 'DRIVER-DEDUC-DRIVER-DEDUCTIONS-MISCELLANEOUS'),
  ('Bank Charges', 'BANK-CHARGES-BC-BANK-ACH-WIRE-FEES'),
  ('Freight Delivery Costs', 'FREIGHT-DELI-REEFER-TRAILER-WASHOUT-EXPENSE'),
  ('Bridge & Toll Expenses', 'BRIDGE-TOL-BRIDGE-TOLL-EXP-DTOPS-BRIDGE-TOLLS-USA'),
  ('Operational Licenses, Permits & Taxes', 'OPERATIONAL-KENTUCKY-STATE-PERMITS'),
  ('Freight Delivery Costs', 'FREIGHT-DELI-DRIVER-ANTIDOPING-EXPENSE'),
  ('Operational Licenses, Permits & Taxes', 'OPERATIONAL-STATE-PERMITS-NEW-MEXICO'),
  ('Operational Licenses, Permits & Taxes', 'OPERATIONAL-STATE-PERMITS-ARKANSAS'),
  ('Bank Charges', 'BANK-CHARGES-BC-COMDATA-EXPRESS-CHECK-FEE'),
  ('Bank Charges', 'BANK-CHARGES-BC-MONTHLY-BANK-CHARGE'),
  ('Bank Charges', 'BANK-CHARGES-BC-NSF-FEE'),
  ('Employees-Payroll & Contractors', 'EMPLOYEES-PA-MECANICS-NUEVO-LAREDO'),
  ('Employees-Payroll & Contractors', 'EMPLOYEES-PA-MECANICS-LAREDO-TEXAS'),
  ('Employees-Payroll & Contractors', 'EMPLOYEES-PA-DISPATCHER-SERVICES-USA'),
  ('Employees-Payroll & Contractors', 'EMPLOYEES-PA-DISPATCHER-SERVICES-MEXICO'),
  ('Employees-Payroll & Contractors', 'EMPLOYEES-PA-SAFETY-OFFICER-SERVICES'),
  ('Employees-Payroll & Contractors', 'EMPLOYEES-PA-MECANICS-EXTRA-PAY'),
  ('Employees-Payroll & Contractors', 'EMPLOYEES-PA-NOMINA-OPERADOR-LOCAL'),
  ('Employees-Payroll & Contractors', 'EMPLOYEES-PA-EMPLOYEES-DATA-ENTRY-NUEVO-LAREDO'),
  ('Building Rent & Lease Expense', 'BUILDING-REN-RENT-OFFICE-LAREDO-TEXAS'),
  ('Building Rent & Lease Expense', 'BUILDING-REN-RENT-OFFICE-NUEVO-LAREDO'),
  ('Building Rent & Lease Expense', 'BUILDING-REN-RENT-TRUCK-YARD-COLOMBIA-NUEVO-LE-N'),
  ('Utilities Expense', 'UTILITIES-EX-UE-ELECTRICITY'),
  ('Utilities Expense', 'UTILITIES-EX-UE-SANITATION-WASTE-MGMT'),
  ('Utilities Expense', 'UTILITIES-EX-UE-SEWER-WATER'),
  ('Utilities Expense', 'UTILITIES-EX-UE-TELEPHONE-INTERNET'),
  ('Operational Licenses, Permits & Taxes', 'OPERATIONAL-PERMIT-IRP-LICENSE-PLATES-TEXAS'),
  ('Operational Licenses, Permits & Taxes', 'OPERATIONAL-PERMIT-LICENSE-PLATES-MEXICO'),
  ('Operational Licenses, Permits & Taxes', 'OPERATIONAL-TAX-2290-HEAVY-HIGHWAY-VEHICLE-TAX'),
  ('Operational Licenses, Permits & Taxes', 'OPERATIONAL-TAX-IFTA-MOTOR-FUEL-TAX'),
  ('Operational Licenses, Permits & Taxes', 'OPERATIONAL-TAX-UNIFIED-CARRIER-UCR'),
  ('Operational Licenses, Permits & Taxes', 'OPERATIONAL-TAX-VEHICLE-INSPECTION'),
  ('Operational Licenses, Permits & Taxes', 'OPERATIONAL-PERMITS-MEXICO'),
  ('Bridge & Toll Expenses', 'BRIDGE-TOL-HIGHWAY-TOLL-EXPENSE-USA'),
  ('Bridge & Toll Expenses', 'BRIDGE-TOL-HIGHWAY-TOLL-EXPENSE-MEXICO'),
  ('Bridge & Toll Expenses', 'BRIDGE-TOL-BRIDGE-TOLL-EXPENSE-MEXICO'),
  ('Employees-Payroll & Contractors', 'EMPLOYEES-PA-ACCOUNTING-BOOKKEEPING-EMPLOYEES'),
  ('Repair & Maintenance-Roadservice', 'REPAIR-MAI-ROAD-SERVICE-REEFER-REPAIR-EXPENSE'),
  ('Repair & Maintenance-Roadservice', 'REPAIR-MAI-ROAD-SERVICE-FLATBED-REPAIR-EXPENSE'),
  ('Repair & Maintenance-Roadservice', 'REPAIR-MAI-ROAD-SERVICE-TRAILER-TIRE-EXPENSE'),
  ('Repair & Maintenance-Roadservice', 'REPAIR-MAI-ROAD-SERVICE-TRUCK-REPAIR-EXPENSE'),
  ('Repair & Maintenance-Roadservice', 'REPAIR-MAI-ROAD-SERVICE-TRUCK-TIRE-EXPENSE'),
  ('Repair & Maintenance-IH 35-Internal Mechanic Shop', 'REPAIR-MAI-IH-35-INTERNAL-OIL-ADDITIVE-EXPENSE-617'),
  ('Repair & Maintenance-IH 35-Internal Mechanic Shop', 'REPAIR-MAI-IH-35-INTERNAL-TRAILER-REPAIR-MAINTENANCE'),
  ('Repair & Maintenance-IH 35-Internal Mechanic Shop', 'REPAIR-MAI-IH-35-INTERNAL-REEFER-TIRE-EXPENSE'),
  ('Repair & Maintenance-IH 35-Internal Mechanic Shop', 'REPAIR-MAI-IH-35-INTERNAL-TRUCK-REPAIR-MAINTENANCE'),
  ('Repair & Maintenance-IH 35-Internal Mechanic Shop', 'REPAIR-MAI-IH-35-INTERNAL-TRUCK-TIRE-EXPENSES'),
  ('Repair & Maintenance-Local External Mechanic Shop', 'REPAIR-MAI-EXTERNAL-MECHANIC-SHOP-TRAILER-REPAIR'),
  ('Repair & Maintenance-Local External Mechanic Shop', 'REPAIR-MAI-EXTERNAL-MECHANIC-SHOP-TRACTOR-TRUCK'),
  ('Driver Deductions', 'DRIVER-DEDUC-DRIVER-DEDUCTION-FOR-ACCIDENT-DAMAGES-TO-EQUIPM'),
  ('Driver Deductions', 'DRIVER-DEDUC-DRIVER-DEDUCTION-MEALS'),
  ('Sales of Service Income', 'SALES-OF-SER-SALES-INTERNATIONAL-BORDER-CROSSING'),
  ('Travel Expenses-Drivers', 'TRAVEL-EXPEN-DRIVER-MEALS-EXPENSE'),
  ('Travel Expenses-Drivers', 'TRAVEL-EXPEN-DRIVER-HOTEL-LODGING-EXPENSE'),
  ('Sales of Service Income', 'SALES-OF-SER-SALES-ESCORT-EXPENSE'),
  ('Freight Delivery Costs', 'FREIGHT-DELI-ESCORT-EXPENSE'),
  ('Bridge & Toll Expenses', 'BRIDGE-TOL-OTR-PARKING-EXPENSE'),
  ('Employees-Payroll & Contractors', 'EMPLOYEES-PA-HUMAN-RESOURCES-EMPLOYEE-FINDER'),
  ('Repair & Maintenance-IH 35-Internal Mechanic Shop', 'REPAIR-MAI-IH-35-INTERNAL-FLATBED-TRAILER-TIRE-EXPENSE'),
  ('Operational Licenses, Permits & Taxes', 'OPERATIONAL-STATE-PERMIT-OKLAHOMA'),
  ('Driver Salaries', 'DRIVER-SALAR-PETTY-CASH-ADVANCE-CAJA-CHICA'),
  ('Freight Delivery Costs', 'FREIGHT-DELI-DOCUMENTOS-CRUCES-MANIFIESTOS-ETC'),
  ('Driver Salaries', 'DRIVER-SALAR-DRIVER-PAY-EXTRA-FOR-REPAIRS-MAINTENANCE'),
  ('Driver Deductions', 'DRIVER-DEDUC-DRIVER-DEDUCTION-PERSONAL-EXPENSES-TELEPHONE-ET'),
  ('', 'DOWN-PAYMENT-INSURANCE'),
  ('Bank Charges', 'BANK-CHARGES-BC-RELAY-WIRE-FEES'),
  ('Bank Charges', 'BANK-CHARGES-BC-RELAY-DIESEL-CODE-FEE'),
  ('Software Expenses', 'SOFTWARE-EXP-CHAT-GPT-SOFTWARE'),
  ('Software Expenses', 'SOFTWARE-EXP-EMPLOYEE-HIRING-SOFTWARE'),
  ('Freight Delivery Costs', 'FREIGHT-DELI-WAREHOUSE-LUMPER-EXPENSE'),
  ('Software Expenses', 'SOFTWARE-EXP-ALVYS-SOFTWARE'),
  ('', 'TONU'),
  ('Sales of Service Income', 'SALES-OF-SER-SALES-LOCAL-MOVEMENT'),
  ('Sales of Service Income', 'SALES-OF-SER-SALES-TRACKING-MACROPOINT-COMPLIANCE'),
  ('Sales of Service Income', 'SALES-OF-SER-SALES-ON-TIME-PICKUP-APPOINTMENT'),
  ('Sales of Service Income', 'SALES-OF-SER-SALES-ON-TIME-DELIVERY-APPOINTMENT'),
  ('Sales of Service Income', 'SALES-OF-SER-SALES-TARP-CHARGE'),
  ('Driver Deductions', 'DRIVER-DEDUC-DRIVER-DEDUCTION-COMPANY-VEHICLE-USE-FEE'),
  ('Driver Deductions', 'DRIVER-DEDUC-DRIVER-DEDUCTION-MISSING-OR-LATE-PAPERWORK-POD'),
  ('Driver Deductions', 'DRIVER-DEDUC-DRIVER-DEDUCTION-LUMPER-NOT-PAID-OR-RECEIPT-MIS'),
  ('Driver Deductions', 'DRIVER-DEDUC-DRIVER-DEDUCTION-CARGO-DAMAGE-OS-D'),
  ('Driver Deductions', 'DRIVER-DEDUC-DRIVER-DEDUCTION-DETENTION-DENIED-DRIVER-DELAY'),
  ('Driver Deductions', 'DRIVER-DEDUC-DRIVER-DEDUCTION-MISSED-APPOINTMENT'),
  ('Driver Deductions', 'DRIVER-DEDUC-DRIVER-DEDUCTION-LOAD-NOT-TARPED-OR-SECURED')
)
UPDATE catalogs.items i
SET category_id = c.id, updated_at = now()
FROM src s
JOIN catalogs.qbo_categories c
  ON c.display_name = s.item_category AND c.operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'
WHERE i.operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'
  AND i.item_code = s.item_code
  AND i.category_id IS NULL
  AND i.deactivated_at IS NULL;

SELECT 'categories' AS what, count(*) AS n FROM catalogs.qbo_categories
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'
UNION ALL SELECT 'items active', count(*) FROM catalogs.items
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80' AND deactivated_at IS NULL
UNION ALL SELECT 'items with NO account', count(*) FROM catalogs.items
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80' AND deactivated_at IS NULL
   AND default_income_account_id IS NULL AND default_expense_account_id IS NULL
UNION ALL SELECT 'items with NO category', count(*) FROM catalogs.items
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80' AND deactivated_at IS NULL
   AND category_id IS NULL
UNION ALL SELECT 'test items still active', count(*) FROM catalogs.items
 WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80' AND deactivated_at IS NULL
   AND item_name ~* '^(TEST|ZZ-SAMPLE|CC2-|P42 )';
COMMIT;

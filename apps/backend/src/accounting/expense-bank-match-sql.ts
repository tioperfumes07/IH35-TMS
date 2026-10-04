// Shared SQL fragments for the Expense <-> bank-line reverse hop. Lives OUTSIDE expenses.routes.ts on purpose: a service
// (bills.service.ts) imported this constant from the route module, which pulled the HTTP auth middleware and the Lucia
// session provider into every module that touches bills — the maintenance poster included — and made four test files
// fail to load ("No luciaPool export ... on the auth/db mock"). A service never imports a route (CC-2 2026-10-04).

/** Bank-recon accept stamps banking.bank_transactions.matched_expense_id — reverse hop for Expenses (alias e). */
export const EXPENSE_MATCHED_BANK_TRANSACTION_ID_SQL = `
  (
    SELECT bt.id::text
    FROM banking.bank_transactions bt
    WHERE bt.operating_company_id = e.operating_company_id
      AND bt.matched_expense_id = e.id
    ORDER BY bt.transaction_date DESC, bt.created_at DESC
    LIMIT 1
  )
`;

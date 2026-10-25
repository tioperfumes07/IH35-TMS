/**
 * LEAD 443.321 — ONE rule for every report that subtracts BOTH fuel.fuel_transactions (as Fuel) AND
 * accounting.expenses (as Expenses) on the same loads.
 *
 * Since 10-11 every Relay / Dreamline / EFS fuel fill also has an accounting.expenses document whose
 * source_fuel_transaction_id points back at the fuel transaction (612 on 10-11, 75 on 10-16, 78 on
 * 10-21 in USMCA). That expense IS the fuel purchase's accounting record, not a second cost. A report
 * that already counts the fuel transaction must leave that expense out, or the fuel is subtracted
 * twice. Measured 10-24 prod USMCA: 692 such expenses ($290,886.98) on company-settlement loads; 61
 * of 81 company settlements showed a negative net, 23 after the fix.
 *
 * Load Costs (load-cost-rollup.sql.ts) already splits on the same column (fuel_cents vs
 * non_fuel_expense_cents). This predicate is for readers that take fuel from fuel_transactions.
 *
 * @param expenseAlias  alias of the accounting.expenses row
 * @param companySql    SQL for the operating company uuid (e.g. "$1::uuid")
 * @param loadIdsSql    SQL for the uuid[] of loads whose fuel transactions the report counts
 */
export function expenseIsNotCountedFuelSql(expenseAlias: string, companySql: string, loadIdsSql: string): string {
  return `NOT EXISTS (
          SELECT 1 FROM fuel.fuel_transactions eft
          WHERE eft.id = ${expenseAlias}.source_fuel_transaction_id
            AND eft.operating_company_id = ${companySql}
            AND eft.load_id = ANY(${loadIdsSql})
            AND eft.voided_at IS NULL AND eft.archived_at IS NULL
        )`;
}

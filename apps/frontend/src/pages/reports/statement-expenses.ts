import { listExpenses, type ExpenseListRow } from "../../api/accounting";

/** The statement's expense history is the selected period, not a capped browse page. */
export async function listExpensesForStatement(companyId: string, vendorId: string, start: string, end: string) {
  const rows: ExpenseListRow[] = [];
  const limit = 200;
  for (let offset = 0; ; offset += limit) {
    const page = await listExpenses(companyId, {
      vendor_uuid: vendorId,
      status: "active",
      date_from: start,
      date_to: end,
      limit,
      offset,
    });
    rows.push(...page.rows);
    if (page.rows.length < limit) return { rows };
  }
}

/** Additional-only driver pay plan (itemized pay, no per-mile rate). Moved VERBATIM out of book-load.service.ts (which re-exports it) to break the cycle book-load -> ... -> driver-pay-delivery-accrual -> book-load. No behavior change. */


export type AdditionalOnlyDriverPayPlan = { mode: "additional_pay_only"; amount_cents: number; reason: string;
  lines: Array<{ item_id: string; amount_cents: number; description: string }> };

export function additionalOnlyDriverPay(load: Record<string, unknown>): AdditionalOnlyDriverPayPlan | null {
  const metadata = load.quicksave_pending_fields as { driver_pay_plan?: AdditionalOnlyDriverPayPlan } | null;
  const plan = metadata?.driver_pay_plan;
  if (!plan) return null;
  if (plan.mode !== "additional_pay_only" || !Number.isSafeInteger(plan.amount_cents) || plan.amount_cents <= 0 || !plan.reason?.trim() ||
      !Array.isArray(plan.lines) || plan.lines.length !== 1 || plan.lines.some(l => !l.item_id || !Number.isSafeInteger(l.amount_cents) || l.amount_cents <= 0) ||
      plan.lines.reduce((sum, l) => sum + l.amount_cents, 0) !== plan.amount_cents) {
    throw new Error("driver_pay_plan_invalid");
  }
  return plan;
}

export async function additionalOnlyPayItems(
  client: { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> },
  operatingCompanyId: string, plan: AdditionalOnlyDriverPayPlan,
) {
  additionalOnlyDriverPay({ quicksave_pending_fields: { driver_pay_plan: plan } });
  const lines = [];
  for (const line of plan.lines) {
    const item = (await client.query<{ account_id: string; account_number: string | null; account_name: string }>(
      `SELECT a.id::text AS account_id, a.account_number, a.account_name FROM catalogs.items i JOIN catalogs.accounts a
         ON a.id = i.default_expense_account_id AND a.operating_company_id = i.operating_company_id
       WHERE i.id = $1::uuid AND i.operating_company_id = $2::uuid
         AND i.deactivated_at IS NULL AND a.deactivated_at IS NULL AND a.is_postable = true FOR SHARE OF i, a`,
      [line.item_id, operatingCompanyId],
    )).rows[0];
    if (!item) throw new Error("additional_only_pay_item_unmapped");
    lines.push({ ...line, ...item });
  }
  return lines;
}

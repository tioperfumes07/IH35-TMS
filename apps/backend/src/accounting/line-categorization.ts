/**
 * 443.67 G3 / 443.100 row 816 — the app side of the line-categorization law.
 *
 * Migration 202615620900 refuses, at the database, a bill / expense / invoice line of an enforcing company
 * (org.companies.enforce_line_categorization) whose account differs from its item's default account unless the
 * line carries item_account_override_reason (>= 10 chars, who / why). Until this file no app writer could pass
 * that reason, so a deliberate override was impossible in-app and every refusal surfaced as a 500.
 *
 * - assertLineAccountMatchesItem: the same rule as the trigger, checked before the INSERT so the writer answers
 *   with a named 422 the operator can act on. The trigger stays the backstop.
 * - lineCategorizationRefusal: maps the trigger's own refusals (line_account_differs_from_item /
 *   line_item_required) to that same 422 when they arrive from the database.
 */
type Queryable = { query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }> };

export const ITEM_ACCOUNT_OVERRIDE_REASON_MIN = 10;

export class LineCategorizationError extends Error {
  readonly field = "item_account_override_reason";
  constructor(readonly code: "line_account_differs_from_item" | "line_item_required", readonly detail: string) {
    super(code);
  }
}

/** The line's account must be its item's default account, or the line says why it is not. */
export async function assertLineAccountMatchesItem(
  client: Queryable,
  args: {
    operatingCompanyId: string;
    side: "expense" | "income";
    itemId: string | null | undefined;
    accountId: string | null | undefined;
    overrideReason: string | null | undefined;
  }
): Promise<void> {
  if (!args.itemId || !args.accountId) return;
  const enforced = await client.query<{ enforce: boolean }>(
    `SELECT c.enforce_line_categorization AS enforce FROM org.companies c WHERE c.id = $1::uuid`,
    [args.operatingCompanyId]
  );
  if (!enforced.rows[0]?.enforce) return;
  const item = await client.query<{ item_account: string | null }>(
    `SELECT (CASE WHEN $3 = 'income' THEN i.default_income_account_id ELSE i.default_expense_account_id END)::text AS item_account
       FROM catalogs.items i WHERE i.id = $1::uuid AND i.operating_company_id = $2::uuid`,
    [args.itemId, args.operatingCompanyId, args.side]
  );
  const itemAccount = item.rows[0]?.item_account ?? null;
  if (itemAccount === args.accountId) return;
  if ((args.overrideReason ?? "").trim().length >= ITEM_ACCOUNT_OVERRIDE_REASON_MIN) return;
  throw new LineCategorizationError(
    "line_account_differs_from_item",
    `the line's account differs from its item's default account; give item_account_override_reason (>= ${ITEM_ACCOUNT_OVERRIDE_REASON_MIN} chars: who / why) or fix the item`
  );
}

/** The 422 body for a categorization refusal from this file or from the database trigger, else null. */
export function lineCategorizationRefusal(error: unknown): { error: string; field: string; message: string } | null {
  if (error instanceof LineCategorizationError) return { error: error.code, field: error.field, message: error.detail };
  const message = String((error as { message?: unknown })?.message ?? "");
  const code = /^(line_account_differs_from_item|line_item_required)\b/.exec(message)?.[1];
  return code ? { error: code, field: code === "line_item_required" ? "item_id" : "item_account_override_reason", message } : null;
}

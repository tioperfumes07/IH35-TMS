import { withLuciaBypass } from "../../auth/db.js";

export const EXPENSE_CATEGORY_MAP_KIND_VALUES = [
  "fuel",
  "maintenance",
  "revenue",
  "driver_pay",
  "factoring_fee",
  "toll",
  "escrow",
  "insurance",
  "office",
  "other",
  "cash_advance",
] as const;

export type ExpenseCategoryMapKind = (typeof EXPENSE_CATEGORY_MAP_KIND_VALUES)[number];
export type ExpenseCategoryPostingSide = "debit" | "credit";

export class ExpenseCategoryMapResolutionError extends Error {
  code: "EXPENSE_CATEGORY_MAP_NOT_FOUND";

  constructor(message: string) {
    super(message);
    this.code = "EXPENSE_CATEGORY_MAP_NOT_FOUND";
  }
}

export async function resolveAccountForCategory(
  operating_company_id: string,
  category_kind: ExpenseCategoryMapKind,
  category_code: string
): Promise<{ account_id: string; posting_side: ExpenseCategoryPostingSide }> {
  const normalizedCode = category_code.trim();
  if (!normalizedCode) {
    throw new ExpenseCategoryMapResolutionError(`No active expense category mapping: kind=${category_kind}, code=(empty)`);
  }

  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operating_company_id]);
    const result = await client.query<{ account_id: string; posting_side: ExpenseCategoryPostingSide }>(
      `
        SELECT
          account_id::text AS account_id,
          posting_side::text AS posting_side
        FROM accounting.expense_category_account_map
        WHERE operating_company_id = $1::uuid
          AND category_kind = $2
          AND category_code = $3
          AND is_active = true
        ORDER BY updated_at DESC
        LIMIT 1
      `,
      [operating_company_id, category_kind, normalizedCode]
    );
    const row = result.rows[0];
    if (!row) {
      throw new ExpenseCategoryMapResolutionError(
        `No active expense category mapping for operating_company_id=${operating_company_id}, category_kind=${category_kind}, category_code=${normalizedCode}`
      );
    }
    return { account_id: row.account_id, posting_side: row.posting_side };
  });
}

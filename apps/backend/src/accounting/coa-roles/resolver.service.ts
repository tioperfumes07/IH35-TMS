export const COA_ROLE_VALUES = [
  "ar_control",
  "ap_control",
  "cash_clearing",
  "undeposited_funds",
  "revenue_default",
  "expense_default",
  "factor_reserve_default",
  "escrow_liability_default",
  "sales_tax_payable",
  "cash_basis_adjustment_equity",
  "retained_earnings",
  "uncategorized_expense",
] as const;

export type CoaRole = (typeof COA_ROLE_VALUES)[number];

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

const LEGACY_ROLE_BINDINGS: Partial<Record<CoaRole, string>> = {
  ar_control: "ar_clearing",
  ap_control: "ap_clearing",
  undeposited_funds: "undeposited_funds",
};

const ROLE_FALLBACKS: Partial<Record<CoaRole, { subtype?: string[]; type?: string[]; nameHints?: string[] }>> = {
  ar_control: { subtype: ["AccountsReceivable"], type: ["Asset"], nameHints: ["accounts receivable", "a/r"] },
  ap_control: { subtype: ["AccountsPayable"], type: ["Liability"], nameHints: ["accounts payable", "a/p"] },
  cash_clearing: {
    subtype: ["Checking", "Savings", "CashOnHand", "UndepositedFunds"],
    type: ["Asset"],
    nameHints: ["cash", "bank", "checking"],
  },
  undeposited_funds: { subtype: ["UndepositedFunds"], type: ["Asset"], nameHints: ["undeposited funds"] },
  revenue_default: { type: ["Income", "OtherIncome"] },
  expense_default: { type: ["Expense", "OtherExpense", "CostOfGoodsSold"] },
  factor_reserve_default: { type: ["Liability"], nameHints: ["factor reserve", "factoring reserve"] },
  escrow_liability_default: { type: ["Liability"], nameHints: ["escrow"] },
  sales_tax_payable: { subtype: ["SalesTaxPayable"], type: ["Liability"], nameHints: ["sales tax payable", "tax payable"] },
  cash_basis_adjustment_equity: { type: ["Equity"], nameHints: ["cash basis adjustment"] },
  retained_earnings: { subtype: ["RetainedEarnings"], type: ["Equity"], nameHints: ["retained earnings"] },
};

export class CoaRoleResolutionError extends Error {
  code: "COA_ROLE_MAPPING_NOT_FOUND";
  role: CoaRole;
  operating_company_id: string;

  constructor(operatingCompanyId: string, role: CoaRole) {
    super(`No active chart_of_accounts role mapping found for ${role} in ${operatingCompanyId}`);
    this.code = "COA_ROLE_MAPPING_NOT_FOUND";
    this.role = role;
    this.operating_company_id = operatingCompanyId;
  }
}

async function resolveMappedRoleAccount(client: DbClient, operatingCompanyId: string, role: CoaRole): Promise<string | null> {
  const mapped = await client.query<{ account_id: string }>(
    `
      SELECT car.account_id::text AS account_id
      FROM accounting.chart_of_accounts_roles car
      JOIN catalogs.accounts a ON a.id = car.account_id
      WHERE car.operating_company_id = $1::uuid
        AND car.role = $2
        AND car.is_active = true
        AND a.deactivated_at IS NULL
        AND a.is_postable = true
      ORDER BY car.updated_at DESC
      LIMIT 1
    `,
    [operatingCompanyId, role]
  );
  return mapped.rows[0]?.account_id ?? null;
}

async function resolveLegacyRoleBinding(client: DbClient, role: CoaRole): Promise<string | null> {
  const roleKey = LEGACY_ROLE_BINDINGS[role];
  if (!roleKey) return null;
  const legacy = await client.query<{ account_id: string }>(
    `
      SELECT arb.account_id::text AS account_id
      FROM catalogs.account_role_bindings arb
      JOIN catalogs.accounts a ON a.id = arb.account_id
      WHERE arb.role_key = $1
        AND arb.deactivated_at IS NULL
        AND a.deactivated_at IS NULL
        AND a.is_postable = true
      LIMIT 1
    `,
    [roleKey]
  );
  return legacy.rows[0]?.account_id ?? null;
}

function buildFallbackQueryParts(fallback: { subtype?: string[]; type?: string[]; nameHints?: string[] }) {
  const clauses: string[] = ["deactivated_at IS NULL", "is_postable = true"];
  const values: unknown[] = [];
  if (fallback.subtype?.length) {
    values.push(fallback.subtype);
    clauses.push(`account_subtype = ANY($${values.length}::text[])`);
  }
  if (fallback.type?.length) {
    values.push(fallback.type);
    clauses.push(`account_type = ANY($${values.length}::text[])`);
  }
  if (fallback.nameHints?.length) {
    const hintClauses: string[] = [];
    for (const hint of fallback.nameHints) {
      values.push(`%${hint}%`);
      hintClauses.push(`account_name ILIKE $${values.length}`);
    }
    clauses.push(`(${hintClauses.join(" OR ")})`);
  }
  return { clauses, values };
}

async function resolveFallbackByAccountShape(client: DbClient, role: CoaRole): Promise<string | null> {
  const fallback = ROLE_FALLBACKS[role];
  if (!fallback) return null;
  const { clauses, values } = buildFallbackQueryParts(fallback);
  const fallbackRow = await client.query<{ id: string }>(
    `
      SELECT id::text
      FROM catalogs.accounts
      WHERE ${clauses.join(" AND ")}
      ORDER BY updated_at DESC
      LIMIT 1
    `,
    values
  );
  return fallbackRow.rows[0]?.id ?? null;
}

export async function resolveRoleAccountOptional(client: DbClient, operatingCompanyId: string, role: CoaRole): Promise<string | null> {
  const fromMapped = await resolveMappedRoleAccount(client, operatingCompanyId, role);
  if (fromMapped) return fromMapped;

  const fromLegacyBinding = await resolveLegacyRoleBinding(client, role);
  if (fromLegacyBinding) return fromLegacyBinding;

  return resolveFallbackByAccountShape(client, role);
}

export async function resolveRoleAccount(client: DbClient, operatingCompanyId: string, role: CoaRole): Promise<string> {
  const resolved = await resolveRoleAccountOptional(client, operatingCompanyId, role);
  if (!resolved) throw new CoaRoleResolutionError(operatingCompanyId, role);
  return resolved;
}

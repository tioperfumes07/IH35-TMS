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
  // FIN-22 lessor lease (ASC 842) roles — per-opco (TRK) mappings in accounting.chart_of_accounts_roles.
  "rental_income",
  "lease_receivable",
  "interest_income",
  "gain_loss_on_disposal",
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

// Control accounts (A/R, A/P) MUST be uniquely designated. Unlike "default" roles, they can never be
// resolved by a loose `account_subtype` LIMIT 1 tiebreaker: several accounts legitimately carry
// account_subtype='AccountsReceivable'/'AccountsPayable' (real control + mis-classified advances), so an
// arbitrary pick silently posts to the WRONG account (root cause of the GUARD Module 15 invoice A/R bug —
// A/R was debited to "Unauthorized Expenses Ignacio Muñoz"). For these roles we FAIL CLOSED.
const CONTROL_ROLES: ReadonlySet<CoaRole> = new Set<CoaRole>(["ar_control", "ap_control"]);

export class ControlAccountDesignationError extends Error {
  code: "CONTROL_ACCOUNT_NOT_UNIQUELY_DESIGNATED";
  role: CoaRole;
  operating_company_id: string;
  candidate_count: number;
  designation_source: "role_mapping" | "account_subtype_fallback";

  constructor(
    operatingCompanyId: string,
    role: CoaRole,
    candidateCount: number,
    source: "role_mapping" | "account_subtype_fallback"
  ) {
    super(
      `${role}_account_not_uniquely_designated: found ${candidateCount} candidate account(s) via ` +
        `${source} for operating_company_id=${operatingCompanyId}. Exactly one explicitly-designated ` +
        `control account is required — refusing to silently pick one via account_subtype. ` +
        `Designate the control account in accounting.chart_of_accounts_roles (role='${role}').`
    );
    this.code = "CONTROL_ACCOUNT_NOT_UNIQUELY_DESIGNATED";
    this.role = role;
    this.operating_company_id = operatingCompanyId;
    this.candidate_count = candidateCount;
    this.designation_source = source;
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

// Count-based variant of resolveMappedRoleAccount: returns the DISTINCT designated account ids for a role
// (no ORDER BY / LIMIT), so control-role resolution can detect ambiguity (>1) and fail closed instead of
// silently picking the most-recently-updated mapping.
async function listMappedRoleAccountIds(client: DbClient, operatingCompanyId: string, role: CoaRole): Promise<string[]> {
  const mapped = await client.query<{ account_id: string }>(
    `
      SELECT DISTINCT car.account_id::text AS account_id
      FROM accounting.chart_of_accounts_roles car
      JOIN catalogs.accounts a ON a.id = car.account_id
      WHERE car.operating_company_id = $1::uuid
        AND car.role = $2
        AND car.is_active = true
        AND a.deactivated_at IS NULL
        AND a.is_postable = true
    `,
    [operatingCompanyId, role]
  );
  return mapped.rows.map((r) => r.account_id);
}

// Count-based variant of resolveFallbackByAccountShape: returns ALL DISTINCT account ids matching the
// role's account-shape fallback (no LIMIT), so a control role can refuse to guess when the subtype is
// shared by more than one account.
async function listFallbackAccountIds(client: DbClient, role: CoaRole): Promise<string[]> {
  const fallback = ROLE_FALLBACKS[role];
  if (!fallback) return [];
  const { clauses, values } = buildFallbackQueryParts(fallback);
  const rows = await client.query<{ id: string }>(
    `
      SELECT DISTINCT id::text AS id
      FROM catalogs.accounts
      WHERE ${clauses.join(" AND ")}
    `,
    values
  );
  return rows.rows.map((r) => r.id);
}

// Fail-closed resolution for control accounts (A/R, A/P). Authoritative source is the explicit
// designation in accounting.chart_of_accounts_roles; the account_subtype fallback is allowed ONLY when it
// resolves to exactly one account. 0 or >1 candidates -> throw rather than mis-post.
async function resolveControlRoleAccount(client: DbClient, operatingCompanyId: string, role: CoaRole): Promise<string | null> {
  // 1) Explicit designation (the field the resolver keys on — NOT catalogs.accounts.system_purpose).
  const mapped = await listMappedRoleAccountIds(client, operatingCompanyId, role);
  if (mapped.length > 1) {
    throw new ControlAccountDesignationError(operatingCompanyId, role, mapped.length, "role_mapping");
  }
  if (mapped.length === 1) return mapped[0] ?? null;

  // 2) Legacy single binding (catalogs.account_role_bindings — unique by role_key).
  const fromLegacyBinding = await resolveLegacyRoleBinding(client, role);
  if (fromLegacyBinding) return fromLegacyBinding;

  // 3) account_subtype fallback — FAIL CLOSED: never silently pick one of many.
  const candidates = await listFallbackAccountIds(client, role);
  if (candidates.length > 1) {
    throw new ControlAccountDesignationError(operatingCompanyId, role, candidates.length, "account_subtype_fallback");
  }
  if (candidates.length === 1) return candidates[0] ?? null;
  return null;
}

export async function resolveRoleAccountOptional(client: DbClient, operatingCompanyId: string, role: CoaRole): Promise<string | null> {
  if (CONTROL_ROLES.has(role)) {
    return resolveControlRoleAccount(client, operatingCompanyId, role);
  }

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

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
  // CODER-34 factoring secured-borrowing roles (per-opco TRANSP) — migration
  // 202607013000_factoring_secured_borrowing_coa_roles.sql. factor_reserve_held is the canonical reserve
  // role (an ASSET; supersedes the code's old factor_reserve_default, which the shape-fallback mis-typed
  // as a Liability). factor_fee_expense/default_interest_expense are sub-accounts of Interest & Financing.
  "factoring_advance_liability",
  "ar_assigned_to_factor",
  "factoring_recoursed_ar",
  "default_interest_expense",
  "factor_reserve_held",
  "factor_fee_expense",
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

// USMCA cross-entity-leak fix (5th leak): this role→account mapping runs on the is_lucia_bypass() poster
// path, where the entity-scoped catalogs.accounts RLS is DEFEATED. Scoping the mapping row by
// car.operating_company_id alone is NOT enough — a role row in THIS entity whose account_id points at
// ANOTHER entity's account would still resolve and post a journal line cross-entity. So we pin BOTH sides:
// the role mapping must be this entity's (car.operating_company_id = $1) AND the resolved account must
// itself belong to this entity (a.operating_company_id = $1), symmetric with the legacy-binding
// (resolveLegacyRoleBinding) and shape-fallback (resolveFallbackByAccountShape) paths, which already pin
// the account's own entity. A foreign-entity account now falls through / returns null (fail-closed) exactly
// as an unmapped role would, so the poster fails CLOSED (CoaRoleResolutionError) rather than mis-posting.
async function resolveMappedRoleAccount(client: DbClient, operatingCompanyId: string, role: CoaRole): Promise<string | null> {
  const mapped = await client.query<{ account_id: string }>(
    `
      SELECT car.account_id::text AS account_id
      FROM accounting.chart_of_accounts_roles car
      JOIN catalogs.accounts a ON a.id = car.account_id
      WHERE car.operating_company_id = $1::uuid
        AND a.operating_company_id = $1::uuid
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

// USMCA cross-entity-leak fix: catalogs.account_role_bindings is now per-entity (operating_company_id).
// This resolver can run on the is_lucia_bypass() poster path, where the entity-scoped catalogs.accounts RLS
// is DEFEATED, so we pin resolution to the posting entity via TWO explicit predicates: (a) the binding must
// be this entity's row OR a legacy global (NULL-entity) binding, preferring the entity-scoped one; and
// (b) the resolved account must itself belong to this entity. Behavior is identical for TRANSP (all existing
// bindings backfilled to TRANSP → the entity-scoped branch matches), and a foreign-entity account can never
// be returned (fail-closed) even under bypass.
async function resolveLegacyRoleBinding(client: DbClient, operatingCompanyId: string, role: CoaRole): Promise<string | null> {
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
        AND (arb.operating_company_id = $2::uuid OR arb.operating_company_id IS NULL)
        AND a.operating_company_id = $2::uuid
      ORDER BY (arb.operating_company_id IS NOT NULL) DESC
      LIMIT 1
    `,
    [roleKey, operatingCompanyId]
  );
  return legacy.rows[0]?.account_id ?? null;
}

function buildFallbackQueryParts(operatingCompanyId: string, fallback: { subtype?: string[]; type?: string[]; nameHints?: string[] }) {
  // operating_company_id is bound as $1 and added as a LITERAL `operating_company_id = $1::uuid`
  // predicate in each query template below — both for entity isolation (never resolve a control
  // account from another company) and so the static entity-scope guard sees the predicate. Fallback
  // params therefore start at $2.
  const clauses: string[] = ["deactivated_at IS NULL", "is_postable = true"];
  const values: unknown[] = [operatingCompanyId];
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

async function resolveFallbackByAccountShape(client: DbClient, operatingCompanyId: string, role: CoaRole): Promise<string | null> {
  const fallback = ROLE_FALLBACKS[role];
  if (!fallback) return null;
  const { clauses, values } = buildFallbackQueryParts(operatingCompanyId, fallback);
  const fallbackRow = await client.query<{ id: string }>(
    `
      SELECT id::text
      FROM catalogs.accounts
      WHERE operating_company_id = $1::uuid AND ${clauses.join(" AND ")}
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
  // Same 5th cross-entity-leak fix as resolveMappedRoleAccount: pin the account's OWN entity
  // (a.operating_company_id = $1) in addition to the mapping row's, so a control-role mapping that points
  // at a foreign-entity account can never be counted/returned on the RLS-defeated bypass poster path.
  const mapped = await client.query<{ account_id: string }>(
    `
      SELECT DISTINCT car.account_id::text AS account_id
      FROM accounting.chart_of_accounts_roles car
      JOIN catalogs.accounts a ON a.id = car.account_id
      WHERE car.operating_company_id = $1::uuid
        AND a.operating_company_id = $1::uuid
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
async function listFallbackAccountIds(client: DbClient, operatingCompanyId: string, role: CoaRole): Promise<string[]> {
  const fallback = ROLE_FALLBACKS[role];
  if (!fallback) return [];
  const { clauses, values } = buildFallbackQueryParts(operatingCompanyId, fallback);
  const rows = await client.query<{ id: string }>(
    `
      SELECT DISTINCT id::text AS id
      FROM catalogs.accounts
      WHERE operating_company_id = $1::uuid AND ${clauses.join(" AND ")}
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

  // 2) Legacy single binding (catalogs.account_role_bindings — entity-scoped, falls back to global).
  const fromLegacyBinding = await resolveLegacyRoleBinding(client, operatingCompanyId, role);
  if (fromLegacyBinding) return fromLegacyBinding;

  // 3) account_subtype fallback — FAIL CLOSED: never silently pick one of many.
  const candidates = await listFallbackAccountIds(client, operatingCompanyId, role);
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

  const fromLegacyBinding = await resolveLegacyRoleBinding(client, operatingCompanyId, role);
  if (fromLegacyBinding) return fromLegacyBinding;

  return resolveFallbackByAccountShape(client, operatingCompanyId, role);
}

export async function resolveRoleAccount(client: DbClient, operatingCompanyId: string, role: CoaRole): Promise<string> {
  const resolved = await resolveRoleAccountOptional(client, operatingCompanyId, role);
  if (!resolved) throw new CoaRoleResolutionError(operatingCompanyId, role);
  return resolved;
}

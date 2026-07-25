/**
 * ACCT-LINK-04 (ACCT-F07) — the one place that turns "some category" into a real
 * catalogs.expense_categories id for a given entity.
 *
 * Every resolution here is entity-scoped and evidence-backed. The resolver returns null rather than
 * guessing: an unresolvable category means the line stays uncategorized (QBO-style) instead of being
 * stamped with a category the entity does not own. That matters because held migration
 * 202607950000 makes accounting.expense_lines.expense_category_uuid a same-entity foreign key —
 * a guessed id would be a hard insert failure, and a cross-entity id is a linkage-law defect.
 *
 * No GL account is invented here. The account binding is read from the category's own metadata,
 * which is the same binding accounting/posting-engine.service.ts resolveBillCategoryAccount reads in
 * the forward direction.
 */

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

/** metadata keys that bind a category to a catalogs.accounts row, in posting-engine precedence order. */
const ACCOUNT_BINDING_KEYS = ["account_id", "account_uuid", "coa_account_id"] as const;

const ACCOUNT_BINDING_SQL = ACCOUNT_BINDING_KEYS.map((k) => `NULLIF(ec.metadata->>'${k}', '')`).join(", ");

export async function expenseCategoriesAvailable(client: Queryable): Promise<boolean> {
  const res = await client.query<{ rel: string | null }>(`SELECT to_regclass('catalogs.expense_categories') AS rel`);
  return Boolean(res.rows[0]?.rel);
}

/**
 * Resolve an explicit category id against the entity's own catalog.
 * Returns null when the id belongs to another entity, is inactive, or does not exist.
 */
export async function resolveExpenseCategoryById(
  client: Queryable,
  params: { operatingCompanyId: string; categoryId: string }
): Promise<string | null> {
  const res = await client.query<{ id: string }>(
    `
      SELECT ec.id::text AS id
      FROM catalogs.expense_categories ec
      WHERE ec.id = $1::uuid
        AND ec.operating_company_id = $2::uuid
        AND ec.is_active
      LIMIT 1
    `,
    [params.categoryId, params.operatingCompanyId]
  );
  return res.rows[0]?.id ?? null;
}

/**
 * Resolve a category code (FUEL / REPAIR / PERMIT …) against the entity's own catalog.
 * Case-insensitive because line_category on accounting.expense_lines is written lowercase
 * ('lumper', 'fuel') while catalog codes are stored uppercase.
 */
export async function resolveExpenseCategoryByCode(
  client: Queryable,
  params: { operatingCompanyId: string; categoryCode: string }
): Promise<string | null> {
  const code = params.categoryCode.trim();
  if (!code) return null;
  const res = await client.query<{ id: string }>(
    `
      SELECT ec.id::text AS id
      FROM catalogs.expense_categories ec
      WHERE ec.operating_company_id = $1::uuid
        AND upper(ec.code) = upper($2)
        AND ec.is_active
      LIMIT 1
    `,
    [params.operatingCompanyId, code]
  );
  return res.rows[0]?.id ?? null;
}

/**
 * Reverse-resolve a GL account to the category that binds it — but ONLY when the binding is
 * unambiguous. Two active categories pointing at the same expense account is a mapping the owner has
 * to settle; picking one would be inventing an answer, so this returns null and the line stays
 * uncategorized.
 *
 * On prod today every catalogs.expense_categories.metadata is `{}`, so this resolves to null for
 * every account. It starts producing links the moment the owner binds categories to accounts in the
 * Lists hub — which is exactly the intended sequence: the FK ships first, the density follows the
 * owner's mapping.
 */
export async function resolveExpenseCategoryByAccount(
  client: Queryable,
  params: { operatingCompanyId: string; accountId: string }
): Promise<string | null> {
  const res = await client.query<{ id: string; matches: string }>(
    `
      SELECT
        min(ec.id::text) AS id,
        count(*)::text AS matches
      FROM catalogs.expense_categories ec
      WHERE ec.operating_company_id = $1::uuid
        AND ec.is_active
        AND COALESCE(${ACCOUNT_BINDING_SQL}) = $2::text
    `,
    [params.operatingCompanyId, params.accountId]
  );
  const row = res.rows[0];
  if (!row || Number(row.matches) !== 1) return null;
  return row.id ?? null;
}

/**
 * The composite resolver used by write paths: explicit id wins, then code, then the unambiguous
 * account binding. Null means "leave the line uncategorized" — never a guess.
 */
export async function resolveExpenseCategoryId(
  client: Queryable,
  params: {
    operatingCompanyId: string;
    categoryId?: string | null;
    categoryCode?: string | null;
    accountId?: string | null;
  }
): Promise<string | null> {
  if (!(await expenseCategoriesAvailable(client))) return null;

  if (params.categoryId) {
    const byId = await resolveExpenseCategoryById(client, {
      operatingCompanyId: params.operatingCompanyId,
      categoryId: params.categoryId,
    });
    if (byId) return byId;
    // An explicitly supplied id that does not resolve is a caller error, not a fallback trigger —
    // silently sliding to a code or account match would categorize the money as something the
    // operator did not choose.
    return null;
  }

  if (params.categoryCode) {
    const byCode = await resolveExpenseCategoryByCode(client, {
      operatingCompanyId: params.operatingCompanyId,
      categoryCode: params.categoryCode,
    });
    if (byCode) return byCode;
  }

  if (params.accountId) {
    return resolveExpenseCategoryByAccount(client, {
      operatingCompanyId: params.operatingCompanyId,
      accountId: params.accountId,
    });
  }

  return null;
}

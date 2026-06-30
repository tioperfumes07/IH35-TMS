import type pg from "pg";
import { withCurrentUser } from "./db.js";

export class OperatingCompanyScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OperatingCompanyScopeError";
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidOperatingCompanyUuid(value: string): boolean {
  return UUID_RE.test(value);
}

type Queryable = {
  query: pg.PoolClient["query"];
};

/** Read app.operating_company_id from the current transaction; throws when unset or invalid. */
export async function requireOperatingCompanyScope(client: Queryable): Promise<string> {
  const res = await client.query<{ company_id: string | null }>(
    `SELECT NULLIF(current_setting('app.operating_company_id', true), '') AS company_id`
  );
  const companyId = res.rows[0]?.company_id ?? null;
  if (!companyId || !isValidOperatingCompanyUuid(companyId)) {
    throw new OperatingCompanyScopeError(
      "app.operating_company_id must be set to a valid UUID before carrier-scoped queries"
    );
  }
  return companyId;
}

/** Set tenant session var for the remainder of the current transaction. */
export async function setOperatingCompanyScope(client: Queryable, operatingCompanyId: string): Promise<void> {
  if (!isValidOperatingCompanyUuid(operatingCompanyId)) {
    throw new OperatingCompanyScopeError("Invalid operating_company_id UUID");
  }
  await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
}

export type ScopedQueryClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
};

/**
 * Wrap a request handler in BEGIN/COMMIT with app.current_user_id + app.operating_company_id set.
 * Throws if operating company scope is missing before executing the inner function.
 */
export async function withOperatingCompanyScope<T>(
  userUuid: string,
  operatingCompanyId: string,
  fn: (client: ScopedQueryClient) => Promise<T>
): Promise<T> {
  return withCurrentUser(userUuid, async (client) => {
    await setOperatingCompanyScope(client, operatingCompanyId);
    await requireOperatingCompanyScope(client);
    return fn(client);
  });
}

/** Guard helper: assert scope is set immediately before a carrier-scoped SQL statement. */
export async function assertScopeBeforeQuery(client: Queryable): Promise<string> {
  return requireOperatingCompanyScope(client);
}

/**
 * Resolve the operating company to scope a query to: the explicitly-requested id when present,
 * otherwise the requesting user's default (or first-accessible) company. Returns null when none
 * resolvable.
 *
 * RLS on mdata.* is role-scoped, NOT entity-scoped, so an optional `operating_company_id` filter
 * that is only applied "if present" leaks rows across operating companies (TRANSP ↔ TRK ↔ USMCA).
 * Resolving the user's current company here lets list/by-id endpoints ALWAYS bind an entity
 * predicate without hard-400ing a working caller that omitted the param.
 */
export async function resolveOperatingCompanyId(
  client: {
    query: (sql: string, values: unknown[]) => Promise<{ rows: Array<{ id: string }> }>;
  },
  userId: string,
  requested?: string | null
): Promise<string | null> {
  if (requested) return requested;
  const res = await client.query(
    `
      SELECT c.id
      FROM identity.users u
      JOIN org.companies c ON c.id = u.default_company_id
      WHERE u.id = $1
        AND c.deactivated_at IS NULL
      UNION
      SELECT c.id
      FROM org.companies c
      WHERE c.id IN (SELECT org.user_accessible_company_ids())
      ORDER BY id
      LIMIT 1
    `,
    [userId]
  );
  return res.rows[0]?.id ?? null;
}

export type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export type OperationsPagingOpts = {
  page?: number;
  page_size?: number;
};

export type OperationsResult<T = Record<string, unknown>> = {
  rows: T[];
  page: number;
  page_size: number;
  total: number;
  has_more: boolean;
};

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 200;

/** Normalize caller-supplied paging into a safe LIMIT/OFFSET window. */
export function resolvePaging(opts: OperationsPagingOpts = {}): {
  page: number;
  page_size: number;
  limit: number;
  offset: number;
} {
  const page = Number.isFinite(opts.page) && (opts.page as number) > 0 ? Math.floor(opts.page as number) : 1;
  const requested =
    Number.isFinite(opts.page_size) && (opts.page_size as number) > 0
      ? Math.floor(opts.page_size as number)
      : DEFAULT_PAGE_SIZE;
  const page_size = Math.min(requested, MAX_PAGE_SIZE);
  return { page, page_size, limit: page_size, offset: (page - 1) * page_size };
}

/** Build the final paged envelope from a row window and the total count. */
export function buildResult<T>(rows: T[], total: number, page: number, page_size: number): OperationsResult<T> {
  return { rows, page, page_size, total, has_more: page * page_size < total };
}

/**
 * Confirm the driver belongs to the active operating company before returning any
 * operational depth data. Returns the driver id when in-scope, otherwise null.
 * RLS is still enforced at the row level; this is the explicit tenant gate.
 */
export async function assertDriverScope(
  client: Queryable,
  driverUuid: string,
  operatingCompanyId: string
): Promise<string | null> {
  const res = await client.query<{ id: string }>(
    `
      SELECT id::text
      FROM mdata.drivers
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
      LIMIT 1
    `,
    [driverUuid, operatingCompanyId]
  );
  return res.rows[0]?.id ?? null;
}

import { withCurrentUser } from "../auth/db.js";

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export type ListAuditRowChangesInput = {
  operating_company_id: string;
  schema?: string;
  table?: string;
  row_pk?: string;
  from?: string;
  to?: string;
  limit: number;
  offset: number;
};

type QueryShape = {
  sql: string;
  values: unknown[];
};

type AuditRowChangeRecord = {
  id: string;
  tenant_id: string | null;
  schema_name: string;
  table_name: string;
  op: "INSERT" | "UPDATE" | "DELETE";
  row_pk: string;
  old_data: unknown;
  new_data: unknown;
  changed_at: string;
  changed_by_user_id: string | null;
  changed_by_role: string | null;
  session_id: string | null;
  total_count: number;
};

function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit)) return 100;
  return Math.min(500, Math.max(1, Math.floor(limit)));
}

function normalizeOffset(offset: number): number {
  if (!Number.isFinite(offset)) return 0;
  return Math.max(0, Math.floor(offset));
}

export function buildAuditRowChangesQuery(input: ListAuditRowChangesInput): QueryShape {
  const values: unknown[] = [input.operating_company_id];
  const filters = ["tenant_id = $1::uuid"];

  if (input.schema) {
    values.push(input.schema);
    filters.push(`schema_name = $${values.length}`);
  }
  if (input.table) {
    values.push(input.table);
    filters.push(`table_name = $${values.length}`);
  }
  if (input.row_pk) {
    values.push(input.row_pk);
    filters.push(`row_pk = $${values.length}`);
  }
  if (input.from) {
    values.push(input.from);
    filters.push(`changed_at >= $${values.length}::timestamptz`);
  }
  if (input.to) {
    values.push(input.to);
    filters.push(`changed_at <= $${values.length}::timestamptz`);
  }

  values.push(normalizeLimit(input.limit));
  const limitPos = values.length;
  values.push(normalizeOffset(input.offset));
  const offsetPos = values.length;

  return {
    sql: `
      SELECT
        id::text,
        tenant_id::text,
        schema_name,
        table_name,
        op,
        row_pk,
        old_data,
        new_data,
        changed_at::text,
        changed_by_user_id::text,
        changed_by_role,
        session_id,
        count(*) OVER()::int AS total_count
      FROM audit.row_changes
      WHERE ${filters.join(" AND ")}
      ORDER BY changed_at DESC, id DESC
      LIMIT $${limitPos}
      OFFSET $${offsetPos}
    `,
    values,
  };
}

export async function listAuditRowChanges(userId: string, input: ListAuditRowChangesInput) {
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [input.operating_company_id]);
    const query = buildAuditRowChangesQuery(input);
    const res = await (client as Queryable).query<AuditRowChangeRecord>(query.sql, query.values);
    const rowChanges = res.rows.map((row) => ({
      id: row.id,
      tenant_id: row.tenant_id,
      schema_name: row.schema_name,
      table_name: row.table_name,
      op: row.op,
      row_pk: row.row_pk,
      old_data: row.old_data,
      new_data: row.new_data,
      changed_at: row.changed_at,
      changed_by_user_id: row.changed_by_user_id,
      changed_by_role: row.changed_by_role,
      session_id: row.session_id,
    }));
    return {
      row_changes: rowChanges,
      total_count: Number(res.rows[0]?.total_count ?? 0),
      limit: normalizeLimit(input.limit),
      offset: normalizeOffset(input.offset),
    };
  });
}

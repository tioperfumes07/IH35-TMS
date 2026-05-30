import type { CoiRequestStatus } from "./coi.shared.js";

type Queryable = {
  query: <R = Record<string, unknown>>(
    sql: string,
    values?: unknown[]
  ) => Promise<{ rows: R[]; rowCount?: number }>;
};

type ListCoiRequestsInput = {
  operating_company_id: string;
  customer_id?: string;
  status?: CoiRequestStatus;
};

type CreateCoiRequestInput = {
  operating_company_id: string;
  customer_id: string;
  policy_id?: string | null;
  notes?: string | null;
  expires_at?: string | null;
  requested_by: string;
};

type UpdateCoiRequestInput = {
  operating_company_id: string;
  id: string;
  status?: CoiRequestStatus;
  notes?: string | null;
  document_url?: string | null;
  expires_at?: string | null;
  responded_at?: string | null;
  policy_id?: string | null;
};

function selectColumns() {
  return `
    id::text,
    tenant_id::text,
    customer_id::text,
    policy_id::text,
    requested_at::text,
    requested_by::text,
    status,
    notes,
    document_url,
    expires_at::text,
    responded_at::text,
    created_at::text,
    updated_at::text
  `;
}

export async function listCoiRequests(client: Queryable, input: ListCoiRequestsInput) {
  const values: unknown[] = [input.operating_company_id];
  const clauses = ["tenant_id = $1::uuid"];
  if (input.customer_id) {
    values.push(input.customer_id);
    clauses.push(`customer_id = $${values.length}::uuid`);
  }
  if (input.status) {
    values.push(input.status);
    clauses.push(`status = $${values.length}`);
  }
  const result = await client.query(
    `
      SELECT ${selectColumns()}
      FROM insurance.coi_request
      WHERE ${clauses.join(" AND ")}
      ORDER BY requested_at DESC, created_at DESC
    `,
    values
  );
  return result.rows;
}

export async function createCoiRequest(client: Queryable, input: CreateCoiRequestInput) {
  const customerRes = await client.query<{ id: string }>(
    `
      SELECT id::text
      FROM mdata.customers
      WHERE operating_company_id = $1::uuid
        AND id = $2::uuid
      LIMIT 1
    `,
    [input.operating_company_id, input.customer_id]
  );
  if (!customerRes.rows[0]) return { kind: "customer_not_found" as const };

  if (input.policy_id) {
    const policyRes = await client.query<{ id: string }>(
      `
        SELECT id::text
        FROM insurance.policy
        WHERE tenant_id = $1::uuid
          AND id = $2::uuid
        LIMIT 1
      `,
      [input.operating_company_id, input.policy_id]
    );
    if (!policyRes.rows[0]) return { kind: "policy_not_found" as const };
  }

  const insert = await client.query(
    `
      INSERT INTO insurance.coi_request (
        tenant_id,
        customer_id,
        policy_id,
        requested_by,
        status,
        notes,
        document_url,
        expires_at,
        responded_at
      )
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'pending', $5, NULL, $6::date, NULL)
      RETURNING ${selectColumns()}
    `,
    [
      input.operating_company_id,
      input.customer_id,
      input.policy_id ?? null,
      input.requested_by,
      input.notes ?? null,
      input.expires_at ?? null,
    ]
  );
  return { kind: "ok" as const, row: insert.rows[0] };
}

export async function updateCoiRequest(client: Queryable, input: UpdateCoiRequestInput) {
  if (input.policy_id) {
    const policyRes = await client.query<{ id: string }>(
      `
        SELECT id::text
        FROM insurance.policy
        WHERE tenant_id = $1::uuid
          AND id = $2::uuid
        LIMIT 1
      `,
      [input.operating_company_id, input.policy_id]
    );
    if (!policyRes.rows[0]) return { kind: "policy_not_found" as const };
  }

  const assignments: string[] = [];
  const values: unknown[] = [input.operating_company_id, input.id];

  const setField = (column: string, value: unknown, cast = "") => {
    values.push(value);
    assignments.push(`${column} = $${values.length}${cast}`);
  };

  if (input.status !== undefined) setField("status", input.status);
  if (input.notes !== undefined) setField("notes", input.notes);
  if (input.document_url !== undefined) setField("document_url", input.document_url);
  if (input.expires_at !== undefined) setField("expires_at", input.expires_at, "::date");
  if (input.responded_at !== undefined) setField("responded_at", input.responded_at, "::timestamptz");
  if (input.policy_id !== undefined) setField("policy_id", input.policy_id, "::uuid");

  if (input.status === "received" && input.responded_at === undefined) {
    assignments.push("responded_at = COALESCE(responded_at, now())");
  }

  const result = await client.query(
    `
      UPDATE insurance.coi_request
      SET ${assignments.join(", ")}
      WHERE tenant_id = $1::uuid
        AND id = $2::uuid
      RETURNING ${selectColumns()}
    `,
    values
  );

  if (!result.rows[0]) return { kind: "coi_request_not_found" as const };
  return { kind: "ok" as const, row: result.rows[0] };
}

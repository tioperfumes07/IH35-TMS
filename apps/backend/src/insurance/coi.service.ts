import type { CoiRequestStatus, InsuranceRequestType } from "./coi.shared.js";

type Queryable = {
  query: <R = Record<string, unknown>>(
    sql: string,
    values?: unknown[]
  ) => Promise<{ rows: R[]; rowCount?: number }>;
};

type ListCoiRequestsInput = {
  operating_company_id: string;
  customer_id?: string;
  driver_id?: string;
  unit_id?: string;
  policy_id?: string;
  status?: CoiRequestStatus;
  request_type?: InsuranceRequestType;
};

type CreateCoiRequestInput = {
  operating_company_id: string;
  request_type: InsuranceRequestType;
  customer_id?: string | null;
  driver_id?: string | null;
  unit_id?: string | null;
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
  acknowledged_at?: string | null;
  policy_id?: string | null;
};

function selectColumns(prefix = "") {
  return `
    ${prefix}id::text AS id,
    ${prefix}tenant_id::text AS tenant_id,
    ${prefix}request_type,
    ${prefix}customer_id::text AS customer_id,
    ${prefix}driver_id::text AS driver_id,
    ${prefix}unit_id::text AS unit_id,
    ${prefix}policy_id::text AS policy_id,
    ${prefix}requested_at::text AS requested_at,
    ${prefix}requested_by::text AS requested_by,
    ${prefix}status,
    ${prefix}notes,
    ${prefix}document_url,
    ${prefix}expires_at::text AS expires_at,
    ${prefix}responded_at::text AS responded_at,
    ${prefix}sent_at::text AS sent_at,
    ${prefix}acknowledged_at::text AS acknowledged_at,
    ${prefix}broker_email,
    ${prefix}email_queue_id::text AS email_queue_id,
    ${prefix}created_at::text AS created_at,
    ${prefix}updated_at::text AS updated_at
  `;
}

export async function listCoiRequests(client: Queryable, input: ListCoiRequestsInput) {
  const values: unknown[] = [input.operating_company_id];
  const clauses = ["r.tenant_id = $1::uuid"];
  if (input.customer_id) {
    values.push(input.customer_id);
    clauses.push(`r.customer_id = $${values.length}::uuid`);
  }
  if (input.driver_id) {
    values.push(input.driver_id);
    clauses.push(`r.driver_id = $${values.length}::uuid`);
  }
  if (input.unit_id) {
    values.push(input.unit_id);
    clauses.push(`r.unit_id = $${values.length}::uuid`);
  }
  if (input.policy_id) {
    values.push(input.policy_id);
    clauses.push(`r.policy_id = $${values.length}::uuid`);
  }
  if (input.status) {
    values.push(input.status);
    clauses.push(`r.status = $${values.length}`);
  }
  if (input.request_type) {
    values.push(input.request_type);
    clauses.push(`r.request_type = $${values.length}`);
  }
  const result = await client.query(
    `
      SELECT ${selectColumns("r.")},
             COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''), u.email) AS requested_by_name,
             p.policy_number,
             c.customer_name AS customer_name,
             NULLIF(TRIM(CONCAT_WS(' ', dr.first_name, dr.last_name)), '') AS driver_name,
             un.unit_number
      FROM insurance.coi_request r
      LEFT JOIN org.user_company_access uca
        ON uca.user_id = r.requested_by
       AND uca.company_id = r.tenant_id
       AND uca.deactivated_at IS NULL
      LEFT JOIN identity.users u
        ON u.id = uca.user_id
       AND u.deactivated_at IS NULL
      LEFT JOIN insurance.policy p
        ON p.id = r.policy_id
       AND p.tenant_id = r.tenant_id
      LEFT JOIN mdata.customers c
        ON c.id = r.customer_id
       AND c.operating_company_id = r.tenant_id
      LEFT JOIN mdata.drivers dr
        ON dr.id = r.driver_id
       AND dr.operating_company_id = r.tenant_id
      LEFT JOIN mdata.units un
        ON un.id = r.unit_id
       AND (un.owner_company_id = r.tenant_id OR un.currently_leased_to_company_id = r.tenant_id)
      WHERE ${clauses.join(" AND ")}
      ORDER BY r.requested_at DESC, r.created_at DESC
    `,
    values
  );
  return result.rows;
}

export async function createCoiRequest(client: Queryable, input: CreateCoiRequestInput) {
  if (input.request_type === "customer_coi") {
    const customerRes = await client.query<{ id: string }>(
      `SELECT id::text FROM mdata.customers WHERE operating_company_id = $1::uuid AND id = $2::uuid LIMIT 1`,
      [input.operating_company_id, input.customer_id]
    );
    if (!customerRes.rows[0]) return { kind: "customer_not_found" as const };
  } else if (input.request_type === "driver_add") {
    const driverRes = await client.query<{ id: string }>(
      `SELECT id::text FROM mdata.drivers WHERE operating_company_id = $1::uuid AND id = $2::uuid LIMIT 1`,
      [input.operating_company_id, input.driver_id]
    );
    if (!driverRes.rows[0]) return { kind: "driver_not_found" as const };
  } else if (input.request_type === "unit_add") {
    const unitRes = await client.query<{ id: string }>(
      `SELECT id::text FROM mdata.units WHERE id = $2::uuid AND (owner_company_id = $1::uuid OR currently_leased_to_company_id = $1::uuid) LIMIT 1`,
      [input.operating_company_id, input.unit_id]
    );
    if (!unitRes.rows[0]) return { kind: "unit_not_found" as const };
  }

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

  // RLS policy coi_request_opco_scope WITH CHECK keys operating_company_id (not tenant_id).
  // Inserting tenant_id alone leaves operating_company_id NULL → Postgres 42501 on every create.
  // Initial status is 'requested' for the new request types (owner lifecycle), 'pending' stays the
  // customer_coi default so every pre-existing FE consumer of that value keeps working unchanged.
  const initialStatus = input.request_type === "customer_coi" ? "pending" : "requested";
  const insert = await client.query(
    `
      INSERT INTO insurance.coi_request (
        tenant_id,
        operating_company_id,
        request_type,
        customer_id,
        driver_id,
        unit_id,
        policy_id,
        requested_by,
        status,
        notes,
        document_url,
        expires_at,
        responded_at
      )
      VALUES ($1::uuid, $1::uuid, $2, $3::uuid, $4::uuid, $5::uuid, $6::uuid, $7::uuid, $8, $9, NULL, $10::date, NULL)
      RETURNING ${selectColumns()}
    `,
    [
      input.operating_company_id,
      input.request_type,
      input.request_type === "customer_coi" ? input.customer_id : null,
      input.request_type === "driver_add" ? input.driver_id : null,
      input.request_type === "unit_add" ? input.unit_id : null,
      input.policy_id ?? null,
      input.requested_by,
      initialStatus,
      input.notes ?? null,
      input.expires_at ?? null,
    ]
  );
  const created = insert.rows[0];
  if (!created?.id) throw new Error("insurance_coi_request_insert_failed");
  return { kind: "ok" as const, row: created };
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
  if (input.acknowledged_at !== undefined) setField("acknowledged_at", input.acknowledged_at, "::timestamptz");
  if (input.policy_id !== undefined) setField("policy_id", input.policy_id, "::uuid");

  if (input.status === "received" && input.responded_at === undefined) {
    assignments.push("responded_at = COALESCE(responded_at, now())");
  }
  // Owner lifecycle: reaching 'acknowledged' or 'issued' without an explicit acknowledged_at still
  // stamps one, mirroring the 'received' behavior above for the original vocabulary.
  if ((input.status === "acknowledged" || input.status === "issued") && input.acknowledged_at === undefined) {
    assignments.push("acknowledged_at = COALESCE(acknowledged_at, now())");
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

/**
 * The "closes the loop" signal (owner directive 2026-08-31): does this driver have an ISSUED
 * driver-add request on file -- i.e. is the insurer's Auto Liability schedule confirmed to include
 * them. No new column on mdata.drivers; this reads insurance.coi_request directly so a future
 * dispatcher-side warning (none exists yet -- see docs/audit/GUARD-WORKORDERS.md
 * INSURANCE-REQUEST-PIPELINE-DISPATCHER-WARNING-NOT-BUILT) has a single, stable place to check.
 */
export async function getDriverScheduleStatus(
  client: Queryable,
  input: { operating_company_id: string; driver_id: string }
) {
  const result = await client.query<{
    id: string;
    status: string;
    acknowledged_at: string | null;
    requested_at: string;
  }>(
    `
      SELECT id::text, status, acknowledged_at::text, requested_at::text
      FROM insurance.coi_request
      WHERE tenant_id = $1::uuid
        AND driver_id = $2::uuid
        AND request_type = 'driver_add'
      ORDER BY
        (status = 'issued') DESC,
        requested_at DESC
      LIMIT 1
    `,
    [input.operating_company_id, input.driver_id]
  );
  const latest = result.rows[0] ?? null;
  return {
    on_schedule: latest?.status === "issued",
    latest_request: latest,
  };
}

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
};

export type FactorRow = {
  id: string;
  tenant_id: string;
  name: string;
  advance_rate: number;
  fee_rate: number;
  reserve_rate: number;
  recourse_days: number;
  active: boolean;
  fee_schedule: unknown[] | null;
  reserve_schedule: unknown[] | null;
  fee_application_mode: string;
  remittance_details: unknown | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type CustomerFactorAssignmentRow = {
  id: string;
  tenant_id: string;
  customer_id: string;
  factor_id: string;
  factor_name: string;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
};

export type BatchFactorHistoryRow = {
  id: string;
  batch_number: string;
  status: string;
  submitted_at: string | null;
  funded_at: string | null;
  total_face_cents: number;
  expected_advance_cents: number;
  expected_fee_cents: number;
};

export class FactorServiceError extends Error {
  constructor(readonly code: "factor_not_found" | "factor_name_conflict", readonly statusCode: number) {
    super(code);
  }
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return Number(value ?? 0);
}

function mapFactorRow(row: Record<string, unknown>): FactorRow {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    name: String(row.name),
    advance_rate: toNumber(row.advance_rate),
    fee_rate: toNumber(row.fee_rate),
    reserve_rate: toNumber(row.reserve_rate),
    recourse_days: toNumber(row.recourse_days),
    active: Boolean(row.active),
    fee_schedule: Array.isArray(row.fee_schedule) ? row.fee_schedule : null,
    reserve_schedule: Array.isArray(row.reserve_schedule) ? row.reserve_schedule : null,
    fee_application_mode: String(row.fee_application_mode ?? "replace"),
    remittance_details: row.remittance_details ?? null,
    notes: row.notes != null ? String(row.notes) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapAssignmentRow(row: Record<string, unknown>): CustomerFactorAssignmentRow {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    customer_id: String(row.customer_id),
    factor_id: String(row.factor_id),
    factor_name: String(row.factor_name),
    effective_from: String(row.effective_from),
    effective_to: row.effective_to ? String(row.effective_to) : null,
    created_at: String(row.created_at),
  };
}

function mapBatchHistoryRow(row: Record<string, unknown>): BatchFactorHistoryRow {
  return {
    id: String(row.id),
    batch_number: String(row.batch_number),
    status: String(row.status),
    submitted_at: row.submitted_at ? String(row.submitted_at) : null,
    funded_at: row.funded_at ? String(row.funded_at) : null,
    total_face_cents: toNumber(row.total_face_cents),
    expected_advance_cents: toNumber(row.expected_advance_cents),
    expected_fee_cents: toNumber(row.expected_fee_cents),
  };
}

export async function listFactors(
  tenantId: string,
  opts: { activeOnly?: boolean },
  deps: { client: Queryable }
): Promise<FactorRow[]> {
  const values: unknown[] = [tenantId];
  const filters = ["tenant_id = $1::uuid"];
  if (opts.activeOnly) filters.push("active = true");

  const res = await deps.client.query<Record<string, unknown>>(
    `
      SELECT
        id::text,
        tenant_id::text,
        name,
        advance_rate::numeric,
        fee_rate::numeric,
        reserve_rate::numeric,
        recourse_days,
        active,
        fee_schedule,
        reserve_schedule,
        fee_application_mode,
        remittance_details,
        notes,
        created_at::text,
        updated_at::text
      FROM factoring.factor
      WHERE ${filters.join(" AND ")}
      ORDER BY active DESC, name ASC
    `,
    values
  );

  return res.rows.map(mapFactorRow);
}

export async function getFactorForCustomer(
  tenantId: string,
  customerId: string,
  asOfDate: string,
  deps: { client: Queryable }
): Promise<(FactorRow & { assignment_id: string; effective_from: string; effective_to: string | null }) | null> {
  const res = await deps.client.query<Record<string, unknown>>(
    `
      SELECT
        f.id::text,
        f.tenant_id::text,
        f.name,
        f.advance_rate::numeric,
        f.fee_rate::numeric,
        f.reserve_rate::numeric,
        f.recourse_days,
        f.active,
        f.fee_schedule,
        f.reserve_schedule,
        f.fee_application_mode,
        f.remittance_details,
        f.notes,
        f.created_at::text,
        f.updated_at::text,
        a.id::text AS assignment_id,
        a.effective_from::text,
        a.effective_to::text
      FROM factoring.customer_factor_assignment a
      JOIN factoring.factor f ON f.id = a.factor_id
      WHERE a.tenant_id = $1::uuid
        AND a.customer_id = $2::uuid
        AND a.effective_from <= $3::date
        AND (a.effective_to IS NULL OR a.effective_to > $3::date)
      ORDER BY a.effective_from DESC, a.created_at DESC
      LIMIT 1
    `,
    [tenantId, customerId, asOfDate]
  );

  const row = res.rows[0];
  if (!row) return null;
  const factor = mapFactorRow(row);
  return {
    ...factor,
    assignment_id: String(row.assignment_id),
    effective_from: String(row.effective_from),
    effective_to: row.effective_to ? String(row.effective_to) : null,
  };
}

export async function createFactor(
  tenantId: string,
  input: {
    name: string;
    advance_rate: number;
    fee_rate: number;
    reserve_rate: number;
    recourse_days: number;
    active?: boolean;
    fee_schedule?: unknown[] | null;
    reserve_schedule?: unknown[] | null;
    fee_application_mode?: string;
    remittance_details?: unknown | null;
    notes?: string | null;
  },
  deps: { client: Queryable }
): Promise<FactorRow> {
  try {
    const insert = await deps.client.query<Record<string, unknown>>(
      `
        INSERT INTO factoring.factor (
          tenant_id,
          name,
          advance_rate,
          fee_rate,
          reserve_rate,
          recourse_days,
          active,
          fee_schedule,
          reserve_schedule,
          fee_application_mode,
          remittance_details,
          notes,
          created_at,
          updated_at
        )
        VALUES (
          $1::uuid,
          $2,
          $3::numeric,
          $4::numeric,
          $5::numeric,
          $6::int,
          COALESCE($7::boolean, true),
          $8::jsonb,
          $9::jsonb,
          COALESCE($10, 'replace'),
          $11::jsonb,
          $12,
          now(),
          now()
        )
        RETURNING
          id::text,
          tenant_id::text,
          name,
          advance_rate::numeric,
          fee_rate::numeric,
          reserve_rate::numeric,
          recourse_days,
          active,
          fee_schedule,
          reserve_schedule,
          fee_application_mode,
          remittance_details,
          notes,
          created_at::text,
          updated_at::text
      `,
      [
        tenantId,
        input.name.trim(),
        input.advance_rate,
        input.fee_rate,
        input.reserve_rate,
        input.recourse_days,
        input.active,
        input.fee_schedule != null ? JSON.stringify(input.fee_schedule) : null,
        input.reserve_schedule != null ? JSON.stringify(input.reserve_schedule) : null,
        input.fee_application_mode ?? null,
        input.remittance_details != null ? JSON.stringify(input.remittance_details) : null,
        input.notes ?? null,
      ]
    );
    return mapFactorRow(insert.rows[0] ?? {});
  } catch (error) {
    if (String((error as { code?: string }).code) === "23505") {
      throw new FactorServiceError("factor_name_conflict", 409);
    }
    throw error;
  }
}

export async function updateFactor(
  tenantId: string,
  factorId: string,
  patch: Partial<{
    name: string;
    advance_rate: number;
    fee_rate: number;
    reserve_rate: number;
    recourse_days: number;
    active: boolean;
    fee_schedule: unknown[] | null;
    reserve_schedule: unknown[] | null;
    fee_application_mode: string;
    remittance_details: unknown | null;
    notes: string | null;
  }>,
  deps: { client: Queryable }
): Promise<FactorRow> {
  const updates: string[] = [];
  const values: unknown[] = [tenantId, factorId];

  if (patch.name !== undefined) {
    values.push(patch.name.trim());
    updates.push(`name = $${values.length}`);
  }
  if (patch.advance_rate !== undefined) {
    values.push(patch.advance_rate);
    updates.push(`advance_rate = $${values.length}::numeric`);
  }
  if (patch.fee_rate !== undefined) {
    values.push(patch.fee_rate);
    updates.push(`fee_rate = $${values.length}::numeric`);
  }
  if (patch.reserve_rate !== undefined) {
    values.push(patch.reserve_rate);
    updates.push(`reserve_rate = $${values.length}::numeric`);
  }
  if (patch.recourse_days !== undefined) {
    values.push(patch.recourse_days);
    updates.push(`recourse_days = $${values.length}::int`);
  }
  if (patch.active !== undefined) {
    values.push(patch.active);
    updates.push(`active = $${values.length}::boolean`);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "fee_schedule")) {
    values.push(patch.fee_schedule != null ? JSON.stringify(patch.fee_schedule) : null);
    updates.push(`fee_schedule = $${values.length}::jsonb`);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "reserve_schedule")) {
    values.push(patch.reserve_schedule != null ? JSON.stringify(patch.reserve_schedule) : null);
    updates.push(`reserve_schedule = $${values.length}::jsonb`);
  }
  if (patch.fee_application_mode !== undefined) {
    values.push(patch.fee_application_mode);
    updates.push(`fee_application_mode = $${values.length}`);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "remittance_details")) {
    values.push(patch.remittance_details != null ? JSON.stringify(patch.remittance_details) : null);
    updates.push(`remittance_details = $${values.length}::jsonb`);
  }
  if (Object.prototype.hasOwnProperty.call(patch, "notes")) {
    values.push(patch.notes ?? null);
    updates.push(`notes = $${values.length}`);
  }

  if (updates.length === 0) {
    const current = await deps.client.query<Record<string, unknown>>(
      `
        SELECT
          id::text,
          tenant_id::text,
          name,
          advance_rate::numeric,
          fee_rate::numeric,
          reserve_rate::numeric,
          recourse_days,
          active,
          fee_schedule,
          reserve_schedule,
          fee_application_mode,
          remittance_details,
          notes,
          created_at::text,
          updated_at::text
        FROM factoring.factor
        WHERE tenant_id = $1::uuid
          AND id = $2::uuid
        LIMIT 1
      `,
      [tenantId, factorId]
    );
    if (!current.rows[0]) throw new FactorServiceError("factor_not_found", 404);
    return mapFactorRow(current.rows[0]);
  }

  updates.push("updated_at = now()");

  try {
    const res = await deps.client.query<Record<string, unknown>>(
      `
        UPDATE factoring.factor
        SET ${updates.join(", ")}
        WHERE tenant_id = $1::uuid
          AND id = $2::uuid
        RETURNING
          id::text,
          tenant_id::text,
          name,
          advance_rate::numeric,
          fee_rate::numeric,
          reserve_rate::numeric,
          recourse_days,
          active,
          fee_schedule,
          reserve_schedule,
          fee_application_mode,
          remittance_details,
          notes,
          created_at::text,
          updated_at::text
      `,
      values
    );

    if (!res.rows[0]) throw new FactorServiceError("factor_not_found", 404);
    return mapFactorRow(res.rows[0]);
  } catch (error) {
    if (String((error as { code?: string }).code) === "23505") {
      throw new FactorServiceError("factor_name_conflict", 409);
    }
    throw error;
  }
}

export async function deactivateFactor(tenantId: string, factorId: string, deps: { client: Queryable }): Promise<FactorRow> {
  const res = await deps.client.query<Record<string, unknown>>(
    `
      UPDATE factoring.factor
      SET active = false,
          updated_at = now()
      WHERE tenant_id = $1::uuid
        AND id = $2::uuid
      RETURNING
        id::text,
        tenant_id::text,
        name,
        advance_rate::numeric,
        fee_rate::numeric,
        reserve_rate::numeric,
        recourse_days,
        active,
        fee_schedule,
        reserve_schedule,
        fee_application_mode,
        remittance_details,
        notes,
        created_at::text,
        updated_at::text
    `,
    [tenantId, factorId]
  );

  if (!res.rows[0]) throw new FactorServiceError("factor_not_found", 404);
  return mapFactorRow(res.rows[0]);
}

export async function assignCustomerToFactor(
  tenantId: string,
  customerId: string,
  factorId: string,
  effectiveFrom: string,
  deps: { client: Queryable }
): Promise<CustomerFactorAssignmentRow> {
  const factorRes = await deps.client.query<Record<string, unknown>>(
    `
      SELECT id::text
      FROM factoring.factor
      WHERE tenant_id = $1::uuid
        AND id = $2::uuid
      LIMIT 1
    `,
    [tenantId, factorId]
  );
  if (!factorRes.rows[0]) throw new FactorServiceError("factor_not_found", 404);

  await deps.client.query(
    `
      UPDATE factoring.customer_factor_assignment
      SET effective_to = ($3::date - INTERVAL '1 day')::date
      WHERE tenant_id = $1::uuid
        AND customer_id = $2::uuid
        AND effective_to IS NULL
        AND effective_from < $3::date
    `,
    [tenantId, customerId, effectiveFrom]
  );

  const inserted = await deps.client.query<Record<string, unknown>>(
    `
      INSERT INTO factoring.customer_factor_assignment (
        tenant_id,
        customer_id,
        factor_id,
        effective_from,
        effective_to,
        created_at
      )
      VALUES (
        $1::uuid,
        $2::uuid,
        $3::uuid,
        $4::date,
        NULL,
        now()
      )
      RETURNING
        id::text,
        tenant_id::text,
        customer_id::text,
        factor_id::text,
        effective_from::text,
        effective_to::text,
        created_at::text
    `,
    [tenantId, customerId, factorId, effectiveFrom]
  );

  const assignment = inserted.rows[0] ?? {};
  const factor = await deps.client.query<Record<string, unknown>>(
    `
      SELECT name
      FROM factoring.factor
      WHERE tenant_id = $1::uuid
        AND id = $2::uuid
      LIMIT 1
    `,
    [tenantId, factorId]
  );

  return {
    ...mapAssignmentRow({
      ...assignment,
      factor_name: factor.rows[0]?.name ?? "Unknown factor",
    }),
  };
}

export async function listFactorAssignmentsForCustomer(
  tenantId: string,
  customerId: string,
  deps: { client: Queryable }
): Promise<CustomerFactorAssignmentRow[]> {
  const res = await deps.client.query<Record<string, unknown>>(
    `
      SELECT
        a.id::text,
        a.tenant_id::text,
        a.customer_id::text,
        a.factor_id::text,
        f.name AS factor_name,
        a.effective_from::text,
        a.effective_to::text,
        a.created_at::text
      FROM factoring.customer_factor_assignment a
      JOIN factoring.factor f ON f.id = a.factor_id
      WHERE a.tenant_id = $1::uuid
        AND a.customer_id = $2::uuid
      ORDER BY a.effective_from DESC, a.created_at DESC
    `,
    [tenantId, customerId]
  );

  return res.rows.map(mapAssignmentRow);
}

export async function listFactorBatchHistoryForCustomer(
  tenantId: string,
  customerId: string,
  deps: { client: Queryable }
): Promise<BatchFactorHistoryRow[]> {
  const res = await deps.client.query<Record<string, unknown>>(
    `
      SELECT DISTINCT
        b.id::text,
        b.batch_number,
        b.status,
        b.submitted_at::text,
        b.funded_at::text,
        b.total_face_cents::bigint,
        b.expected_advance_cents::bigint,
        b.expected_fee_cents::bigint
      FROM factoring.batch b
      JOIN accounting.invoices i ON i.id = ANY(b.invoice_ids)
      WHERE b.tenant_id = $1::uuid
        AND i.operating_company_id = $1::uuid
        AND i.customer_id = $2::uuid
      ORDER BY COALESCE(b.submitted_at, b.funded_at) DESC NULLS LAST, b.batch_number DESC
      LIMIT 200
    `,
    [tenantId, customerId]
  );
  return res.rows.map(mapBatchHistoryRow);
}

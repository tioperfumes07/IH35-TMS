import type { BatchInvoiceLite, BatchTotals, FactoringBatchStatus } from "./batch.shared.js";
import { getFactorForCustomer } from "./factor.service.js";
import { autoPostOverageOnSettle } from "./reserve.service.js";

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
};

export type FactoringBatchRow = {
  id: string;
  tenant_id: string;
  batch_number: string;
  status: FactoringBatchStatus;
  invoice_ids: string[];
  total_face_cents: number;
  advance_rate: number;
  expected_advance_cents: number;
  fee_rate: number;
  expected_fee_cents: number;
  submitted_at: string | null;
  funded_at: string | null;
  factor_id: string | null;
};

export type FactoringBatchInvoiceRow = {
  id: string;
  display_id: string | null;
  customer_id: string | null;
  customer_name: string | null;
  issue_date: string | null;
  due_date: string | null;
  status: string | null;
  total_cents: number;
};

export class FactoringBatchError extends Error {
  constructor(
    readonly code:
      | "invoice_ids_required"
      | "invoice_not_eligible"
      | "mixed_factors_not_allowed"
      | "batch_not_found"
      | "invalid_status_transition"
      | "batch_already_submitted"
      | "batch_already_funded",
    readonly statusCode: number,
    readonly details?: Record<string, unknown>
  ) {
    super(code);
  }
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return Number(value ?? 0);
}

function mapBatchRow(row: Record<string, unknown>): FactoringBatchRow {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    batch_number: String(row.batch_number),
    status: String(row.status) as FactoringBatchStatus,
    invoice_ids: Array.isArray(row.invoice_ids) ? row.invoice_ids.map((v) => String(v)) : [],
    total_face_cents: toNumber(row.total_face_cents),
    advance_rate: toNumber(row.advance_rate),
    expected_advance_cents: toNumber(row.expected_advance_cents),
    fee_rate: toNumber(row.fee_rate),
    expected_fee_cents: toNumber(row.expected_fee_cents),
    submitted_at: row.submitted_at ? String(row.submitted_at) : null,
    funded_at: row.funded_at ? String(row.funded_at) : null,
    factor_id: row.factor_id ? String(row.factor_id) : null,
  };
}

function normalizeInvoiceIds(invoiceIds: string[]) {
  return Array.from(new Set(invoiceIds.map((id) => id.trim()).filter(Boolean)));
}

function buildBatchNumber(now = new Date()) {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const mm = String(now.getUTCMinutes()).padStart(2, "0");
  const ss = String(now.getUTCSeconds()).padStart(2, "0");
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `BATCH-${y}${m}${d}-${hh}${mm}${ss}-${suffix}`;
}

export function calculateBatchTotals(invoices: BatchInvoiceLite[], advanceRate: number, feeRate: number): BatchTotals {
  const totalFace = invoices.reduce((sum, invoice) => sum + Number(invoice.total_cents ?? 0), 0);
  return {
    total_face_cents: totalFace,
    expected_advance_cents: Math.round(totalFace * advanceRate),
    expected_fee_cents: Math.round(totalFace * feeRate),
  };
}

export async function createDraftBatch(
  tenantId: string,
  invoiceIds: string[],
  deps: {
    client: Queryable;
    advanceRate?: number;
    feeRate?: number;
    now?: Date;
  }
): Promise<FactoringBatchRow> {
  const ids = normalizeInvoiceIds(invoiceIds);
  if (ids.length === 0) throw new FactoringBatchError("invoice_ids_required", 400);

  const invoiceRes = await deps.client.query<Record<string, unknown>>(
    `
      SELECT
        i.id::text,
        i.customer_id::text,
        COALESCE(i.issue_date::text, i.due_date::text, now()::date::text) AS factor_as_of_date,
        i.total_cents::bigint
      FROM accounting.invoices i
      WHERE i.operating_company_id = $1::uuid
        AND i.id = ANY($2::uuid[])
        AND i.status IN ('sent', 'partial')
        AND COALESCE(i.factoring_status, 'not_factored') = 'not_factored'
        AND NOT EXISTS (
          SELECT 1
          FROM factoring.batch b
          WHERE b.tenant_id = $1::uuid
            AND i.id = ANY(b.invoice_ids)
        )
    `,
    [tenantId, ids]
  );

  const foundIds = new Set(invoiceRes.rows.map((row) => String(row.id)));
  const missingIds = ids.filter((id) => !foundIds.has(id));
  if (missingIds.length > 0) {
    throw new FactoringBatchError("invoice_not_eligible", 400, { invoice_ids: missingIds });
  }

  const customerResolution = new Map<string, { factor_id: string | null; factor_name: string | null }>();

  for (const invoice of invoiceRes.rows) {
    const customerId = invoice.customer_id ? String(invoice.customer_id) : null;
    if (!customerId || customerResolution.has(customerId)) continue;
    const factor = await getFactorForCustomer(
      tenantId,
      customerId,
      String(invoice.factor_as_of_date ?? new Date().toISOString().slice(0, 10)),
      { client: deps.client }
    );
    customerResolution.set(customerId, {
      factor_id: factor?.id ?? null,
      factor_name: factor?.name ?? null,
    });
  }

  const factorPairs = Array.from(customerResolution.entries())
    .map(([customer_id, factor]) => ({
      customer_id,
      factor_id: factor.factor_id,
      factor_name: factor.factor_name,
    }))
    .sort((a, b) => a.customer_id.localeCompare(b.customer_id));

  const uniqueFactorIds = new Set(factorPairs.map((pair) => pair.factor_id ?? "__NULL_FACTOR__"));
  if (uniqueFactorIds.size > 1) {
    throw new FactoringBatchError("mixed_factors_not_allowed", 400, { customer_factors: factorPairs });
  }

  const resolvedFactorId = factorPairs[0]?.factor_id ?? null;

  const advanceRate = deps.advanceRate ?? 0.95;
  const feeRate = deps.feeRate ?? 0.025;
  const totals = calculateBatchTotals(
    invoiceRes.rows.map((row) => ({
      id: String(row.id),
      total_cents: toNumber(row.total_cents),
    })),
    advanceRate,
    feeRate
  );

  const insert = await deps.client.query<Record<string, unknown>>(
    `
      INSERT INTO factoring.batch (
        tenant_id,
        batch_number,
        status,
        invoice_ids,
        total_face_cents,
        advance_rate,
        expected_advance_cents,
        fee_rate,
        expected_fee_cents,
        submitted_at,
        funded_at,
        factor_id
      )
      VALUES (
        $1::uuid,
        $2,
        'draft',
        $3::uuid[],
        $4::bigint,
        $5::numeric,
        $6::bigint,
        $7::numeric,
        $8::bigint,
        NULL,
        NULL,
        $9::uuid
      )
      RETURNING *
    `,
    [
      tenantId,
      buildBatchNumber(deps.now),
      ids,
      totals.total_face_cents,
      advanceRate,
      totals.expected_advance_cents,
      feeRate,
      totals.expected_fee_cents,
      resolvedFactorId,
    ]
  );

  return mapBatchRow(insert.rows[0] ?? {});
}

export async function submitBatch(
  batchId: string,
  tenantId: string,
  deps: { client: Queryable }
): Promise<FactoringBatchRow> {
  const current = await deps.client.query<Record<string, unknown>>(
    `
      SELECT id::text, status
      FROM factoring.batch
      WHERE id = $1::uuid
        AND tenant_id = $2::uuid
      LIMIT 1
    `,
    [batchId, tenantId]
  );

  const currentRow = current.rows[0];
  if (!currentRow) throw new FactoringBatchError("batch_not_found", 404);
  if (String(currentRow.status) === "submitted") throw new FactoringBatchError("batch_already_submitted", 409);
  if (String(currentRow.status) === "funded") throw new FactoringBatchError("batch_already_funded", 409);
  if (String(currentRow.status) !== "draft") {
    throw new FactoringBatchError("invalid_status_transition", 409, {
      from: String(currentRow.status),
      to: "submitted",
    });
  }

  const updated = await deps.client.query<Record<string, unknown>>(
    `
      UPDATE factoring.batch
      SET status = 'submitted',
          submitted_at = now()
      WHERE id = $1::uuid
        AND tenant_id = $2::uuid
      RETURNING *
    `,
    [batchId, tenantId]
  );

  if (!updated.rows[0]) throw new FactoringBatchError("batch_not_found", 404);
  return mapBatchRow(updated.rows[0]);
}

export async function fundBatch(
  batchId: string,
  actualFundedCents: number,
  tenantId: string,
  deps: { client: Queryable }
): Promise<FactoringBatchRow> {
  const current = await deps.client.query<Record<string, unknown>>(
    `
      SELECT id::text, status
      FROM factoring.batch
      WHERE id = $1::uuid
        AND tenant_id = $2::uuid
      LIMIT 1
    `,
    [batchId, tenantId]
  );

  const currentRow = current.rows[0];
  if (!currentRow) throw new FactoringBatchError("batch_not_found", 404);
  if (String(currentRow.status) === "funded") throw new FactoringBatchError("batch_already_funded", 409);
  if (String(currentRow.status) !== "submitted") {
    throw new FactoringBatchError("invalid_status_transition", 409, {
      from: String(currentRow.status),
      to: "funded",
    });
  }

  const updated = await deps.client.query<Record<string, unknown>>(
    `
      UPDATE factoring.batch
      SET status = 'funded',
          funded_at = now()
      WHERE id = $1::uuid
        AND tenant_id = $2::uuid
      RETURNING *
    `,
    [batchId, tenantId]
  );

  if (!updated.rows[0]) throw new FactoringBatchError("batch_not_found", 404);
  await autoPostOverageOnSettle(batchId, actualFundedCents, tenantId, { client: deps.client });
  return mapBatchRow(updated.rows[0]);
}

export async function listBatches(
  tenantId: string,
  deps: { client: Queryable; status?: FactoringBatchStatus }
): Promise<FactoringBatchRow[]> {
  const values: unknown[] = [tenantId];
  const filters = ["tenant_id = $1::uuid"];
  if (deps.status) {
    values.push(deps.status);
    filters.push(`status = $${values.length}`);
  }
  const result = await deps.client.query<Record<string, unknown>>(
    `
      SELECT *
      FROM factoring.batch
      WHERE ${filters.join(" AND ")}
      ORDER BY COALESCE(submitted_at, funded_at) DESC NULLS LAST, batch_number DESC
    `,
    values
  );
  return result.rows.map(mapBatchRow);
}

export async function listCandidateInvoices(
  tenantId: string,
  deps: { client: Queryable }
): Promise<FactoringBatchInvoiceRow[]> {
  const res = await deps.client.query<Record<string, unknown>>(
    `
      SELECT
        i.id::text,
        i.display_id,
        i.customer_id::text,
        c.customer_name,
        i.issue_date::text,
        i.due_date::text,
        i.status,
        i.total_cents::bigint
      FROM accounting.invoices i
      LEFT JOIN mdata.customers c ON c.id = i.customer_id
      WHERE i.operating_company_id = $1::uuid
        AND i.status IN ('sent', 'partial')
        AND COALESCE(i.factoring_status, 'not_factored') = 'not_factored'
        AND NOT EXISTS (
          SELECT 1
          FROM factoring.batch b
          WHERE b.tenant_id = $1::uuid
            AND i.id = ANY(b.invoice_ids)
        )
      ORDER BY i.issue_date DESC NULLS LAST, i.created_at DESC
      LIMIT 500
    `,
    [tenantId]
  );
  return res.rows.map((row) => ({
    id: String(row.id),
    display_id: row.display_id ? String(row.display_id) : null,
    customer_id: row.customer_id ? String(row.customer_id) : null,
    customer_name: row.customer_name ? String(row.customer_name) : null,
    issue_date: row.issue_date ? String(row.issue_date) : null,
    due_date: row.due_date ? String(row.due_date) : null,
    status: row.status ? String(row.status) : null,
    total_cents: toNumber(row.total_cents),
  }));
}

export async function getBatchDetail(
  batchId: string,
  tenantId: string,
  deps: { client: Queryable }
): Promise<{ batch: FactoringBatchRow; invoices: FactoringBatchInvoiceRow[] } | null> {
  const batchRes = await deps.client.query<Record<string, unknown>>(
    `
      SELECT *
      FROM factoring.batch
      WHERE id = $1::uuid
        AND tenant_id = $2::uuid
      LIMIT 1
    `,
    [batchId, tenantId]
  );
  const row = batchRes.rows[0];
  if (!row) return null;
  const batch = mapBatchRow(row);

  const invoicesRes = await deps.client.query<Record<string, unknown>>(
    `
      SELECT
        i.id::text,
        i.display_id,
        i.customer_id::text,
        c.customer_name,
        i.issue_date::text,
        i.due_date::text,
        i.status,
        i.total_cents::bigint
      FROM unnest($1::uuid[]) WITH ORDINALITY AS input_ids(invoice_id, ord)
      JOIN accounting.invoices i ON i.id = input_ids.invoice_id
      LEFT JOIN mdata.customers c ON c.id = i.customer_id
      WHERE i.operating_company_id = $2::uuid
      ORDER BY input_ids.ord ASC
    `,
    [batch.invoice_ids, tenantId]
  );

  return {
    batch,
    invoices: invoicesRes.rows.map((invoice) => ({
      id: String(invoice.id),
      display_id: invoice.display_id ? String(invoice.display_id) : null,
      customer_id: invoice.customer_id ? String(invoice.customer_id) : null,
      customer_name: invoice.customer_name ? String(invoice.customer_name) : null,
      issue_date: invoice.issue_date ? String(invoice.issue_date) : null,
      due_date: invoice.due_date ? String(invoice.due_date) : null,
      status: invoice.status ? String(invoice.status) : null,
      total_cents: toNumber(invoice.total_cents),
    })),
  };
}

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
};

export type SubmissionQueueItem = {
  invoice_id: string;
  display_id: string | null;
  customer_id: string | null;
  customer_name: string | null;
  issue_date: string | null;
  due_date: string | null;
  total_cents: number;
  factor_id: string | null;
  factor_name: string | null;
  load_id: string | null;
  has_approved_pod: boolean;
  has_rate_confirmation: boolean;
  is_submittable: boolean;
  missing_docs: string[];
};

export type WorkqueueItem = {
  invoice_id: string;
  display_id: string | null;
  customer_id: string | null;
  customer_name: string | null;
  batch_number: string | null;
  factoring_status: string | null;
  submitted_at: string | null;
  factor_name: string | null;
  total_cents: number;
  advance_cents: number;
  reserve_cents: number;
  fee_cents: number;
  chargeback_cents: number;
  recourse_expiry_date: string | null;
  days_until_recourse_expiry: number | null;
};

function toNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v);
  return 0;
}

export async function listSubmissionQueueInvoices(
  operatingCompanyId: string,
  deps: { client: Queryable }
): Promise<SubmissionQueueItem[]> {
  const res = await deps.client.query<Record<string, unknown>>(
    `
      SELECT
        i.id::text                          AS invoice_id,
        i.display_id,
        i.customer_id::text,
        c.customer_name,
        i.issue_date::text,
        i.due_date::text,
        i.total_cents::bigint,
        i.source_load_id::text              AS load_id,
        fv.id::text                         AS factor_id,
        fv.vendor_name                      AS factor_name,
        -- POD gate: at least one approved POD on this load
        COALESCE((
          SELECT true
          FROM dispatch.pod_documents pd
          WHERE pd.load_id   = i.source_load_id
            AND pd.operating_company_id = i.operating_company_id
            AND pd.status     = 'approved'
            AND pd.archived_at IS NULL
          LIMIT 1
        ), false)::boolean                  AS has_approved_pod,
        -- Rate-con gate: a rate_confirmation file linked to this load
        COALESCE((
          SELECT true
          FROM docs.file_links fl
          JOIN docs.files      f  ON f.id = fl.file_id
          JOIN catalogs.file_categories fc ON fc.id = f.category_id
          WHERE fl.entity_type = 'load'
            AND fl.entity_id   = i.source_load_id
            AND fl.deleted_at  IS NULL
            AND f.deleted_at   IS NULL
            AND fc.code        = 'rate_confirmation'
          LIMIT 1
        ), false)::boolean                  AS has_rate_confirmation
      FROM accounting.invoices i
      JOIN mdata.customers c ON c.id = i.customer_id
                             AND c.operating_company_id = $1::uuid
      JOIN mdata.vendors   fv ON fv.id = c.factoring_company_vendor_id
                              AND fv.operating_company_id = $1::uuid
      WHERE i.operating_company_id = $1::uuid
        AND i.status                = 'sent'
        AND COALESCE(i.factoring_status, 'not_factored') = 'not_factored'
        AND i.voided_at            IS NULL
        AND c.factoring_company_vendor_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM factoring.batch b
          WHERE b.tenant_id = $1::uuid
            AND i.id = ANY(b.invoice_ids)
            AND b.status NOT IN ('rejected')
        )
      ORDER BY i.issue_date ASC NULLS LAST, i.created_at ASC
      LIMIT 500
    `,
    [operatingCompanyId]
  );

  return res.rows.map((row) => {
    const hasPod = Boolean(row.has_approved_pod);
    const hasRatecon = Boolean(row.has_rate_confirmation);
    const missing: string[] = [];
    if (!hasPod) missing.push("POD (approved)");
    if (!hasRatecon) missing.push("Rate Confirmation");
    return {
      invoice_id: String(row.invoice_id),
      display_id: row.display_id ? String(row.display_id) : null,
      customer_id: row.customer_id ? String(row.customer_id) : null,
      customer_name: row.customer_name ? String(row.customer_name) : null,
      issue_date: row.issue_date ? String(row.issue_date) : null,
      due_date: row.due_date ? String(row.due_date) : null,
      total_cents: toNumber(row.total_cents),
      factor_id: row.factor_id ? String(row.factor_id) : null,
      factor_name: row.factor_name ? String(row.factor_name) : null,
      load_id: row.load_id ? String(row.load_id) : null,
      has_approved_pod: hasPod,
      has_rate_confirmation: hasRatecon,
      is_submittable: hasPod && hasRatecon,
      missing_docs: missing,
    };
  });
}

export async function listWorkqueueInvoices(
  operatingCompanyId: string,
  deps: { client: Queryable }
): Promise<WorkqueueItem[]> {
  const res = await deps.client.query<Record<string, unknown>>(
    `
      SELECT
        i.id::text                                     AS invoice_id,
        i.display_id,
        i.customer_id::text,
        c.customer_name,
        b.batch_number,
        i.factoring_status,
        b.submitted_at::text,
        fv.vendor_name                                 AS factor_name,
        i.total_cents::bigint,
        COALESCE(fa.advance_amount_cents, 0)::bigint   AS advance_cents,
        COALESCE(fa.reserve_amount_cents, 0)::bigint   AS reserve_cents,
        COALESCE(fa.factor_fee_cents, 0)::bigint       AS fee_cents,
        -- Chargeback from reserve movements (held to a chargeback movement)
        COALESCE((
          SELECT SUM(rm.amount_cents)
          FROM accounting.factoring_reserve_movements rm
          WHERE rm.factoring_advance_id    = fa.id
            AND rm.operating_company_id    = i.operating_company_id
            AND rm.movement_type           = 'chargeback'
        ), 0)::bigint                                  AS chargeback_cents,
        -- Recourse expiry sourced from view (90-day rule hardcoded per view logic)
        rr.recourse_expiry_date::text,
        rr.days_until_recourse_expiry
      FROM accounting.invoices i
      LEFT JOIN mdata.customers c          ON c.id  = i.customer_id
                                           AND c.operating_company_id = $1::uuid
      LEFT JOIN factoring.batch b
        ON i.id = ANY(b.invoice_ids)
        AND b.tenant_id = i.operating_company_id
      LEFT JOIN accounting.factoring_advances fa ON fa.id = i.factoring_advance_id
      LEFT JOIN mdata.vendors fv            ON fv.id = fa.factoring_company_vendor_id
                                            AND fv.operating_company_id = $1::uuid
      -- Recourse view: join on factoring_advance_id (the invoice-level FK)
      LEFT JOIN views.factoring_recourse_at_risk rr
        ON rr.factoring_advance_id = fa.id
        AND rr.operating_company_id = i.operating_company_id
      WHERE i.operating_company_id                      = $1::uuid
        AND i.factoring_status NOT IN ('not_factored', 'released')
        AND i.voided_at IS NULL
      ORDER BY b.submitted_at DESC NULLS LAST, i.created_at DESC
      LIMIT 500
    `,
    [operatingCompanyId]
  );

  return res.rows.map((row) => ({
    invoice_id: String(row.invoice_id),
    display_id: row.display_id ? String(row.display_id) : null,
    customer_id: row.customer_id ? String(row.customer_id) : null,
    customer_name: row.customer_name ? String(row.customer_name) : null,
    batch_number: row.batch_number ? String(row.batch_number) : null,
    factoring_status: row.factoring_status ? String(row.factoring_status) : null,
    submitted_at: row.submitted_at ? String(row.submitted_at) : null,
    factor_name: row.factor_name ? String(row.factor_name) : null,
    total_cents: toNumber(row.total_cents),
    advance_cents: toNumber(row.advance_cents),
    reserve_cents: toNumber(row.reserve_cents),
    fee_cents: toNumber(row.fee_cents),
    chargeback_cents: toNumber(row.chargeback_cents),
    recourse_expiry_date: row.recourse_expiry_date ? String(row.recourse_expiry_date) : null,
    days_until_recourse_expiry: row.days_until_recourse_expiry != null ? Number(row.days_until_recourse_expiry) : null,
  }));
}

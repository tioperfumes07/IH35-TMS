// FIN-20 — AR / AP aging (READ-ONLY).
//
// Reads the canonical, opco-scoped aging summaries straight from `views.ar_aging` / `views.ap_aging`
// (both security_invoker=true, RLS-safe; buckets computed at CURRENT_DATE inside the view). Drill-down
// reads the open source rows (accounting.invoices / accounting.bills) for display only. NO new aging
// math is invented here and NOTHING is written — every statement is a SELECT.
//
// Buckets (as defined by the views): current | 1-30 | 31-60 | 61-90 | 91+ days past due, plus the
// per-row open total. Money is integer cents.

import { withCurrentUser } from "../auth/db.js";

export type AgingBuckets = {
  current_cents: number;
  bucket_1_30_cents: number;
  bucket_31_60_cents: number;
  bucket_61_90_cents: number;
  bucket_91_plus_cents: number;
  total_open_cents: number;
};

export type ArAgingCustomerRow = AgingBuckets & {
  customer_id: string;
  customer_name: string;
  open_invoice_count: number;
};

export type ApAgingVendorRow = AgingBuckets & {
  vendor_id: string;
  vendor_name: string;
  open_bill_count: number;
};

export type ArAgingSummary = {
  as_of_date: string;
  customers: ArAgingCustomerRow[];
  totals: AgingBuckets;
};

export type ApAgingSummary = {
  as_of_date: string;
  vendors: ApAgingVendorRow[];
  totals: AgingBuckets;
};

export type ArAgingInvoiceRow = {
  invoice_id: string;
  display_id: string;
  status: string;
  issue_date: string;
  due_date: string;
  total_cents: number;
  amount_paid_cents: number;
  amount_open_cents: number;
  days_overdue: number;
};

export type ApAgingBillRow = {
  bill_id: string;
  bill_number: string | null;
  status: string;
  bill_date: string;
  due_date: string | null;
  memo: string | null;
  amount_cents: number;
  paid_cents: number;
  open_cents: number;
  days_overdue: number;
};

const num = (v: unknown): number => Number(v ?? 0);

function emptyBuckets(): AgingBuckets {
  return {
    current_cents: 0,
    bucket_1_30_cents: 0,
    bucket_31_60_cents: 0,
    bucket_61_90_cents: 0,
    bucket_91_plus_cents: 0,
    total_open_cents: 0,
  };
}

function addBuckets(acc: AgingBuckets, row: AgingBuckets): AgingBuckets {
  acc.current_cents += row.current_cents;
  acc.bucket_1_30_cents += row.bucket_1_30_cents;
  acc.bucket_31_60_cents += row.bucket_31_60_cents;
  acc.bucket_61_90_cents += row.bucket_61_90_cents;
  acc.bucket_91_plus_cents += row.bucket_91_plus_cents;
  acc.total_open_cents += row.total_open_cents;
  return acc;
}

async function scopeCompany(client: { query: (sql: string, values?: unknown[]) => Promise<unknown> }, operatingCompanyId: string) {
  await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
}

export async function getArAgingSummary(input: {
  userId: string;
  operating_company_id: string;
  as_of_date: string;
}): Promise<ArAgingSummary> {
  return withCurrentUser(input.userId, async (client) => {
    await scopeCompany(client, input.operating_company_id);

    const res = await client.query<Record<string, unknown>>(
      `
        SELECT
          customer_id::text       AS customer_id,
          COALESCE(customer_name, '') AS customer_name,
          open_invoice_count::bigint  AS open_invoice_count,
          current_cents::bigint       AS current_cents,
          bucket_1_30_cents::bigint   AS bucket_1_30_cents,
          bucket_31_60_cents::bigint  AS bucket_31_60_cents,
          bucket_61_90_cents::bigint  AS bucket_61_90_cents,
          bucket_91_plus_cents::bigint AS bucket_91_plus_cents,
          total_open_cents::bigint    AS total_open_cents
        FROM views.ar_aging
        WHERE operating_company_id = $1::uuid
          AND total_open_cents > 0
        ORDER BY total_open_cents DESC, customer_name ASC
      `,
      [input.operating_company_id]
    );

    const customers: ArAgingCustomerRow[] = res.rows.map((r) => ({
      customer_id: String(r.customer_id),
      customer_name: String(r.customer_name ?? ""),
      open_invoice_count: num(r.open_invoice_count),
      current_cents: num(r.current_cents),
      bucket_1_30_cents: num(r.bucket_1_30_cents),
      bucket_31_60_cents: num(r.bucket_31_60_cents),
      bucket_61_90_cents: num(r.bucket_61_90_cents),
      bucket_91_plus_cents: num(r.bucket_91_plus_cents),
      total_open_cents: num(r.total_open_cents),
    }));

    const totals = customers.reduce<AgingBuckets>((acc, row) => addBuckets(acc, row), emptyBuckets());
    return { as_of_date: input.as_of_date, customers, totals };
  });
}

export async function getApAgingSummary(input: {
  userId: string;
  operating_company_id: string;
  as_of_date: string;
}): Promise<ApAgingSummary> {
  return withCurrentUser(input.userId, async (client) => {
    await scopeCompany(client, input.operating_company_id);

    const res = await client.query<Record<string, unknown>>(
      `
        SELECT
          vendor_id::text         AS vendor_id,
          COALESCE(vendor_name, 'Unknown vendor') AS vendor_name,
          open_bill_count::bigint     AS open_bill_count,
          current_cents::bigint       AS current_cents,
          bucket_1_30_cents::bigint   AS bucket_1_30_cents,
          bucket_31_60_cents::bigint  AS bucket_31_60_cents,
          bucket_61_90_cents::bigint  AS bucket_61_90_cents,
          bucket_91_plus_cents::bigint AS bucket_91_plus_cents,
          total_open_cents::bigint    AS total_open_cents
        FROM views.ap_aging
        WHERE operating_company_id = $1::uuid
          AND total_open_cents > 0
        ORDER BY total_open_cents DESC, vendor_name ASC
      `,
      [input.operating_company_id]
    );

    const vendors: ApAgingVendorRow[] = res.rows.map((r) => ({
      vendor_id: String(r.vendor_id),
      vendor_name: String(r.vendor_name ?? "Unknown vendor"),
      open_bill_count: num(r.open_bill_count),
      current_cents: num(r.current_cents),
      bucket_1_30_cents: num(r.bucket_1_30_cents),
      bucket_31_60_cents: num(r.bucket_31_60_cents),
      bucket_61_90_cents: num(r.bucket_61_90_cents),
      bucket_91_plus_cents: num(r.bucket_91_plus_cents),
      total_open_cents: num(r.total_open_cents),
    }));

    const totals = vendors.reduce<AgingBuckets>((acc, row) => addBuckets(acc, row), emptyBuckets());
    return { as_of_date: input.as_of_date, vendors, totals };
  });
}

// Drill: open invoices behind a single customer's AR aging row. Matches the view's open filter
// (status sent/partial, not voided, positive open balance). Display only.
export async function getArAgingCustomerInvoices(input: {
  userId: string;
  operating_company_id: string;
  customer_id: string;
}): Promise<ArAgingInvoiceRow[]> {
  return withCurrentUser(input.userId, async (client) => {
    await scopeCompany(client, input.operating_company_id);

    const res = await client.query<Record<string, unknown>>(
      `
        SELECT
          i.id::text          AS invoice_id,
          i.display_id        AS display_id,
          i.status            AS status,
          i.issue_date::text  AS issue_date,
          i.due_date::text    AS due_date,
          i.total_cents::bigint        AS total_cents,
          i.amount_paid_cents::bigint  AS amount_paid_cents,
          i.amount_open_cents::bigint  AS amount_open_cents,
          GREATEST((CURRENT_DATE - i.due_date), 0)::int AS days_overdue
        FROM accounting.invoices i
        WHERE i.operating_company_id = $1::uuid
          AND i.customer_id = $2::uuid
          AND i.voided_at IS NULL
          AND i.status IN ('sent', 'partial')
          AND i.amount_open_cents > 0
        ORDER BY i.due_date ASC, i.display_id ASC
      `,
      [input.operating_company_id, input.customer_id]
    );

    return res.rows.map((r) => ({
      invoice_id: String(r.invoice_id),
      display_id: String(r.display_id ?? ""),
      status: String(r.status ?? ""),
      issue_date: String(r.issue_date ?? ""),
      due_date: String(r.due_date ?? ""),
      total_cents: num(r.total_cents),
      amount_paid_cents: num(r.amount_paid_cents),
      amount_open_cents: num(r.amount_open_cents),
      days_overdue: num(r.days_overdue),
    }));
  });
}

// Drill: open bills behind a single vendor's AP aging row. The vendor key mirrors the view's grain
// (COALESCE(trimmed vendor_uuid, vendor_id, 'unknown')). Display only.
export async function getApAgingVendorBills(input: {
  userId: string;
  operating_company_id: string;
  vendor_id: string;
}): Promise<ApAgingBillRow[]> {
  return withCurrentUser(input.userId, async (client) => {
    await scopeCompany(client, input.operating_company_id);

    const res = await client.query<Record<string, unknown>>(
      `
        SELECT
          b.id::text         AS bill_id,
          b.bill_number      AS bill_number,
          b.status           AS status,
          b.bill_date::text  AS bill_date,
          b.due_date::text   AS due_date,
          b.memo             AS memo,
          COALESCE(b.amount_cents, 0)::bigint AS amount_cents,
          COALESCE(b.paid_cents, 0)::bigint   AS paid_cents,
          GREATEST(COALESCE(b.amount_cents, 0) - COALESCE(b.paid_cents, 0), 0)::bigint AS open_cents,
          GREATEST((CURRENT_DATE - COALESCE(b.due_date, b.bill_date)), 0)::int AS days_overdue
        FROM accounting.bills b
        WHERE b.operating_company_id = $1::uuid
          AND b.revoked_at IS NULL
          AND b.status IN ('unpaid', 'partial')
          AND GREATEST(COALESCE(b.amount_cents, 0) - COALESCE(b.paid_cents, 0), 0) > 0
          AND COALESCE(NULLIF(TRIM(b.vendor_uuid), ''), b.vendor_id, 'unknown') = $2::text
        ORDER BY COALESCE(b.due_date, b.bill_date) ASC, b.bill_number ASC
      `,
      [input.operating_company_id, input.vendor_id]
    );

    return res.rows.map((r) => ({
      bill_id: String(r.bill_id),
      bill_number: r.bill_number == null ? null : String(r.bill_number),
      status: String(r.status ?? ""),
      bill_date: String(r.bill_date ?? ""),
      due_date: r.due_date == null ? null : String(r.due_date),
      memo: r.memo == null ? null : String(r.memo),
      amount_cents: num(r.amount_cents),
      paid_cents: num(r.paid_cents),
      open_cents: num(r.open_cents),
      days_overdue: num(r.days_overdue),
    }));
  });
}

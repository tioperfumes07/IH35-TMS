import { appendCrudAudit } from "../audit/crud-audit.js";
import { nextInvoiceDisplayId } from "./display-id.js";
import { recomputeInvoiceTotals } from "./shared.js";

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

type BuildInvoiceInput = {
  userId: string;
  operatingCompanyId: string;
  loadId: string;
};

type BuildInvoiceResult = {
  invoice: Record<string, unknown>;
  line: Record<string, unknown>;
  idempotent: boolean;
};

function toIsoDate(value: unknown) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export async function buildInvoiceFromLoad(client: Queryable, input: BuildInvoiceInput): Promise<BuildInvoiceResult> {
  const existingRes = await client.query(
    `
      SELECT i.*
      FROM accounting.invoices i
      WHERE i.operating_company_id = $1
        AND i.source_load_id = $2
      ORDER BY i.created_at DESC
      LIMIT 1
    `,
    [input.operatingCompanyId, input.loadId]
  );
  const existing = existingRes.rows[0] ?? null;
  if (existing) {
    const lineRes = await client.query(
      `
        SELECT *
        FROM accounting.invoice_lines
        WHERE invoice_id = $1
        ORDER BY display_order ASC, created_at ASC
        LIMIT 1
      `,
      [existing.id]
    );
    return { invoice: existing, line: lineRes.rows[0] ?? {}, idempotent: true };
  }

  const loadRes = await client.query(
    `
      SELECT
        l.id,
        l.customer_id,
        l.rate_total_cents,
        l.status,
        l.created_at,
        l.updated_at,
        c.payment_terms_id,
        c.ar_email,
        c.ar_phone,
        pt.terms_name AS payment_terms_label,
        pt.days_until_due AS payment_terms_days
      FROM mdata.loads l
      JOIN mdata.customers c ON c.id = l.customer_id
      LEFT JOIN catalogs.payment_terms pt ON pt.id = c.payment_terms_id
      WHERE l.id = $1
        AND l.operating_company_id = $2
      LIMIT 1
    `,
    [input.loadId, input.operatingCompanyId]
  );
  const load = loadRes.rows[0] ?? null;
  if (!load) throw Object.assign(new Error("load_not_found"), { code: "load_not_found" });

  const issueDate = new Date();
  const paymentTermsDays = Number(load.payment_terms_days ?? 30);
  const dueDate = new Date(issueDate);
  dueDate.setUTCDate(dueDate.getUTCDate() + paymentTermsDays);
  const displayId = await nextInvoiceDisplayId(client, input.operatingCompanyId, issueDate);

  const invoiceRes = await client.query(
    `
      INSERT INTO accounting.invoices (
        operating_company_id,
        customer_id,
        display_id,
        status,
        source_load_id,
        issue_date,
        due_date,
        delivery_date,
        payment_terms_id,
        payment_terms_label,
        payment_terms_days,
        ar_email_snapshot,
        ar_phone_snapshot,
        created_by_user_id,
        updated_by_user_id
      ) VALUES (
        $1,$2,$3,'draft',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13
      )
      RETURNING *
    `,
    [
      input.operatingCompanyId,
      load.customer_id,
      displayId,
      input.loadId,
      issueDate.toISOString().slice(0, 10),
      dueDate.toISOString().slice(0, 10),
      toIsoDate(load.updated_at) ?? toIsoDate(load.created_at),
      load.payment_terms_id ?? null,
      load.payment_terms_label ?? null,
      paymentTermsDays,
      load.ar_email ?? null,
      load.ar_phone ?? null,
      input.userId,
    ]
  );
  const invoice = invoiceRes.rows[0];

  const lineTotal = Number(load.rate_total_cents ?? 0);
  const lineRes = await client.query(
    `
      INSERT INTO accounting.invoice_lines (
        operating_company_id,
        invoice_id,
        source_load_id,
        line_type,
        description,
        quantity,
        unit_amount_cents,
        line_total_cents,
        display_order
      ) VALUES ($1,$2,$3,'linehaul',$4,1,$5,$5,0)
      RETURNING *
    `,
    [input.operatingCompanyId, invoice.id, input.loadId, `Linehaul · Load ${String(load.id)}`, lineTotal]
  );
  const line = lineRes.rows[0];

  await recomputeInvoiceTotals(client, String(invoice.id));
  const refreshedInvoiceRes = await client.query(`SELECT * FROM accounting.invoices WHERE id = $1 LIMIT 1`, [invoice.id]);
  const refreshedInvoice = refreshedInvoiceRes.rows[0] ?? invoice;

  await appendCrudAudit(
    client,
    input.userId,
    "accounting.invoices.created_from_load",
    {
      resource_type: "accounting.invoices",
      resource_id: refreshedInvoice.id,
      operating_company_id: input.operatingCompanyId,
      source_load_id: input.loadId,
      display_id: refreshedInvoice.display_id,
    },
    "info",
    "P3-T11.20.2-INVOICE-FLOW"
  );

  return { invoice: refreshedInvoice, line, idempotent: false };
}

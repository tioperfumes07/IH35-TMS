import { appendCrudAudit } from "../audit/crud-audit.js";
import { resolveInvoiceLineRevenueAccountId } from "../invoices/invoice-line-revenue-resolution.service.js";
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

function stopExtraDescription(input: {
  sequence_number: number | null;
  stop_type: string | null;
  rate_type: string | null;
  description: string | null;
}) {
  const stopLabel = input.sequence_number ? `Stop ${input.sequence_number}` : "Stop";
  const stopType = input.stop_type ? ` ${String(input.stop_type).toUpperCase()}` : "";
  const rateLabel = input.rate_type ? ` · ${String(input.rate_type).replace(/_/g, " ")}` : "";
  const detail = input.description ? ` · ${input.description}` : "";
  return `${stopLabel}${stopType}${rateLabel}${detail}`;
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
  const revenueResolution = await resolveInvoiceLineRevenueAccountId(input.operatingCompanyId, {
    line_type: "linehaul",
  });
  const lineRes = await client.query(
    `
      INSERT INTO accounting.invoice_lines (
        operating_company_id,
        invoice_id,
        source_load_id,
        line_type,
        revenue_code,
        account_id,
        description,
        quantity,
        unit_amount_cents,
        line_total_cents,
        display_order
      ) VALUES ($1,$2,$3,'linehaul',$4,$5,$6,1,$7,$7,0)
      RETURNING *
    `,
    [
      input.operatingCompanyId,
      invoice.id,
      input.loadId,
      revenueResolution.revenue_code,
      revenueResolution.account_id,
      `Linehaul · Load ${String(load.id)}`,
      lineTotal,
    ]
  );
  const line = lineRes.rows[0];

  const stopExtraRatesRes = await client
    .query<{
      uuid: string;
      rate_type: string | null;
      amount_cents: number | null;
      description: string | null;
      sequence_number: number | null;
      stop_type: string | null;
    }>(
      `
        SELECT
          ser.uuid,
          ser.rate_type,
          ser.amount_cents,
          ser.description,
          ls.sequence_number,
          ls.stop_type::text AS stop_type
        FROM dispatch.stop_extra_rates ser
        JOIN mdata.load_stops ls
          ON ls.id = ser.stop_uuid
        WHERE ser.operating_company_id = $1
          AND ser.load_uuid = $2
          AND ser.is_active = true
        ORDER BY ls.sequence_number ASC, ser.created_at ASC
      `,
      [input.operatingCompanyId, input.loadId]
    )
    .catch(() => ({ rows: [] }));

  if (stopExtraRatesRes.rows.length > 0) {
    const accessorialResolution = await resolveInvoiceLineRevenueAccountId(input.operatingCompanyId, {
      line_type: "accessorial",
    });
    for (let idx = 0; idx < stopExtraRatesRes.rows.length; idx += 1) {
      const rate = stopExtraRatesRes.rows[idx];
      const cents = Math.max(0, Number(rate.amount_cents ?? 0));
      const invoiceLineRes = await client.query<{ id: string }>(
        `
          INSERT INTO accounting.invoice_lines (
            operating_company_id,
            invoice_id,
            source_load_id,
            line_type,
            revenue_code,
            account_id,
            description,
            quantity,
            unit_amount_cents,
            line_total_cents,
            display_order
          ) VALUES ($1,$2,$3,'accessorial',$4,$5,$6,1,$7,$7,$8)
          RETURNING id
        `,
        [
          input.operatingCompanyId,
          invoice.id,
          input.loadId,
          accessorialResolution.revenue_code,
          accessorialResolution.account_id,
          stopExtraDescription({
            sequence_number: Number(rate.sequence_number ?? 0) || null,
            stop_type: rate.stop_type,
            rate_type: rate.rate_type,
            description: rate.description,
          }),
          cents,
          idx + 1,
        ]
      );
      const invoiceLineId = String(invoiceLineRes.rows[0]?.id ?? "");
      if (invoiceLineId) {
        await client.query(
          `
            UPDATE dispatch.stop_extra_rates
            SET invoice_line_uuid = $1,
                updated_at = now()
            WHERE uuid = $2
          `,
          [invoiceLineId, rate.uuid]
        );
      }
    }
  }

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

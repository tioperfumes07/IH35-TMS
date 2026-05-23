import type { OutboxEventHandler, OutboxHandlerContext, OutboxPayload } from "./registry.js";
import { buildQboInvoicePayload } from "../../integrations/qbo/translators/invoice.js";
import { deliverQboInvoicePush } from "../../qbo/push.service.js";
import type { QboInvoicePushPayload } from "../../qbo/push.service.js";

function requireUuid(value: unknown, field: string): string {
  const trimmed = String(value ?? "").trim();
  if (!/^[0-9a-fA-F-]{36}$/.test(trimmed)) throw new Error(`${field}_invalid_uuid`);
  return trimmed;
}

function requireOperation(value: unknown): "create" | "update" {
  const operation = String(value ?? "").trim();
  if (operation !== "create" && operation !== "update") throw new Error("operation_invalid");
  return operation;
}

type InvoiceRow = {
  invoice_id: string;
  operating_company_id: string;
  customer_id: string;
  display_id: string;
  issue_date: string;
  due_date: string;
  total_cents: number;
  internal_notes: string | null;
  customer_notes: string | null;
  ar_email_snapshot: string | null;
  qbo_invoice_id: string | null;
  qbo_sync_token: string | null;
  customer_qbo_id: string | null;
  customer_billing_state: string | null;
};

type InvoiceLineRow = {
  line_id: string;
  line_type: string;
  description: string;
  quantity: string;
  unit_amount_cents: number;
  line_total_cents: number;
  qbo_item_id: string | null;
  qbo_class_snapshot: string | null;
};

type MirrorRow = {
  mirror_row_id: string;
  qbo_id: string | null;
  qbo_sync_token: string | null;
};

function resolveTaxCodeRef(lineType: string, billingState: string | null) {
  const state = String(billingState ?? "").trim().toUpperCase();
  if (lineType === "linehaul" || lineType === "fsc") return "NON";
  if (state === "CA") return "TAX_CA";
  if (state === "TX") return "TAX_TX";
  if (lineType === "tax") return "TAX";
  return "NON";
}

async function resolveLineItemQboId(
  payload: { operating_company_id: string; description: string; qbo_item_id: string | null },
  ctx: OutboxHandlerContext,
) {
  const direct = payload.qbo_item_id ? payload.qbo_item_id.trim() : "";
  if (direct) return direct;

  const fallback = await ctx.client.query<{ qbo_id: string | null }>(
    `
      SELECT qbo_id
      FROM mdata.qbo_items
      WHERE operating_company_id = $1::uuid
        AND qbo_id IS NOT NULL
        AND lower(trim(name)) = lower(trim($2))
      ORDER BY mirrored_at DESC, updated_at DESC
      LIMIT 1
    `,
    [payload.operating_company_id, payload.description],
  );
  const qboId = fallback.rows[0]?.qbo_id ? String(fallback.rows[0].qbo_id).trim() : "";
  return qboId || null;
}

async function loadInvoice(
  payload: { operating_company_id: string; invoice_id: string },
  ctx: OutboxHandlerContext,
) {
  const invoiceRes = await ctx.client.query<InvoiceRow>(
    `
      SELECT
        i.id::text AS invoice_id,
        i.operating_company_id::text AS operating_company_id,
        i.customer_id::text AS customer_id,
        i.display_id,
        i.issue_date::text,
        i.due_date::text,
        i.total_cents::int,
        i.internal_notes,
        i.customer_notes,
        i.ar_email_snapshot,
        i.qbo_invoice_id,
        i.qbo_sync_token,
        c.qbo_customer_id AS customer_qbo_id,
        c.billing_state AS customer_billing_state
      FROM accounting.invoices i
      JOIN mdata.customers c ON c.id = i.customer_id
      WHERE i.id = $1::uuid
        AND i.operating_company_id = $2::uuid
      LIMIT 1
    `,
    [payload.invoice_id, payload.operating_company_id],
  );
  const invoice = invoiceRes.rows[0] ?? null;
  if (!invoice) throw new Error("tms_invoice_missing");
  if (!invoice.customer_qbo_id || !String(invoice.customer_qbo_id).trim()) {
    throw new Error("invoice_customer_missing_qbo_id");
  }

  const linesRes = await ctx.client.query<InvoiceLineRow>(
    `
      SELECT
        l.id::text AS line_id,
        l.line_type,
        l.description,
        l.quantity::text,
        l.unit_amount_cents::int,
        l.line_total_cents::int,
        l.qbo_item_id,
        l.qbo_class_snapshot
      FROM accounting.invoice_lines l
      WHERE l.invoice_id = $1::uuid
        AND l.operating_company_id = $2::uuid
      ORDER BY l.display_order ASC, l.created_at ASC
    `,
    [payload.invoice_id, payload.operating_company_id],
  );
  if (linesRes.rows.length === 0) throw new Error("invoice_lines_missing");

  return { invoice, lines: linesRes.rows };
}

async function upsertInvoiceMirror(
  payload: { operating_company_id: string; invoice_id: string; operation: "create" | "update" },
  data: { invoice: InvoiceRow; lineCount: number },
  ctx: OutboxHandlerContext,
) {
  const existing = await ctx.client.query<MirrorRow>(
    `
      SELECT id::text AS mirror_row_id, qbo_id, qbo_sync_token
      FROM mdata.qbo_invoices
      WHERE operating_company_id = $1::uuid
        AND invoice_id = $2::uuid
      LIMIT 1
    `,
    [payload.operating_company_id, payload.invoice_id],
  );
  const payloadJson = {
    source: "accounting.invoices",
    invoice_id: data.invoice.invoice_id,
    customer_id: data.invoice.customer_id,
    customer_qbo_id: data.invoice.customer_qbo_id,
    line_count: data.lineCount,
  };

  if (existing.rows[0]) {
    const updated = await ctx.client.query<{ id: string }>(
      `
        UPDATE mdata.qbo_invoices
        SET doc_number = $3,
            txn_date = $4::date,
            due_date = $5::date,
            total_cents = $6::bigint,
            sync_status = 'pending',
            payload_json = COALESCE(payload_json, '{}'::jsonb) || $7::jsonb,
            updated_at = now()
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid
        RETURNING id::text
      `,
      [
        existing.rows[0].mirror_row_id,
        payload.operating_company_id,
        data.invoice.display_id,
        data.invoice.issue_date,
        data.invoice.due_date,
        data.invoice.total_cents,
        JSON.stringify(payloadJson),
      ],
    );
    const mirrorRowId = updated.rows[0]?.id;
    if (!mirrorRowId) throw new Error("qbo_invoice_mirror_update_failed");
    return {
      mirror_row_id: mirrorRowId,
      qbo_id: existing.rows[0].qbo_id,
      qbo_sync_token: existing.rows[0].qbo_sync_token,
      operation: payload.operation === "create" && existing.rows[0].qbo_id ? "update" : payload.operation,
    };
  }

  const inserted = await ctx.client.query<{ id: string }>(
    `
      INSERT INTO mdata.qbo_invoices (
        operating_company_id,
        invoice_id,
        qbo_id,
        qbo_sync_token,
        doc_number,
        txn_date,
        due_date,
        total_cents,
        sync_status,
        payload_json,
        created_in_tms
      )
      VALUES ($1::uuid, $2::uuid, NULL, NULL, $3, $4::date, $5::date, $6::bigint, 'pending', $7::jsonb, true)
      RETURNING id::text
    `,
    [
      payload.operating_company_id,
      payload.invoice_id,
      data.invoice.display_id,
      data.invoice.issue_date,
      data.invoice.due_date,
      data.invoice.total_cents,
      JSON.stringify(payloadJson),
    ],
  );
  const mirrorRowId = inserted.rows[0]?.id;
  if (!mirrorRowId) throw new Error("qbo_invoice_mirror_insert_failed");
  return { mirror_row_id: mirrorRowId, qbo_id: null, qbo_sync_token: null, operation: "create" as const };
}

async function syncInvoiceBackLink(
  payload: { operating_company_id: string; invoice_id: string; mirror_row_id: string },
  ctx: OutboxHandlerContext,
) {
  const mirrorRes = await ctx.client.query<{ qbo_id: string | null; qbo_sync_token: string | null }>(
    `
      SELECT qbo_id, qbo_sync_token
      FROM mdata.qbo_invoices
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
      LIMIT 1
    `,
    [payload.mirror_row_id, payload.operating_company_id],
  );
  const qboId = mirrorRes.rows[0]?.qbo_id ? String(mirrorRes.rows[0].qbo_id).trim() : "";
  const syncToken = mirrorRes.rows[0]?.qbo_sync_token ? String(mirrorRes.rows[0].qbo_sync_token).trim() : "";
  if (!qboId) return null;

  await ctx.client.query(
    `
      UPDATE accounting.invoices
      SET qbo_invoice_id = $3,
          qbo_sync_token = CASE WHEN $4 = '' THEN qbo_sync_token ELSE $4 END,
          qbo_sync_pending = false,
          last_qbo_synced_at = now(),
          updated_at = now()
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
    `,
    [payload.invoice_id, payload.operating_company_id, qboId, syncToken],
  );
  return { qbo_id: qboId, qbo_sync_token: syncToken || null };
}

export class TmsInvoicePushHandler implements OutboxEventHandler {
  eventType = "tms.invoice.push_requested" as const;

  canHandle() {
    return (process.env.TMS_INVOICE_PUSH_HANDLER_ENABLED ?? "true").trim() !== "false";
  }

  async deliver(payload: OutboxPayload, ctx: OutboxHandlerContext) {
    const operating_company_id = requireUuid(payload.operating_company_id, "operating_company_id");
    const invoice_id = requireUuid(payload.invoice_id, "invoice_id");
    const operationHint = requireOperation(payload.operation);

    await ctx.client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    await ctx.client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operating_company_id]);

    const { invoice, lines } = await loadInvoice({ operating_company_id, invoice_id }, ctx);
    const mirror = await upsertInvoiceMirror(
      { operating_company_id, invoice_id, operation: operationHint },
      { invoice, lineCount: lines.length },
      ctx,
    );

    const mappedLines = [];
    for (const line of lines) {
      const qboItemId = await resolveLineItemQboId(
        { operating_company_id, description: line.description, qbo_item_id: line.qbo_item_id },
        ctx,
      );
      if (!qboItemId) throw new Error(`invoice_line_missing_qbo_item_id:${line.line_id}`);

      mappedLines.push({
        amountCents: line.line_total_cents,
        quantity: Number(line.quantity || "1"),
        unitPriceCents: line.unit_amount_cents,
        itemQboId: qboItemId,
        description: line.description,
        classQboId: line.qbo_class_snapshot ? String(line.qbo_class_snapshot).trim() : undefined,
        taxCodeQboId: resolveTaxCodeRef(line.line_type, invoice.customer_billing_state),
      });
    }

    const qboBody = buildQboInvoicePayload({
      header: {
        display_id: invoice.display_id,
        issue_date: invoice.issue_date,
        due_date: invoice.due_date,
        internal_notes: invoice.internal_notes,
        customer_facing_memo: invoice.customer_notes,
        total_cents: invoice.total_cents,
        qbo_invoice_id: mirror.qbo_id ?? invoice.qbo_invoice_id,
        qbo_sync_token: mirror.qbo_sync_token ?? invoice.qbo_sync_token,
      },
      customerQboId: String(invoice.customer_qbo_id),
      billEmail: invoice.ar_email_snapshot,
      lines: mappedLines,
    });

    const effectiveOperation: "create" | "update" =
      operationHint === "create" ? (mirror.qbo_id ? "update" : "create") : "update";
    const pushPayload: QboInvoicePushPayload = {
      operating_company_id,
      mirror_row_id: mirror.mirror_row_id,
      operation: effectiveOperation,
      qbo_body: qboBody,
    };

    const pushed = await deliverQboInvoicePush(pushPayload, ctx);
    const linked = await syncInvoiceBackLink({ operating_company_id, invoice_id, mirror_row_id: mirror.mirror_row_id }, ctx);

    await ctx.client.query(`SELECT audit.append_event($1, $2, $3::jsonb, NULL, $4)`, [
      "qbo_invoice_pushed",
      "info",
      JSON.stringify({
        operating_company_id,
        invoice_id,
        qbo_id: linked?.qbo_id ?? pushed.qbo_id ?? null,
        operation: effectiveOperation,
        line_count: mappedLines.length,
      }),
      "T11.20.6.2-CUT5-INVOICES",
    ]);

    return { message: pushed.message ?? `tms_invoice_push_${effectiveOperation}` };
  }
}

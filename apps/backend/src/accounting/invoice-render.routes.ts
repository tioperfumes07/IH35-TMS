import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "../accounting/shared.js";
import { enrichInvoice } from "../accounting/invoices.routes.js";
import { docIdFromLoadNumber, escapeHtml, formatDateTime, formatMoney, joinBrandAddrLines, wrapPdfDocument } from "../render/pdf-template.js";
import {
  formatInvoiceIssuedLines,
  renderInvoiceBody,
  type InvoiceAdjustmentRow,
  type InvoiceHtmlModel,
  type InvoiceLineRender,
} from "../render/invoice.template.js";

const paramsSchema = z.object({ invoiceId: z.string().uuid() });

function canViewInvoiceHtml(role: string) {
  return ["Owner", "Administrator", "Accountant"].includes(role);
}

function stackedBlock(primary: string, subs: string[]) {
  const subHtml = subs.map((line) => `<div class="sub">${escapeHtml(line)}</div>`).join("");
  return `<div class="val">${escapeHtml(primary)}</div>${subHtml}`;
}

function stopRef(stopType: string, seq: number) {
  const prefix = stopType === "delivery" ? "DEL" : stopType === "pickup" ? "PU" : "ST";
  return `${prefix}-${String(seq).padStart(6, "0")}`;
}

async function enqueueInvoiceHtmlOutbox(client: { query: (sql: string, values?: unknown[]) => Promise<unknown> }, payload: Record<string, unknown>) {
  await client.query(`INSERT INTO outbox.events (event_type, payload, next_retry_at) VALUES ($1, $2::jsonb, now())`, [
    "accounting.invoice.html_requested",
    JSON.stringify(payload),
  ]);
}

export async function registerAccountingInvoiceHtmlRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/invoices/:invoiceId.html", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canViewInvoiceHtml(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const params = paramsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const payload = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const enriched = await enrichInvoice(client, params.data.invoiceId);
      if (!enriched) return { kind: "not_found" as const };
      const invoice = enriched as Record<string, unknown>;

      const loadId = (invoice.source_load_id as string | null | undefined) ?? null;
      let load: Record<string, unknown> | null = null;
      let pickupStop: Record<string, unknown> | null = null;
      let deliveryStop: Record<string, unknown> | null = null;

      if (loadId) {
        const loadRes = await client.query(`SELECT * FROM mdata.loads WHERE id = $1 LIMIT 1`, [loadId]);
        load = loadRes.rows[0] ?? null;
        const stopsRes = await client.query(
          `SELECT * FROM mdata.load_stops WHERE load_id = $1 ORDER BY sequence_number ASC`,
          [loadId]
        );
        pickupStop = stopsRes.rows.find((row: Record<string, unknown>) => String(row.stop_type) === "pickup") ?? stopsRes.rows[0] ?? null;
        deliveryStop =
          [...stopsRes.rows].reverse().find((row: Record<string, unknown>) => String(row.stop_type) === "delivery") ??
          stopsRes.rows[stopsRes.rows.length - 1] ??
          null;
      }

      const customerRes = await client.query(`SELECT * FROM mdata.customers WHERE id = $1 LIMIT 1`, [invoice.customer_id]);
      const customer = customerRes.rows[0] ?? {};

      const companyRes = await client.query(
        `SELECT legal_name, short_name, tax_id, phone, email, address_line1, city, state, postal_code FROM org.companies WHERE id = $1 LIMIT 1`,
        [query.data.operating_company_id]
      );
      const company = companyRes.rows[0] ?? {};

      let factorName: string | null = null;
      let advancePct: number | null = null;
      let reservePct: number | null = null;
      if (invoice.factoring_advance_id) {
        const factorRes = await client.query(
          `
            SELECT fa.advance_rate_pct, fa.reserve_pct, v.vendor_name
            FROM accounting.factoring_advances fa
            JOIN mdata.vendors v ON v.id = fa.factoring_company_vendor_id
            WHERE fa.id = $1
            LIMIT 1
          `,
          [invoice.factoring_advance_id]
        );
        const factorRow = factorRes.rows[0];
        if (factorRow) {
          factorName = factorRow.vendor_name ? String(factorRow.vendor_name) : null;
          advancePct = factorRow.advance_rate_pct != null ? Number(factorRow.advance_rate_pct) : null;
          reservePct = factorRow.reserve_pct != null ? Number(factorRow.reserve_pct) : null;
        }
      }

      const linesRaw = (invoice.lines as Array<Record<string, unknown>> | undefined) ?? [];
      const filteredLines = linesRaw.filter((line) => String(line.line_type ?? "") !== "tax");

      const renderedLines: InvoiceLineRender[] = filteredLines.map((line) => {
        const qty = Number(line.quantity ?? 1);
        const unitCents = Number(line.unit_amount_cents ?? 0);
        const totalCents = Number(line.line_total_cents ?? 0);
        const lineType = String(line.line_type ?? "");
        const basis = lineType === "linehaul" ? `${qty.toLocaleString("en-US", { maximumFractionDigits: 2 })} mi` : "—";
        const rate =
          lineType === "fsc"
            ? `${unitCents === 0 ? "—" : `${(unitCents / 100).toFixed(1)}%`}`
            : lineType === "linehaul"
              ? `${formatMoney(unitCents)} / mi`
              : `${formatMoney(unitCents)}`;
        return {
          description: String(line.description ?? "Line item"),
          basis,
          rate,
          amountCents: totalCents,
        };
      });

      renderedLines.push({
        description: "Subtotal",
        basis: "",
        rate: "",
        amountCents: Number(invoice.subtotal_cents ?? 0),
        isSubtotal: true,
      });

      const taxCents = Number(invoice.tax_cents ?? 0);
      const invoiceTotalCents = Number(invoice.total_cents ?? 0);

      const loadNumber = load?.load_number ? String(load.load_number) : null;
      const loadDocNum = docIdFromLoadNumber("L", loadNumber) ?? "—";
      const invoiceDocNum = docIdFromLoadNumber("I", loadNumber) ?? String(invoice.display_id ?? "").replace(/^INV-/, "I-");

      const brandName = String(company.legal_name ?? company.short_name ?? "Carrier");
      const brandSub = company.tax_id ? `EIN ${String(company.tax_id)}` : "Motor carrier";
      const brandAddrLines = [
        [company.address_line1, company.city, company.state, company.postal_code].filter(Boolean).join(", "),
        [company.phone ? String(company.phone) : null, company.email ? String(company.email) : null].filter(Boolean).join(" · "),
      ];

      const paymentTermsLabel = String(invoice.payment_terms_label ?? `Net ${invoice.payment_terms_days ?? "30"}`);

      const billToSectionTitle = invoice.factoring_advance_id ? "Bill to · pay via factor" : "Bill to · pay direct";

      const customerSubs: string[] = [];
      if (customer.mc_number) customerSubs.push(`MC-${String(customer.mc_number)}`);
      if (customer.dot_number) customerSubs.push(`DOT ${String(customer.dot_number)}`);
      customerSubs.push(paymentTermsLabel);
      const addrLine = [customer.billing_address_line1 ?? customer.address_line1, customer.billing_city ?? customer.city, customer.billing_state ?? customer.state, customer.billing_postal_code ?? customer.postal_code]
        .filter(Boolean)
        .join(", ");
      if (addrLine) customerSubs.push(addrLine);
      const contactLine = [customer.ar_email ?? customer.accounts_payable_email, customer.ar_phone ?? customer.accounts_payable_phone]
        .filter(Boolean)
        .join(" · ");
      if (contactLine) customerSubs.push(contactLine);

      const billToInnerHtml = stackedBlock(String(customer.customer_name ?? invoice.customer_name ?? "Customer"), customerSubs);

      let remitLabel = "Remit to (carrier)";
      let remitInnerHtml = stackedBlock(brandName, [
        [company.address_line1, company.city, company.state, company.postal_code].filter(Boolean).join(", "),
        company.phone ? String(company.phone) : "",
        company.email ? String(company.email) : "",
      ].filter(Boolean));

      if (invoice.factoring_advance_id && factorName) {
        remitLabel = "Remit to (factor — auto-routed)";
        const pctLine =
          advancePct != null && reservePct != null
            ? `Advances ${advancePct.toFixed(0)}% · reserves ${reservePct.toFixed(0)}%`
            : "Factored invoice — follow factor remittance instructions";
        remitInnerHtml = stackedBlock(factorName, [pctLine, "Lockbox / ACH per factor agreement"]);
      }

      const pickupRef = pickupStop ? stopRef(String(pickupStop.stop_type ?? "pickup"), Number(pickupStop.sequence_number ?? 1)) : "PU-000000";
      const podRef = deliveryStop ? stopRef(String(deliveryStop.stop_type ?? "delivery"), Number(deliveryStop.sequence_number ?? 2)) : "DEL-000000";

      const pickupPrimary = pickupStop
        ? `${String(pickupStop.address_line1 ?? "Pickup")} · ${[pickupStop.city, pickupStop.state].filter(Boolean).join(" ")}`
        : "Pickup on file";
      const pickupSecondary = pickupStop?.scheduled_arrival_at ? `${formatDateTime(String(pickupStop.scheduled_arrival_at))}` : "Appointment details on file";

      const deliveryPrimary = deliveryStop
        ? `${String(deliveryStop.address_line1 ?? "Delivery")} · ${[deliveryStop.city, deliveryStop.state].filter(Boolean).join(" ")}`
        : "Delivery on file";
      const deliverySecondary = deliveryStop?.scheduled_arrival_at ? `${formatDateTime(String(deliveryStop.scheduled_arrival_at))}` : "Appointment details on file";

      const detentionLine = linesRaw.find((line) => String(line.line_type) === "detention");
      const detentionHours = detentionLine ? Number(detentionLine.quantity ?? 0) : 0;
      const detentionCents = detentionLine ? Number(detentionLine.line_total_cents ?? 0) : 0;

      const adjustmentsIntro =
        "Dispatcher booking flags are shown for audit completeness. Compare booking assumptions to billed lines before approving.";
      const adjustments: InvoiceAdjustmentRow[] = [
        {
          flag: "Anticipated chargeback",
          booking: load?.customer_chargeback_requested ? "Flagged" : formatMoney(0),
          actual: load?.customer_chargeback_requested ? String(load.customer_chargeback_reason ?? "See notes") : formatMoney(0),
          net: formatMoney(0),
        },
        {
          flag: "Detention (expected)",
          booking: "No",
          actual: detentionHours > 0 ? `${detentionHours} hr · ${formatMoney(detentionCents)}` : "0 hr · no detention",
          net: detentionHours > 0 ? formatMoney(detentionCents) : "—",
        },
        {
          flag: "Late delivery risk",
          booking: "No",
          actual: String(load?.status ?? "").includes("delivered") ? "Delivered" : "In progress",
          net: "—",
        },
      ];

      const referenceTrip = [invoiceDocNum, loadDocNum, String(load?.customer_wo_number ?? load?.live_load_number ?? "WO")].join(" / ");

      const paymentInstructionsHtml = invoice.factoring_advance_id
        ? `<strong>Wire / ACH to ${escapeHtml(factorName ?? "factor lockbox")}.</strong> Reference: <span class="mono">${escapeHtml(referenceTrip)}</span>.<br/>
           <strong>Mailed check:</strong> payable to ${escapeHtml(factorName ?? "factor lockbox")}. Do NOT remit direct to ${escapeHtml(brandName)} when factored.`
        : `<strong>ACH / wire to ${escapeHtml(brandName)}.</strong> Reference: <span class="mono">${escapeHtml(invoiceDocNum)}</span>.`;

      const model: InvoiceHtmlModel = {
        brandName,
        brandSub,
        brandAddrHtml: joinBrandAddrLines(brandAddrLines),
        invoiceDocNum,
        issuedLines: formatInvoiceIssuedLines(String(invoice.issue_date), String(invoice.due_date), paymentTermsLabel),
        statusLine: `Status · ${String(invoice.status ?? "draft")}`,
        billToSectionTitle,
        billToInnerHtml,
        remitLabel,
        remitInnerHtml,
        loadDocNum,
        customerWo: String(load?.customer_wo_number ?? load?.live_load_number ?? "—"),
        pickupRef,
        podRef,
        pickupPrimary,
        pickupSecondary,
        deliveryPrimary,
        deliverySecondary,
        commodity: String(load?.commodity_description ?? load?.commodity ?? "Freight"),
        weight: load?.weight_lbs != null ? `${Number(load.weight_lbs).toLocaleString("en-US")} lbs` : "—",
        pieces: load?.pallet_count != null ? `${Number(load.pallet_count)} pallets` : "—",
        equipment: load?.requires_tarps ? `Tarped (${String(load.tarp_type ?? "tarps")})` : "Standard equipment",
        lines: renderedLines,
        invoiceTotalCents,
        taxCents,
        adjustmentsIntro,
        adjustments,
        totalDuePrimary: invoice.factoring_advance_id ? `Pay to ${factorName ?? "factor"} lockbox` : `Pay to ${brandName}`,
        totalDueSecondary: `${paymentTermsLabel} · invoice ${invoiceDocNum}`,
        paymentInstructionsHtml,
        disputesFooter: `Email ${String(company.email ?? "billing@carrier.local")} within 15 days with WO # and disputed line item.`,
        latePayFooter: "Late fees may apply after Net terms. Factoring agreements supersede when applicable.",
      };

      await appendCrudAudit(
        client,
        user.uuid,
        "accounting.invoice.html_viewed",
        {
          operating_company_id: query.data.operating_company_id,
          invoice_id: params.data.invoiceId,
          invoice_display_id: invoice.display_id ?? null,
        },
        "info",
        "P6-T11171-PDF-RENDER"
      );

      await enqueueInvoiceHtmlOutbox(client, {
        operating_company_id: query.data.operating_company_id,
        invoice_id: params.data.invoiceId,
        invoice_display_id: invoice.display_id ?? null,
        requested_by_user_id: user.uuid,
      });

      const body = renderInvoiceBody(model);
      return { kind: "ok" as const, body, title: `${invoiceDocNum} · Customer invoice` };
    });

    if (!payload || payload.kind === "not_found") return reply.code(404).send({ error: "invoice_not_found" });

    reply.header("Content-Type", "text/html; charset=utf-8");
    reply.header("Cache-Control", "private, no-store");
    return reply.send(wrapPdfDocument({ title: payload.title, body: payload.body }));
  });
}

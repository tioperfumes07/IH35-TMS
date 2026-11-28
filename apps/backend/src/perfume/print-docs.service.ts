/**
 * PERFUME M22 (LEAD ROUND L.32): the packing slip and the invoice printed and e-mailed from the sales order, server-rendered like the
 * count sheet (inventory.service countSheetBody → wrapPdfDocument). The packing slip carries no prices (it travels in the box). The
 * invoice is the books' own invoice document (GET /api/v1/accounting/invoices/:id.html — one renderer, never a copy). E-mail goes
 * through the desk's own sender (mail/send.ts: jpm@tioperfumes.com only, one email per address, the daily cap, opt-outs skipped),
 * with the document attached as a PDF; the order's history records who it went to.
 */
import type pg from "pg";
import { z } from "zod";
import { escapeHtml, formatDate, wrapPdfDocument } from "../render/pdf-template.js";
import { getOrder } from "./orders.service.js";
import { scopeToScentsx } from "../scentsx/links.service.js";

export async function packingSlipBody(c: pg.PoolClient, orderId: string): Promise<{ title: string; body: string }> {
  const o = await getOrder(c, orderId);
  const shipped = o.lines.filter((l) => l.qty_shipped > 0);
  const lines = shipped.length ? shipped : o.lines;
  const rows = lines.map((l, i) =>
    `<tr><td>${i + 1}</td><td>${escapeHtml(l.upc ?? "")}</td><td>${escapeHtml(l.description)}</td><td style="text-align:right">${l.qty.toLocaleString("en-US")}</td>` +
    `<td style="text-align:right">${l.qty_shipped.toLocaleString("en-US")}</td><td style="text-align:right">${(l.qty - l.qty_shipped).toLocaleString("en-US")}</td></tr>`).join("");
  const units = lines.reduce((s, l) => s + l.qty_shipped, 0);
  const title = `Packing slip ${o.number}`;
  const ship = [o.ship_to ? escapeHtml(o.ship_to).replace(/\n/g, "<br>") : null].filter(Boolean).join("");
  const body = `<h1>TIO Perfumes · ${escapeHtml(title)}</h1>
<p>ScentsX LLC dba TIO Perfumes · Laredo, Texas</p>
<table><tbody>
<tr><td><b>Ship to</b></td><td>${escapeHtml(o.customer_name)}${ship ? `<br>${ship}` : ""}</td><td><b>Order</b></td><td>${escapeHtml(o.number)} · ${escapeHtml(formatDate(o.order_date))}</td></tr>
<tr><td><b>Ship via</b></td><td>${escapeHtml(String(o.shipping_method ?? "—"))}</td><td><b>Ships from</b></td><td>${escapeHtml(String(o.location_code ?? "—"))}</td></tr>
</tbody></table>
<table><thead><tr><th>#</th><th>UPC</th><th>Item</th><th>Ordered</th><th>Shipped</th><th>Back order</th></tr></thead><tbody>${rows}</tbody></table>
<p><b>${units.toLocaleString("en-US")} units shipped</b> · ${lines.length} line${lines.length === 1 ? "" : "s"}</p>
<p>Received by: ______________________________ &nbsp; Date: ______________ &nbsp; Cartons: ________</p>`;
  return { title, body };
}

export const packingSlipHtml = async (c: pg.PoolClient, orderId: string) => wrapPdfDocument(await packingSlipBody(c, orderId));

/** HTML → PDF (the same headless Chrome the quote / order PDFs use). */
export async function htmlToPdf(html: string): Promise<Buffer> {
  const { default: puppeteer } = await import("puppeteer");
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    return Buffer.from(await page.pdf({ format: "Letter", printBackground: true }));
  } finally { await browser.close(); }
}

export const emailDocSchema = z.object({
  doc: z.enum(["packing_slip", "invoice"]),
  /** For doc = invoice: one of the ScentsX invoices made from this order. */
  invoice_id: z.string().uuid().optional(),
  to: z.string().trim().min(3).max(4000),
  subject: z.string().trim().min(1).max(300).optional(),
  message: z.string().trim().max(5000).optional(),
});

/** The ScentsX invoices made from this order (scentsx.document_links), newest first. */
export async function orderInvoices(c: pg.PoolClient, orderId: string) {
  await scopeToScentsx(c);
  return (await c.query<{ id: string; display_id: string | null; status: string; total_cents: string | null; issue_date: string }>(
    `SELECT i.id::text, i.display_id, i.status, i.total_cents::text, i.issue_date::text
       FROM scentsx.document_links d JOIN accounting.invoices i ON i.id = d.invoice_id
      WHERE d.sales_order_id = $1::uuid AND i.voided_at IS NULL ORDER BY i.issue_date DESC, i.created_at DESC`, [orderId])).rows;
}

/** The order's history row for a printed / e-mailed document (append-only sales_order_events; kind exported_pdf). */
export async function recordDocSent(c: pg.PoolClient, orderId: string, uid: string, detail: Record<string, unknown>) {
  await c.query(`INSERT INTO perfume.sales_order_events (order_id, kind, detail, created_by, created_at) VALUES ($1, 'exported_pdf', $2::jsonb, $3, clock_timestamp())`,
    [orderId, JSON.stringify(detail), uid]);
}

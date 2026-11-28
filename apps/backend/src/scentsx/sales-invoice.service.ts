/**
 * SCENTSX B3c — invoice a shipped TIO Perfumes sales order in ScentsX LLC's books.
 *
 * Owner 2026-11-26 21:37 CT "just create the engines and complete. Fully linked and wired." Design
 * https://claude.ai/artifact/VQ83ogvJyPpVoop1FNKJXC (posting map: "Invoice for the shipment").
 *
 * WRITES ZERO NEW GL MATH and no new invoice writer: the invoice is created by createExpandedInvoice and each line by
 * createInvoiceLineInClientTx (the one invoice-line writer). The invoice is a DRAFT; it posts to A/R and revenue when it is
 * finalized on the Invoices page, through the existing invoice GL path. Billed = shipped units not yet on a live invoice
 * (scentsx.sales_order_invoice_lines), so a partial shipment is billed exactly once.
 * Sales tax is NOT guessed: a Texas buyer that keeps the goods owes it unless it gave a resale certificate or the goods were
 * exported with proof (design §8) — the draft says so and the tax line is added on the Invoices page.
 */
import type pg from "pg";
import { createExpandedInvoice } from "../accounting/invoices.service.js";
import { createInvoiceLineInClientTx } from "../accounting/invoice-line-create.js";
import { companyBusinessDate } from "../lib/company-business-date.js";
import { dueFromPickedTerms } from "../perfume/doc-catalogs.service.js";
import { scopeToScentsx, ScentsxLinkInvalid, ScentsxLinkNotFound } from "./links.service.js";
import { assertNotSanctionsBlocked, hasExportProof, hasResaleCertificate } from "./sanctions.service.js";

type Q = Pick<pg.PoolClient, "query">;
export type SalesChannel = "wholesale" | "retail" | "export";
const REVENUE_ACCOUNT: Record<SalesChannel, string> = { wholesale: "4000", retail: "4010", export: "4020" };

export type BillableLine = { so_line_id: string; line_no: number; description: string; upc: string | null; shipped: number; billed: number; to_bill: number; unit_price_cents: number;
  hs_code?: string | null; origin_country?: string | null;
  /** The ScentsX Products & Services item of the line's perfume item (scentsx.item_links), so the invoice line names the product. */
  product_id?: string | null; product_income_account_id?: string | null };

/** Every line of the order with shipped units, units already on a live (non-void) ScentsX invoice, and what is left to bill. */
export async function billableLines(c: Q, salesOrderId: string): Promise<BillableLine[]> {
  await scopeToScentsx(c);
  const r = await c.query<{ so_line_id: string; line_no: number; description: string; upc: string | null; shipped: number; billed: number; unit_price_cents: string;
    hs_code: string | null; origin_country: string | null; product_id: string | null; product_income_account_id: string | null }>(
    `SELECT l.id::text AS so_line_id, l.line_no, l.description, l.upc, l.qty_shipped AS shipped,
            (SELECT k.catalog_item_id::text FROM scentsx.item_links k WHERE k.perfume_item_id = l.item_id AND k.voided_at IS NULL LIMIT 1) AS product_id,
            (SELECT ci.default_income_account_id::text FROM scentsx.item_links k JOIN catalogs.items ci ON ci.id = k.catalog_item_id
              WHERE k.perfume_item_id = l.item_id AND k.voided_at IS NULL LIMIT 1) AS product_income_account_id,
            (SELECT i.hs_code FROM perfume.items i WHERE i.id = l.item_id) AS hs_code, (SELECT i.origin_country FROM perfume.items i WHERE i.id = l.item_id) AS origin_country,
            coalesce((SELECT sum(x.qty) FROM scentsx.sales_order_invoice_lines x JOIN accounting.invoices i ON i.id = x.invoice_id
                       WHERE x.so_line_id = l.id AND i.voided_at IS NULL AND coalesce(i.status, '') <> 'void'), 0)::int AS billed,
            l.unit_price_cents::text
       FROM perfume.sales_order_lines l
      WHERE l.order_id = $1::uuid AND l.archived_at IS NULL
      ORDER BY l.line_no`,
    [salesOrderId]
  );
  return r.rows.map((x) => ({ ...x, unit_price_cents: Number(x.unit_price_cents), to_bill: Math.max(0, x.shipped - x.billed) }));
}

export async function invoiceSalesOrder(c: Q, uid: string, salesOrderId: string, channel: SalesChannel = "wholesale") {
  const co = await scopeToScentsx(c);
  const so = await c.query<{ id: string; number: string; company_id: string | null; customer_name: string; currency: string; payment_terms_id: string | null;
    terms: string | null; tax_code: string | null }>(
    `SELECT id::text, number, company_id::text, customer_name, currency, payment_terms_id::text, terms,
            (SELECT t.display_name FROM catalogs.tax_codes t WHERE t.id = tax_code_id) AS tax_code FROM perfume.sales_orders WHERE id = $1::uuid AND archived_at IS NULL`,
    [salesOrderId]
  );
  const order = so.rows[0];
  if (!order) throw new ScentsxLinkNotFound();
  if (order.currency !== "USD") throw new ScentsxLinkInvalid(`sales order ${order.number} is in ${order.currency}; ScentsX invoices are in USD`);
  if (!order.company_id) throw new ScentsxLinkInvalid(`sales order ${order.number} names no contact company — link it to a lead first`);
  const link = await c.query<{ customer_id: string }>(
    `SELECT customer_id::text FROM scentsx.customer_links WHERE contact_company_id = $1::uuid AND voided_at IS NULL LIMIT 1`,
    [order.company_id]
  );
  const customerId = link.rows[0]?.customer_id;
  if (!customerId) throw new ScentsxLinkInvalid(`${order.customer_name} is not a ScentsX customer yet — use "Make ScentsX customer" on its profile`);
  // OFAC (design §8): no sale to a party that is not screened against the newest list, or is an uncleared possible match.
  await assertNotSanctionsBlocked(c, { kind: "customer", id: customerId }, `${order.customer_name} cannot be invoiced`);
  // Texas: an export is tax-free only with proof the goods left the US — the export channel is refused without it.
  if (channel === "export" && !(await hasExportProof(c, salesOrderId))) {
    throw new ScentsxLinkInvalid(`sales order ${order.number} has no export proof (customs broker certification, the foreign import papers or a bill of lading to a point outside the US) — attach it before invoicing it as an export`);
  }
  const resale = await hasResaleCertificate(c, order.company_id);
  const lines = (await billableLines(c, salesOrderId)).filter((l) => l.to_bill > 0);
  if (!lines.length) throw new ScentsxLinkInvalid(`nothing shipped on ${order.number} is left to invoice`);
  const acct = await c.query<{ id: string }>(
    `SELECT id::text FROM catalogs.accounts WHERE operating_company_id = $1::uuid AND account_number = $2 AND deactivated_at IS NULL AND is_postable LIMIT 1`,
    [co, REVENUE_ACCOUNT[channel]]
  );
  const revenueAccountId = acct.rows[0]?.id;
  if (!revenueAccountId) throw new ScentsxLinkInvalid(`ScentsX revenue account ${REVENUE_ACCOUNT[channel]} is missing`);

  // M20: the order's picked terms set the due date (issue date + the terms' days); none picked → the customer's terms (engine default).
  const issueDate = companyBusinessDate();
  const dueDate = (await dueFromPickedTerms(c, order.payment_terms_id, issueDate)) ?? undefined;
  const pick = [order.terms ? `Terms ${order.terms}` : null, order.tax_code ? `Sales tax: ${order.tax_code}` : null].filter(Boolean).join(" · ");
  const inv = await createExpandedInvoice(c as never, {
    operatingCompanyId: co,
    userId: uid,
    issueDate,
    ...(dueDate ? { dueDate } : {}),
    invoiceType: "manual",
    customerId,
    billToEntityType: "customer",
    billToEntityId: customerId,
    internalNotes: (pick ? `${pick}. ` : "") + (channel === "export"
      ? `TIO Perfumes sales order ${order.number} (export). Export proof on file — no Texas sales tax.`
      : resale
        ? `TIO Perfumes sales order ${order.number} (${channel}). Resale certificate on file — no Texas sales tax.`
        : `TIO Perfumes sales order ${order.number} (${channel}). NO resale certificate on file: add Texas sales tax on the Invoices page before finalizing.`),
  });
  for (const l of lines) {
    const created = await createInvoiceLineInClientTx(c, {
      operatingCompanyId: co,
      invoiceId: inv.id,
      line_type: "other",
      // An export invoice carries each line's HS tariff code and country of origin (commercial invoice / pedimento), from the item.
      description: [l.description, l.upc ? `UPC ${l.upc}` : null,
        channel === "export" && l.hs_code ? `HS ${l.hs_code}` : null, channel === "export" && l.origin_country ? `Origin ${l.origin_country}` : null]
        .filter(Boolean).join(" · ").slice(0, 400),
      quantity: l.to_bill,
      unit_amount_cents: l.unit_price_cents,
      account_id: revenueAccountId,
      // The line names its ScentsX product (Sales by product / QuickBooks item); the channel's revenue account (retail 4010,
      // export 4020) can differ from the product's default income account (4000) — that is the channel rule, recorded as the reason.
      ...(l.product_id ? { item_id: l.product_id,
        ...(l.product_income_account_id && l.product_income_account_id !== revenueAccountId
          ? { item_account_override_reason: `TIO Perfumes ${channel} sale — revenue posts to the ${channel} sales account ${REVENUE_ACCOUNT[channel]}` } : {}) } : {}),
    }, uid);
    const line = (created as { ok: boolean; data?: { line?: { id: string } } }).data?.line;
    if (!line?.id) throw new Error(`invoice line not created for ${order.number} line ${l.line_no}: ${(created as { error?: string }).error ?? "unknown"}`);
    await c.query(
      `INSERT INTO scentsx.sales_order_invoice_lines (operating_company_id, so_line_id, invoice_id, invoice_line_id, qty, created_by)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6::uuid)`,
      [co, l.so_line_id, inv.id, line.id, l.to_bill, uid]
    );
  }
  await c.query(
    `INSERT INTO scentsx.document_links (operating_company_id, sales_order_id, invoice_id, created_by) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid)
     ON CONFLICT DO NOTHING`,
    [co, salesOrderId, inv.id, uid]
  );
  return { invoice_id: inv.id, display_id: inv.display_id, lines: lines.length, units: lines.reduce((s, l) => s + l.to_bill, 0) };
}

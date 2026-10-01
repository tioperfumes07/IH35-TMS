// ROUND 315 (FINAL) step 3 — "Save and send": after the owner posts a purchase, email it to the factor (Faro).
// Reuses what already exists, invents nothing:
//   - the invoice document = the app's own invoice print render (GET /api/v1/accounting/invoices/:id.html, injected on
//     the owner's own session so RLS, NOA and every render guard apply unchanged), combined into ONE PDF through the
//     shared htmlToPdfBuffer (scheduled-reports/report-file-builder.ts);
//   - each load's BOL / POD / rate confirmation = its docs.files objects (R2 getObjectBytes);
//   - delivery = the canonical email queue (enqueueEmail, template 'notification-dispatch'), one audit row.
// A purchase is sent only when EVERY line's load carries its BOL, POD and rate confirmation (409 with the per-load list).
// Nothing here touches the GL or the purchase row: sending is evidence of transmission, not an accounting event.
import type { FastifyInstance, FastifyRequest } from "fastify";
import { withCompanyScope } from "../accounting/shared.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { enqueueEmail } from "../email/queue.service.js";
import type { EmailAttachment } from "../email/provider.js";
import { htmlToPdfBuffer } from "../scheduled-reports/report-file-builder.js";
import { generatePresignedDownloadUrl, getObjectBytes, isR2Configured } from "../storage/r2-client.js";
import { buildSchedule, loadPurchaseSendPacket, PurchaseCandidateError, type SendPacketDoc } from "./purchase-candidates.service.js";

/** Raw attachment budget (base64 adds ~33%; mail providers cap a message near 25 MB). Over it, docs go as 7-day links. */
export const SEND_ATTACHMENT_BUDGET_BYTES = 15 * 1024 * 1024;
const LINK_TTL_SECONDS = 7 * 24 * 3600;

/** Merge several full invoice HTML documents into one printable document (one page break per invoice). */
export function combineInvoiceHtml(docs: string[]): string {
  const head = docs[0]?.match(/<head[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? "";
  const bodies = docs.map((d) => d.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? d);
  return `<!doctype html><html><head>${head}</head><body>${bodies
    .map((b, i) => `<div style="${i < bodies.length - 1 ? "page-break-after:always;break-after:page;" : ""}">${b}</div>`)
    .join("")}</body></html>`;
}

const safeName = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120);

export async function sendPurchaseToFactor(
  app: FastifyInstance,
  req: FastifyRequest,
  input: { operatingCompanyId: string; actorUserId: string; purchaseId: string; toEmail: string | null; docsOverrideReason?: string | null }
) {
  const oci = input.operatingCompanyId;
  const packet = await withCompanyScope(input.actorUserId, oci, (client) => loadPurchaseSendPacket(client, oci, input.purchaseId));
  const head = packet.head;
  // Missing BOL / POD / rate confirmation blocks the send unless the Owner approves an override with a reason (the route
  // already admits only the Owner). The approval is stamped on the purchase BEFORE anything is sent, and audited.
  const overrideReason = (input.docsOverrideReason ?? "").trim();
  if (packet.missing.length && overrideReason.length < 10) {
    throw new PurchaseCandidateError("factoring_send_missing_docs", 409, packet.missing);
  }
  if (packet.missing.length) {
    await withCompanyScope(input.actorUserId, oci, async (client) => {
      await client.query(
        `UPDATE accounting.factoring_purchases
            SET docs_override_at = now(), docs_override_by_user_id = $3::uuid, docs_override_reason = $4, updated_by_user_id = $3::uuid
          WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
        [input.purchaseId, oci, input.actorUserId, overrideReason]
      );
      await appendCrudAudit(client, input.actorUserId, "accounting.factoring_purchase_docs_override_approved", {
        resource_type: "accounting.factoring_purchases",
        resource_id: input.purchaseId,
        operating_company_id: oci,
        reason: overrideReason,
        missing: packet.missing,
      }, "warning", "ROUND-315-FACTORING-PURCHASE");
    });
  }
  const to = (input.toEmail ?? (head.vendor_email as string | null) ?? "").trim();
  if (!to) {
    throw new PurchaseCandidateError("factoring_send_no_recipient", 409, {
      vendor_name: head.vendor_name,
      message: "The factoring company vendor has no email on file; enter the factor's submission email to send.",
    });
  }
  if (!isR2Configured()) throw new PurchaseCandidateError("factoring_send_document_storage_unavailable", 503);

  // 1. Invoices — the app's own print render on the owner's session, merged into one PDF.
  const headers: Record<string, string> = {};
  if (req.headers.cookie) headers.cookie = String(req.headers.cookie);
  if (req.headers.authorization) headers.authorization = String(req.headers.authorization);
  const htmls: string[] = [];
  const renderFailures: Array<{ invoice_id: string; invoice_display_id: string | null; status: number }> = [];
  for (const line of packet.lines) {
    const res = await app.inject({
      method: "GET",
      url: `/api/v1/accounting/invoices/${line.invoice_id}.html?operating_company_id=${oci}`,
      headers,
    });
    if (res.statusCode !== 200) {
      renderFailures.push({ invoice_id: String(line.invoice_id), invoice_display_id: (line.invoice_display_id as string | null) ?? null, status: res.statusCode });
    } else htmls.push(res.body);
  }
  if (renderFailures.length) throw new PurchaseCandidateError("factoring_send_invoice_render_failed", 409, renderFailures);
  const invoicesPdf = await htmlToPdfBuffer(combineInvoiceHtml(htmls));

  // 2. Load documents, within the attachment budget; anything beyond goes as a 7-day download link.
  const attachments: EmailAttachment[] = [
    { filename: `${safeName(String(head.display_id))}-invoices.pdf`, contentBase64: invoicesPdf.toString("base64"), contentType: "application/pdf" },
  ];
  const { text, csv } = buildSchedule(head, packet.lines);
  attachments.push({ filename: `${safeName(String(head.display_id))}-schedule.csv`, contentBase64: Buffer.from(csv, "utf8").toString("base64"), contentType: "text/csv" });
  let used = invoicesPdf.length + csv.length;
  const linked: Array<{ doc: SendPacketDoc; url: string }> = [];
  for (const doc of packet.docs) {
    if (used + doc.size_bytes <= SEND_ATTACHMENT_BUDGET_BYTES) {
      const bytes = await getObjectBytes(doc.r2_key);
      used += bytes.length;
      attachments.push({
        filename: safeName(`Load-${doc.load_number ?? doc.load_id}-${doc.category_code}-${doc.filename}`),
        contentBase64: bytes.toString("base64"),
        contentType: doc.mime_type ?? "application/octet-stream",
      });
    } else {
      linked.push({ doc, url: (await generatePresignedDownloadUrl(doc.r2_key, LINK_TTL_SECONDS)).url });
    }
  }
  const bodyText = linked.length
    ? `${text}\n\nDocuments too large to attach (links valid 7 days):\n${linked.map((l) => `Load ${l.doc.load_number ?? l.doc.load_id} ${l.doc.category_code}: ${l.url}`).join("\n")}`
    : text;

  const subject = `Schedule of accounts ${head.display_id} — ${head.company_name ?? ""} — ${packet.lines.length} invoice(s)`;
  const { queueId } = await enqueueEmail({
    operatingCompanyId: oci,
    toAddresses: [to],
    subject,
    templateKey: "notification-dispatch",
    templateVars: { title: subject, bodyText },
    attachments,
    queuedByUserId: input.actorUserId,
  });
  await withCompanyScope(input.actorUserId, oci, (client) =>
    appendCrudAudit(client as never, input.actorUserId, "accounting.factoring_purchase_sent", {
      resource_type: "accounting.factoring_purchases", resource_id: input.purchaseId, operating_company_id: oci,
      display_id: head.display_id, to, email_queue_id: queueId, invoice_count: packet.lines.length,
      attached_count: attachments.length, linked_count: linked.length,
    }, "info", "ROUND-315-SUBMIT-TO-FACTOR")
  );
  return { sent: true, purchase_id: input.purchaseId, display_id: head.display_id, to, email_queue_id: queueId, attachments: attachments.length, linked_documents: linked.length };
}

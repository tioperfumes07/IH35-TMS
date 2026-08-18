import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { getBillPaymentDetail } from "./bills.service.js";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import { escapeHtml, joinBrandAddrLines, wrapPdfDocument } from "../render/pdf-template.js";
import { formatBillPaymentIssuedLines, renderBillPaymentBody, type BillPaymentHtmlModel } from "../render/bill-payment.template.js";

const paramsSchema = z.object({ id: z.string().uuid() });

function canViewBillPaymentHtml(role: string) {
  return ["Owner", "Administrator", "Accountant"].includes(role);
}

/**
 * LV-INBOX-P0-2-INVOICE-BILL-PAYMENT-SETTLEMENT-LETTER-HTML — bill/invoice/settlement each already
 * had a canonical backend-rendered letter HTML route (wrapPdfDocument, openPrintableDocument
 * ?print=1); bill payment did not. BillPaymentDetailPage.tsx's Print button fell back to
 * printLetterHtml — its own header comment says exactly what that fallback is for: "cash-advance
 * receipt, confirmations WITHOUT A BACKEND .html ROUTE YET" — a client-built, no-brand-header,
 * SPA-adjacent document, not the same canonical class as the other 3. This route closes that gap
 * using the identical pattern bill-render.routes.ts already established, same audit event class.
 */
export async function registerAccountingBillPaymentHtmlRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/accounting/bill-payments/:id.html",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      if (!canViewBillPaymentHtml(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

      const params = paramsSchema.safeParse(req.params ?? {});
      if (!params.success) return validationError(reply, params.error);
      const query = companyQuerySchema.safeParse(req.query ?? {});
      if (!query.success) return validationError(reply, query.error);

      const detail = await getBillPaymentDetail(String(user.uuid), query.data.operating_company_id, params.data.id);
      if (!detail) return reply.code(404).type("text/plain").send("bill_payment_not_found");

      const payment = detail.payment as Record<string, unknown>;

      const payload = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
        const companyRes = await client.query(
          `SELECT legal_name, short_name, phone, email, address_line1, city, state, postal_code FROM org.companies WHERE id = $1 LIMIT 1`,
          [query.data.operating_company_id]
        );
        const company = companyRes.rows[0] ?? {};

        let vendorAddrHtml = "";
        const mdataVendorId = payment.mdata_vendor_id ?? payment.vendor_id;
        if (mdataVendorId) {
          const vendorRes = await client.query(
            `SELECT vendor_name, address_line1, city, state, postal_code, phone, email
             FROM mdata.vendors WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
            [mdataVendorId, query.data.operating_company_id]
          );
          const vendor = vendorRes.rows[0] ?? {};
          vendorAddrHtml = joinBrandAddrLines([
            String(vendor.vendor_name ?? payment.vendor_name ?? "Vendor"),
            String(vendor.address_line1 ?? ""),
            [vendor.city, vendor.state, vendor.postal_code].filter(Boolean).join(", "),
            vendor.phone ? `Tel ${vendor.phone}` : "",
            vendor.email ? String(vendor.email) : "",
          ]);
        } else {
          vendorAddrHtml = `<div class="val">${escapeHtml(String(payment.vendor_name ?? "Vendor"))}</div>`;
        }

        const brandName = String(company.legal_name ?? company.short_name ?? "Carrier");
        const brandSub = String(company.short_name ?? "Accounts payable");
        const brandAddrHtml = joinBrandAddrLines([
          String(company.address_line1 ?? ""),
          [company.city, company.state, company.postal_code].filter(Boolean).join(", "),
          company.phone ? `Tel ${company.phone}` : "",
          company.email ? String(company.email) : "",
        ]);

        const isVoided = Boolean(payment.revoked_at);
        const paymentDocNum = String(payment.reference_number ?? payment.check_number ?? payment.id ?? "Payment");
        const billLabel = String(payment.bill_number ?? payment.bill_id ?? "—");

        const model: BillPaymentHtmlModel = {
          brandName,
          brandSub,
          brandAddrHtml,
          paymentDocNum,
          paymentDate: formatBillPaymentIssuedLines(payment.payment_date as string | Date).join(" · "),
          statusLine: `Status · ${isVoided ? "voided" : "posted"}`,
          vendorSectionTitle: "Paid to",
          vendorInnerHtml: vendorAddrHtml,
          billLabel,
          paymentMethod: String(payment.payment_method ?? "—"),
          checkNumber: String(payment.check_number ?? "—"),
          referenceNumber: String(payment.reference_number ?? "—"),
          memo: String(payment.memo ?? ""),
          amountCents: Number(payment.amount_cents ?? 0),
          footerNote: "Vendor bill payment receipt for internal AP records. Parallel books — no TMS→QBO write-back.",
        };

        await appendCrudAudit(
          client,
          user.uuid,
          "accounting.bill_payment.html_viewed",
          {
            operating_company_id: query.data.operating_company_id,
            bill_payment_id: params.data.id,
            reference_number: payment.reference_number ?? null,
          },
          "info",
          "LV-INBOX-P0-2-BILL-PAYMENT-PRINT"
        );

        return {
          title: `${paymentDocNum} · Bill payment`,
          body: renderBillPaymentBody(model),
        };
      });

      reply.header("Content-Type", "text/html; charset=utf-8");
      reply.header("Cache-Control", "no-store");
      return reply.send(wrapPdfDocument({ title: payload.title, body: payload.body }));
    }
  );
}

export default fp(async (app) => {
  await registerAccountingBillPaymentHtmlRoutes(app);
}, { name: "accounting.registerAccountingBillPaymentHtmlRoutes" });

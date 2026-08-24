import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { getBillDetail } from "./bills.service.js";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import { escapeHtml, joinBrandAddrLines, wrapPdfDocument } from "../render/pdf-template.js";
import { formatBillIssuedLines, renderBillBody, type BillHtmlModel, type BillLineRender } from "../render/bill.template.js";

const paramsSchema = z.object({ id: z.string().uuid() });

function canViewBillHtml(role: string) {
  return ["Owner", "Administrator", "Accountant"].includes(role);
}

export async function registerAccountingBillHtmlRoutes(app: FastifyInstance) {
  app.get(
    // ACCT-F3834 — letter HTML for BillDetail Print (openPrintableDocument ?print=1)
    "/api/v1/accounting/bills/:id.html",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      if (!canViewBillHtml(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

      const params = paramsSchema.safeParse(req.params ?? {});
      if (!params.success) return validationError(reply, params.error);
      const query = companyQuerySchema.safeParse(req.query ?? {});
      let operatingCompanyId = query.success ? query.data.operating_company_id : null;
      if (!operatingCompanyId) {
        operatingCompanyId = await withCurrentUser(user.uuid, async (client) => {
          const found = await client.query(`SELECT operating_company_id FROM accounting.bills WHERE id = $1::uuid LIMIT 1`, [
            params.data.id,
          ]);
          return (found.rows[0]?.operating_company_id as string | undefined) ?? null;
        });
      }
      if (!operatingCompanyId) {
        reply.type("text/html");
        return reply.code(400).send(
          wrapPdfDocument({
            title: "Bill",
            body: "<p>This print URL needs a real bill UUID. Create a TEST bill, then Print from the bill (or pass operating_company_id).</p>",
          })
        );
      }

      const detail = await getBillDetail(String(user.uuid), operatingCompanyId, params.data.id);
      if (!detail) return reply.code(404).type("text/plain").send("bill_not_found");

      const bill = detail.bill as Record<string, unknown>;
      const lines = (detail.lines as Array<Record<string, unknown>> | undefined) ?? [];

      const payload = await withCompanyScope(user.uuid, operatingCompanyId, async (client) => {
        const companyRes = await client.query(
          `SELECT legal_name, short_name, phone, email, address_line1, city, state, postal_code FROM org.companies WHERE id = $1 LIMIT 1`,
          [operatingCompanyId]
        );
        const company = companyRes.rows[0] ?? {};

        let vendorAddrHtml = "";
        if (bill.vendor_id) {
          const vendorRes = await client.query(
            `SELECT vendor_name, address_line1, city, state, postal_code, phone, email
             FROM mdata.vendors WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`,
            [bill.vendor_id, operatingCompanyId]
          );
          const vendor = vendorRes.rows[0] ?? {};
          vendorAddrHtml = joinBrandAddrLines([
            String(vendor.vendor_name ?? bill.vendor_name ?? "Vendor"),
            String(vendor.address_line1 ?? ""),
            [vendor.city, vendor.state, vendor.postal_code].filter(Boolean).join(", "),
            vendor.phone ? `Tel ${vendor.phone}` : "",
            vendor.email ? String(vendor.email) : "",
          ]);
        } else {
          vendorAddrHtml = `<div class="val">${escapeHtml(String(bill.vendor_name ?? "Vendor"))}</div>`;
        }

        const brandName = String(company.legal_name ?? company.short_name ?? "Carrier");
        const brandSub = String(company.short_name ?? "Accounts payable");
        const brandAddrHtml = joinBrandAddrLines([
          String(company.address_line1 ?? ""),
          [company.city, company.state, company.postal_code].filter(Boolean).join(", "),
          company.phone ? `Tel ${company.phone}` : "",
          company.email ? String(company.email) : "",
        ]);

        const billDocNum = String(bill.bill_number ?? bill.display_id ?? bill.id ?? "Bill");
        const billTotalCents = Number(bill.amount_cents ?? 0);
        const paidCents = Number(bill.paid_cents ?? 0);
        const balanceCents = billTotalCents - paidCents;

        const renderedLines: BillLineRender[] = lines.map((line) => ({
          description: String(line.description ?? "Line"),
          account: [line.account_number, line.account_name].filter(Boolean).join(" · ") || "—",
          amountCents: Number(line.amount_cents ?? 0),
        }));

        if (renderedLines.length === 0 && billTotalCents > 0) {
          renderedLines.push({
            description: String(bill.memo ?? "Bill total"),
            account: "—",
            amountCents: billTotalCents,
          });
        }

        const model: BillHtmlModel = {
          brandName,
          brandSub,
          brandAddrHtml,
          billDocNum,
          issuedLines: formatBillIssuedLines(bill.bill_date as string | Date, bill.due_date as string | Date),
          statusLine: `Status · ${String(bill.status ?? "open")}`,
          vendorSectionTitle: "Vendor",
          vendorInnerHtml: vendorAddrHtml,
          memo: String(bill.memo ?? ""),
          lines: renderedLines,
          billTotalCents,
          paidCents,
          balanceCents,
          footerNote: "Vendor bill for internal AP / payment authorization. Parallel books — no TMS→QBO write-back.",
        };

        await appendCrudAudit(
          client,
          user.uuid,
          "accounting.bill.html_viewed",
          {
            operating_company_id: operatingCompanyId,
            bill_id: params.data.id,
            bill_number: bill.bill_number ?? null,
          },
          "info",
          "ACCT-F3830-BILL-PRINT"
        );

        return {
          title: `${billDocNum} · Vendor bill`,
          body: renderBillBody(model),
        };
      });

      reply.header("Content-Type", "text/html; charset=utf-8");
      reply.header("Cache-Control", "no-store");
      return reply.send(wrapPdfDocument({ title: payload.title, body: payload.body }));
    }
  );
}

export default fp(async (app) => {
  await registerAccountingBillHtmlRoutes(app);
}, { name: "accounting.registerAccountingBillHtmlRoutes" });

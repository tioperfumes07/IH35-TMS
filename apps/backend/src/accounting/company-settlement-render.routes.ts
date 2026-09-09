import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { companyQuerySchema, currentAuthUser, resolvePrintOperatingCompanyId, validationError, withCompanyScope } from "./shared.js";
import { escapeHtml, formatDate, joinBrandAddrLines, wrapPdfDocument } from "../render/pdf-template.js";
import { renderCompanySettlementBody, type CompanySettlementHtmlModel } from "../render/company-settlement.template.js";
import { buildCompanySettlementReport } from "./company-settlement-report.service.js";

/**
 * SET-30 — company settlement PDF onto the house template.
 *   GET /api/v1/accounting/company-settlements/:id.html?operating_company_id=…
 * Mirrors the driver settlement / invoice / bill letter routes exactly: assemble the report + brand
 * block, render the body, wrap in the house shell (wrapPdfDocument). ?print=1 auto-opens print.
 */

const paramsSchema = z.object({ id: z.string().uuid() });

function canView(role: string) {
  return ["Owner", "Administrator", "Accountant"].includes(role);
}

export async function registerCompanySettlementHtmlRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/accounting/company-settlements/:id.html",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      if (!canView(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

      const params = paramsSchema.safeParse(req.params ?? {});
      if (!params.success) return validationError(reply, params.error);
      const query = companyQuerySchema.safeParse(req.query ?? {});
      let operatingCompanyId = query.success ? query.data.operating_company_id : null;
      if (!operatingCompanyId) {
        operatingCompanyId = await resolvePrintOperatingCompanyId(
          user.uuid,
          `SELECT operating_company_id FROM accounting.company_settlements WHERE id = $1::uuid LIMIT 1`,
          params.data.id
        );
      }
      if (!operatingCompanyId) {
        reply.header("Content-Type", "text/html; charset=utf-8");
        return reply.code(400).send(
          wrapPdfDocument({
            title: "Company settlement",
            body: "<p>This print URL needs a real company-settlement UUID (or pass operating_company_id).</p>",
          })
        );
      }

      const payload = await withCompanyScope(user.uuid, operatingCompanyId, async (client) => {
        const report = await buildCompanySettlementReport(client, {
          companySettlementId: params.data.id,
          operatingCompanyId,
        });
        if (!report) return { kind: "not_found" as const };

        const companyRes = await client.query(
          `SELECT legal_name, short_name, tax_id, phone, email, address_line1, city, state, postal_code FROM org.companies WHERE id = $1 LIMIT 1`,
          [operatingCompanyId]
        );
        const company = (companyRes.rows[0] ?? {}) as Record<string, unknown>;
        const brandName = String(company.legal_name ?? company.short_name ?? "Carrier");
        const brandSub = company.tax_id ? `EIN ${String(company.tax_id)}` : "Motor carrier";
        const brandAddrLines = [
          [company.address_line1, company.city, company.state, company.postal_code].filter(Boolean).join(", "),
          [company.phone ? String(company.phone) : null, company.email ? String(company.email) : null].filter(Boolean).join(" · "),
        ];

        const model: CompanySettlementHtmlModel = {
          brandName,
          brandSub,
          brandAddrHtml: joinBrandAddrLines(brandAddrLines),
          report,
          periodLines: [`Period ${formatDate(report.period_start)} — ${formatDate(report.period_end)}`],
          statusLine: `Status · ${report.status}`,
          driverCountLabel: `${report.driver_settlement_ids.length} driver settlement(s)`,
        };

        await appendCrudAudit(
          client,
          user.uuid,
          "accounting.company_settlement.html_viewed",
          {
            operating_company_id: operatingCompanyId,
            company_settlement_id: params.data.id,
            company_settlement_display_id: report.display_id,
          },
          "info",
          "SET-30-PDF-RENDER"
        );

        const body = renderCompanySettlementBody(model);
        return { kind: "ok" as const, body, title: `${report.display_id} · Company settlement` };
      });

      if (!payload || payload.kind === "not_found") return reply.code(404).send({ error: "company_settlement_not_found" });

      reply.header("Content-Type", "text/html; charset=utf-8");
      reply.header("Cache-Control", "private, no-store");
      return reply.send(wrapPdfDocument({ title: payload.title, body: payload.body }));
    }
  );
}

export default fp(async (app) => {
  await registerCompanySettlementHtmlRoutes(app);
}, { name: "accounting.registerCompanySettlementHtmlRoutes" });

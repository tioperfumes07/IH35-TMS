import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import puppeteer from "puppeteer";
import { companyQuerySchema, currentAuthUser, resolvePrintOperatingCompanyId, validationError, withCompanyScope } from "./shared.js";
import { wrapPdfDocument } from "../render/pdf-template.js";
// ONE DOCUMENT: this route and the /pdf route below both render through
// buildCompanySettlementDocument, so the printed PDF and the on-screen statement are the same
// paper. See company-settlement-document.service.ts.
import { buildCompanySettlementDocument } from "./company-settlement-document.service.js";

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
            skin: "v10",
          })
        );
      }

      const payload = await withCompanyScope(user.uuid, operatingCompanyId, async (client) =>
        buildCompanySettlementDocument(client as never, {
          companySettlementId: params.data.id,
          operatingCompanyId,
          userId: user.uuid,
        })
      );

      if (!payload || payload.kind === "not_found") return reply.code(404).send({ error: "company_settlement_not_found" });

      reply.header("Content-Type", "text/html; charset=utf-8");
      reply.header("Cache-Control", "private, no-store");
      return reply.send(wrapPdfDocument({ title: payload.title, body: payload.body, skin: "v10" }));
    }
  );

  /**
   * GET /api/v1/accounting/company-settlements/:id/pdf
   *
   * OWNER, 2026-09-30: "we need to get done also the company settlements pdfs not just driver."
   *
   * He was right, and it was missing ENTIRELY. Company settlements had exactly ONE render route --
   * `:id.html` -- and no PDF endpoint at any spelling, while the driver settlement has had a real
   * `/pdf` all along. "Print the company settlement" meant opening a browser and pressing Cmd-P.
   *
   * This renders the SAME document the .html route serves, through the same puppeteer path the
   * driver settlement PDF uses, so the two carriers' documents are produced identically and the
   * company PDF cannot drift from the company screen.
   */
  app.get(
    "/api/v1/accounting/company-settlements/:id/pdf",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      if (!canView(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

      const params = paramsSchema.safeParse(req.params ?? {});
      if (!params.success) return validationError(reply, params.error);
      const query = companyQuerySchema.partial().safeParse(req.query ?? {});
      if (!query.success) return validationError(reply, query.error);

      let operatingCompanyId = query.data.operating_company_id ?? null;
      if (!operatingCompanyId) {
        operatingCompanyId = await resolvePrintOperatingCompanyId(
          user.uuid,
          `SELECT operating_company_id FROM accounting.company_settlements WHERE id = $1::uuid LIMIT 1`,
          params.data.id
        );
      }
      if (!operatingCompanyId) return reply.code(400).send({ error: "operating_company_id_required" });

      const payload = await withCompanyScope(user.uuid, operatingCompanyId, async (client) =>
        buildCompanySettlementDocument(client as never, {
          companySettlementId: params.data.id,
          operatingCompanyId,
          userId: user.uuid,
        })
      );

      if (!payload || payload.kind === "not_found") return reply.code(404).send({ error: "company_settlement_not_found" });

      const html = wrapPdfDocument({ title: payload.title, body: payload.body, skin: "v10" });
      const browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
      });
      try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: "load" });
        const pdf = await page.pdf({ format: "Letter", printBackground: true });
        const pdfBuffer = Buffer.from(pdf);
        reply.header("Content-Type", "application/pdf");
        reply.header("Cache-Control", "private, no-store");
        reply.header(
          "Content-Disposition",
          `inline; filename="company-settlement-${payload.displayId}.pdf"`
        );
        return reply.send(pdfBuffer);
      } finally {
        await browser.close();
      }
    }
  );
}

export default fp(async (app) => {
  await registerCompanySettlementHtmlRoutes(app);
}, { name: "accounting.registerCompanySettlementHtmlRoutes" });

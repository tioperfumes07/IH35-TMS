/**
 * Company Settlement Report — read-only 8-section aggregation over an existing
 * accounting.company_settlements header row (25-TASK #3, owner instructions 2026-09-02).
 * GET /api/v1/accounting/company-settlements/:id/report
 *
 * Design source: /Users/jorgemunoz/Downloads/Company_Settlement_5753.pdf, read live before writing
 * any code. See company-settlement-report.service.ts's own header comment for the full
 * CANONICAL-CHECK: every section is computed from EXISTING canonical tables reachable via the
 * company settlement's linked driver_finance.driver_settlements row(s) — no dollars are duplicated.
 */
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import { buildCompanySettlementReport } from "./company-settlement-report.service.js";

const paramsSchema = z.object({ id: z.string().uuid() });

export async function registerCompanySettlementReportRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/accounting/company-settlements/:id/report",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;

      const params = paramsSchema.safeParse(req.params ?? {});
      if (!params.success) return validationError(reply, params.error);
      const query = companyQuerySchema.safeParse(req.query ?? {});
      if (!query.success) return validationError(reply, query.error);

      const report = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) =>
        buildCompanySettlementReport(client, {
          companySettlementId: params.data.id,
          operatingCompanyId: query.data.operating_company_id,
        })
      );

      if (!report) return reply.code(404).send({ error: "company_settlement_not_found" });
      return reply.code(200).send(report);
    }
  );
}

export default fp(async (app) => {
  await registerCompanySettlementReportRoutes(app);
}, { name: "accounting.registerCompanySettlementReportRoutes" });

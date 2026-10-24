import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  companyQuerySchema,
  currentAuthUser,
  dateRangeOrderError,
  validationError,
  withCompanyScope,
} from "./shared.js";
import {
  getCompanySettlementsReport,
  type CompanySettlementsQuery,
} from "./company-settlements-report.service.js";

/**
 * 443.281-B endpoint 4: paged company settlements report.
 * GET /api/v1/reports/company-settlements
 */

const querySchema = companyQuerySchema.extend({
  from: z.string().date(),
  to: z.string().date(),
  status: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function registerCompanySettlementsReportRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/reports/company-settlements",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      const parsed = querySchema.safeParse(req.query ?? {});
      if (!parsed.success) return validationError(reply, parsed.error);
      if (parsed.data.from > parsed.data.to)
        return dateRangeOrderError(reply, "from", "to");

      const {
        operating_company_id: operatingCompanyId,
        from,
        to,
        status,
        limit,
        offset,
      } = parsed.data;

      return withCompanyScope(user.uuid, operatingCompanyId, async (client) =>
        getCompanySettlementsReport(client, {
          operatingCompanyId,
          from,
          to,
          status,
          limit,
          offset,
        } satisfies CompanySettlementsQuery)
      );
    }
  );
}

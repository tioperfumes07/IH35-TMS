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
  getCustomerReport,
  type CustomerReportQuery,
} from "./customer-report.service.js";

/**
 * 443.281-B endpoint 5: customer profitability + AR report.
 * GET /api/v1/reports/customer-report
 */

const querySchema = companyQuerySchema.extend({
  from: z.string().date(),
  to: z.string().date(),
  date_field: z.enum(["pickup", "delivery"]).default("pickup"),
  customer_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function registerCustomerReportRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/reports/customer-report",
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
        date_field: dateField,
        customer_id: customerId,
        limit,
        offset,
      } = parsed.data;

      return withCompanyScope(user.uuid, operatingCompanyId, async (client) =>
        getCustomerReport(client, {
          operatingCompanyId,
          from,
          to,
          dateField,
          customerId,
          limit,
          offset,
        } satisfies CustomerReportQuery)
      );
    }
  );
}

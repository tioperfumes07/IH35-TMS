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
  getVendorReport,
  type VendorReportQuery,
} from "./vendor-report.service.js";

/**
 * 443.281-B endpoint 6: vendor AP report.
 * GET /api/v1/reports/vendor-report
 */

const querySchema = companyQuerySchema.extend({
  from: z.string().date(),
  to: z.string().date(),
  vendor_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function registerVendorReportRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/reports/vendor-report",
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
        vendor_id: vendorId,
        limit,
        offset,
      } = parsed.data;

      return withCompanyScope(user.uuid, operatingCompanyId, async (client) =>
        getVendorReport(client, {
          operatingCompanyId,
          from,
          to,
          vendorId,
          limit,
          offset,
        } satisfies VendorReportQuery)
      );
    }
  );
}

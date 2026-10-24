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
  getLoadsSummary,
  type LoadsSummaryQuery,
} from "./loads-summary.service.js";

/**
 * 443.281-B — Group-by aggregation over the same loads filter.
 * Used by the Load Summary board in Cursor.
 */

const querySchema = companyQuerySchema.extend({
  from: z.string().date(),
  to: z.string().date(),
  date_field: z.enum(["pickup", "delivery"]).default("pickup"),
  group_by: z.enum(["customer", "driver", "unit", "trip_type", "month"]),
  customer_id: z.string().uuid().optional(),
  driver_id: z.string().uuid().optional(),
  unit_id: z.string().uuid().optional(),
  status: z.string().trim().min(1).optional(),
  trip_type: z.enum(["NB", "TR", "SB", "LOCAL"]).optional(),
  factoring_status: z.string().trim().min(1).optional(),
});

export async function registerLoadsSummaryRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/reports/loads-summary",
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
        group_by: groupBy,
        customer_id: customerId,
        driver_id: driverId,
        unit_id: unitId,
        status,
        trip_type: tripType,
        factoring_status: factoringStatus,
      } = parsed.data;

      return withCompanyScope(user.uuid, operatingCompanyId, async (client) =>
        getLoadsSummary(client, {
          operatingCompanyId,
          from,
          to,
          dateField,
          groupBy,
          customerId,
          driverId,
          unitId,
          status,
          tripType,
          factoringStatus,
        } satisfies LoadsSummaryQuery)
      );
    }
  );
}

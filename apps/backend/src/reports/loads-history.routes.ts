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
  getLoadsHistoryPage,
  type LoadsHistoryQuery,
} from "./loads-history.service.js";

/**
 * 443.281-B — Paged loads history endpoint for Cursor Load History board.
 * Complements /api/v1/reports/loads (full export) with offset pagination +
 * totals block that ties to A/R 1100. Cursor builds Load History on this.
 */

const querySchema = companyQuerySchema.extend({
  from: z.string().date(),
  to: z.string().date(),
  date_field: z.enum(["pickup", "delivery"]).default("pickup"),
  customer_id: z.string().uuid().optional(),
  driver_id: z.string().uuid().optional(),
  unit_id: z.string().uuid().optional(),
  status: z.string().trim().min(1).optional(),
  trip_type: z.enum(["NB", "TR", "SB", "LOCAL"]).optional(),
  factoring_status: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function registerLoadsHistoryRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/reports/loads-history",
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
        driver_id: driverId,
        unit_id: unitId,
        status,
        trip_type: tripType,
        factoring_status: factoringStatus,
        limit,
        offset,
      } = parsed.data;

      return withCompanyScope(user.uuid, operatingCompanyId, async (client) =>
        getLoadsHistoryPage(client, {
          operatingCompanyId,
          from,
          to,
          dateField,
          customerId,
          driverId,
          unitId,
          status,
          tripType,
          factoringStatus,
          limit,
          offset,
        } satisfies LoadsHistoryQuery)
      );
    }
  );
}

/**
 * Owner/Admin: rematch Relay fuel rows that have matched_driver_id NULL using
 * integration_id → phone → name unique fallbacks (no mdata.drivers writes).
 *
 * POST /api/integrations/relay/fuel/rematch-drivers
 * body: { operating_company_id?: uuid, limit?: number }
 */
import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../auth/session-middleware.js";
import { withLuciaBypass } from "../../auth/db.js";
import { rematchRelayFuelDrivers } from "./relay-fuel-driver-rematch.service.js";

export async function registerRelayFuelDriverRematchRoute(app: FastifyInstance) {
  app.post(
    "/api/integrations/relay/fuel/rematch-drivers",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
      if (!requireAuth(req, reply)) return reply;
      const role = String((req.user as { role?: string } | undefined)?.role ?? "");
      if (!["Owner", "Administrator"].includes(role)) {
        return reply.code(403).send({ error: "forbidden" });
      }
      const body = (req.body ?? {}) as { operating_company_id?: string; limit?: number };
      const operatingCompanyId =
        typeof body.operating_company_id === "string" && body.operating_company_id.length > 0
          ? body.operating_company_id
          : undefined;
      const limit = Number.isFinite(Number(body.limit)) ? Number(body.limit) : undefined;

      const result = await withLuciaBypass(async (client) =>
        rematchRelayFuelDrivers(client, {
          operating_company_id: operatingCompanyId,
          limit,
        }),
      );

      app.log.info(
        { ...result, triggered_by_role: role, operating_company_id: operatingCompanyId ?? null },
        "[RELAY_FUEL_DRIVER_REMATCH] completed",
      );
      return reply.code(200).send({ status: "ok", ...result });
    },
  );
}

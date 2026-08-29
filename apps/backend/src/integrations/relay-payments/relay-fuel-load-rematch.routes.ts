/**
 * Owner/Admin: rematch fuel.fuel_transactions with load_id NULL using G18 window
 * resolution (unit/driver → load stop window). Fill-null only — no fake FKs.
 *
 * POST /api/integrations/relay/fuel/rematch-loads
 * body: { operating_company_id?: uuid, limit?: number }
 */
import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../auth/session-middleware.js";
import { withLuciaBypass } from "../../auth/db.js";
import { rematchRelayFuelLoads } from "./relay-fuel-load-rematch.service.js";

export async function registerRelayFuelLoadRematchRoute(app: FastifyInstance) {
  app.post(
    "/api/integrations/relay/fuel/rematch-loads",
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
        rematchRelayFuelLoads(client, {
          operating_company_id: operatingCompanyId,
          limit,
        }),
      );

      app.log.info(
        { ...result, triggered_by_role: role, operating_company_id: operatingCompanyId ?? null },
        "[RELAY_FUEL_LOAD_REMATCH] completed",
      );
      return reply.code(200).send({ status: "ok", ...result });
    },
  );
}

/**
 * Owner/Admin: rematch Relay fuel rows that have matched_driver_id NULL through the one Relay driver matcher
 * (Relay's own id directly or via integrations.relay_driver_links → fuel row → load at fill time; NULL only; no
 * mdata.drivers writes). E1: Relay fills are stored for USMCA only (ROUND 443.15), so the company is required and must be
 * USMCA — a run over every company could write frozen entities. Each header written is audited under the person who ran it.
 *
 * POST /api/integrations/relay/fuel/rematch-drivers
 * body: { operating_company_id?: uuid, limit?: number }
 */
import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../auth/session-middleware.js";
import { withLuciaBypass } from "../../auth/db.js";
import { rematchRelayFuelDrivers } from "./relay-fuel-driver-rematch.service.js";
import { isUsmcaOperatingCompany } from "./relay-usmca-date-floor.js";

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
      if (!operatingCompanyId || !isUsmcaOperatingCompany(operatingCompanyId)) {
        return reply.code(400).send({ error: "relay_rematch_company_required", detail: "operating_company_id must be the Relay company (USMCA)" });
      }
      const limit = Number.isFinite(Number(body.limit)) ? Number(body.limit) : undefined;
      const actorUserId = (req.user as { uuid?: string } | undefined)?.uuid;

      const result = await withLuciaBypass(async (client) => {
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
        return rematchRelayFuelDrivers(client, {
          operating_company_id: operatingCompanyId,
          limit,
          actor_user_id: actorUserId,
        });
      });

      app.log.info(
        { ...result, triggered_by_role: role, operating_company_id: operatingCompanyId ?? null },
        "[RELAY_FUEL_DRIVER_REMATCH] completed",
      );
      return reply.code(200).send({ status: "ok", ...result });
    },
  );
}

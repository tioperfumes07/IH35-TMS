import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { canAssignLoadToDriver } from "./driver-availability.service.js";

const uuidSchema = z.string().uuid();
/** Edge guard: these ids flow into the tenant-scoping GUC (app.operating_company_id) downstream. */
function isUuid(v: string): boolean {
  return uuidSchema.safeParse(v).success;
}

function readBodyRecord(req: FastifyRequest): Record<string, unknown> {
  if (typeof req.body === "object" && req.body !== null) {
    return req.body as Record<string, unknown>;
  }
  return {};
}

export async function registerDispatchLoadAssignRoutes(app: FastifyInstance) {
  app.addHook("preValidation", async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.method !== "POST") return;
    if (req.routeOptions.url !== "/api/v1/dispatch/loads/:id/quick-assign") return;

    const body = readBodyRecord(req);
    const driverId = typeof body.driver_id === "string" ? body.driver_id : "";
    const tenantId = typeof body.operating_company_id === "string" ? body.operating_company_id : "";
    const overrideRepairBlock = body.override_repair_block === true;

    if (!driverId || !tenantId) return;
    if (!isUuid(driverId) || !isUuid(tenantId)) {
      return reply
        .code(400)
        .send({ error: "validation_error", message: "driver_id and operating_company_id must be UUIDs" });
    }

    const availability = await canAssignLoadToDriver(driverId, tenantId);
    if (!availability.ok && !overrideRepairBlock) {
      return reply.code(409).send({
        error: "E_DRIVER_REPAIR_BLOCK",
        blocker: availability.blocker,
        work_order_id: availability.work_order_id ?? null,
        asset_id: availability.asset_id ?? null,
      });
    }
  });

  app.get("/api/v1/dispatch/drivers/:driver_id/load-availability", async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const params = (req.params ?? {}) as Record<string, unknown>;
    const query = (req.query ?? {}) as Record<string, unknown>;
    const driverId = typeof params.driver_id === "string" ? params.driver_id : "";
    const tenantId = typeof query.operating_company_id === "string" ? query.operating_company_id : "";
    if (!driverId || !tenantId || !isUuid(driverId) || !isUuid(tenantId)) {
      return reply.code(400).send({ error: "validation_error" });
    }

    const availability = await canAssignLoadToDriver(driverId, tenantId);
    return reply.send(availability);
  });
}

/**
 * GAP-59 / CAP-9 — Samsara vehicle-driver pairing routes.
 * Complements existing /api/v1/telematics/vehicle-driver-* routes.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../../../audit/crud-audit.js";
import { withCurrentUser } from "../../../auth/db.js";
import { requireAuth } from "../../../auth/session-middleware.js";
import {
  applyManualOverride,
  getDriverPairingHistory,
  lookupDriverForVehicleAtTime,
  type DbClient,
} from "./pairing.service.js";
import { assertCompanyMembership } from "../../../_helpers/company-membership-guard.js";

const atEventQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  vehicle_id: z.string().uuid(),
  at_time: z.string().min(1),
});

const driverHistoryQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  driver_id: z.string().uuid(),
  from: z.string().min(1),
  to: z.string().min(1),
});

const manualOverrideBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  vehicle_id: z.string().uuid(),
  driver_id: z.string().uuid(),
  started_at: z.string().datetime().optional(),
  ended_at: z.string().datetime().nullable().optional(),
});

function officeUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  const user = req.user as { uuid: string; role: string };
  if (user.role === "Driver") {
    reply.code(403).send({ error: "forbidden" });
    return null;
  }
  return user;
}

function ownerOrSafetyUser(req: FastifyRequest, reply: FastifyReply) {
  const user = officeUser(req, reply);
  if (!user) return null;
  if (!["Owner", "Safety"].includes(user.role)) {
    reply.code(403).send({ error: "forbidden", message: "Owner or Safety role required" });
    return null;
  }
  return user;
}

function validationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

async function withCompany<T>(userId: string, companyId: string, fn: (client: DbClient) => Promise<T>) {
  await assertCompanyMembership(userId, companyId);
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [companyId]);
    return fn(client);
  });
}

export async function registerSamsaraVehicleDriverPairingRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/integrations/samsara/pairing/at-event", async (req, reply) => {
    const user = officeUser(req, reply);
    if (!user) return;
    const parsed = atEventQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const driverId = await withCompany(user.uuid, parsed.data.operating_company_id, async (client) =>
      lookupDriverForVehicleAtTime(
        client,
        parsed.data.operating_company_id,
        parsed.data.vehicle_id,
        parsed.data.at_time
      )
    );

    return reply.send({
      vehicle_id: parsed.data.vehicle_id,
      at_time: parsed.data.at_time,
      driver_id: driverId,
    });
  });

  app.get("/api/integrations/samsara/pairing/driver-history", async (req, reply) => {
    const user = officeUser(req, reply);
    if (!user) return;
    const parsed = driverHistoryQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const rows = await withCompany(user.uuid, parsed.data.operating_company_id, async (client) =>
      getDriverPairingHistory(
        client,
        parsed.data.operating_company_id,
        parsed.data.driver_id,
        parsed.data.from,
        parsed.data.to
      )
    );

    return reply.send({ rows, count: rows.length });
  });

  app.post("/api/integrations/samsara/pairing/manual-override", async (req, reply) => {
    const user = ownerOrSafetyUser(req, reply);
    if (!user) return;
    const parsed = manualOverrideBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const result = await withCompany(user.uuid, parsed.data.operating_company_id, async (client) => {
      const override = await applyManualOverride(client, {
        operating_company_id: parsed.data.operating_company_id,
        vehicle_id: parsed.data.vehicle_id,
        driver_id: parsed.data.driver_id,
        started_at: parsed.data.started_at,
        ended_at: parsed.data.ended_at,
        created_by_user_uuid: user.uuid,
      });
      await appendCrudAudit(client, user.uuid, "telematics.vehicle_driver_pairing.manual_override", {
        assignment_id: override.assignment_id,
        vehicle_id: parsed.data.vehicle_id,
        driver_id: parsed.data.driver_id,
      });
      return override;
    });

    return reply.code(201).send(result);
  });
}

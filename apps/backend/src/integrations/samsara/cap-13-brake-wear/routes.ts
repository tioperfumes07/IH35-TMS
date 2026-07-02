/**
 * CAP-13 Brake Wear Routes — GAP-63
 * Base path: /api/v1/maintenance/brake-wear
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../../../audit/crud-audit.js";
import { withCurrentUser } from "../../../auth/db.js";
import { requireAuth } from "../../../auth/session-middleware.js";
import {
  getAtRiskFleet,
  getLatestForUnit,
  listMeasurements,
  listProjectionsForUnit,
  projectReplacement,
  recordMeasurement,
  type BrakeMeasurementSource,
} from "./service.js";
import type { DbClient } from "./service.js";
import { assertCompanyMembership } from "../../../_helpers/company-membership-guard.js";

const companyQuery = z.object({
  operating_company_id: z.string().uuid(),
  unit: z.string().uuid().optional(),
  unit_uuid: z.string().uuid().optional(),
  position: z.string().trim().min(1).max(40).optional(),
  within_days: z.coerce.number().int().min(1).max(365).optional().default(30),
  axle_group: z.enum(["steer", "drive", "all"]).optional().default("all"),
  scope: z.enum(["latest", "history"]).optional().default("latest"),
});

const recordSchema = z.object({
  operating_company_id: z.string().uuid(),
  unit_uuid: z.string().uuid(),
  position: z.string().trim().min(1).max(40),
  thickness_mm: z.number().min(0).max(50),
  source: z.enum(["dvir", "pm_inspection", "brake_service", "samsara_diagnostics"]),
  measured_at: z.string().datetime().optional(),
  odometer_miles: z.number().int().min(0).optional(),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function validationError(reply: FastifyReply, err: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: err.flatten() });
}

async function withCompany<T>(
  userId: string,
  companyId: string,
  fn: (client: DbClient) => Promise<T>
) {
  await assertCompanyMembership(userId, companyId);
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [companyId]);
    return fn(client);
  });
}

export async function registerCap13BrakeWearRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/v1/maintenance/brake-wear/measurements", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = recordSchema.safeParse(req.body);
    if (!parsed.success) return validationError(reply, parsed.error);
    const body = parsed.data;

    const row = await withCompany(user.uuid, body.operating_company_id, async (client) => {
      const measurement = await recordMeasurement(client, {
        operating_company_id: body.operating_company_id,
        unit_uuid: body.unit_uuid,
        position: body.position,
        thickness_mm: body.thickness_mm,
        source: body.source as BrakeMeasurementSource,
        measured_at: body.measured_at,
        measured_by_user_uuid: user.uuid,
        odometer_miles: body.odometer_miles ?? null,
      });
      await appendCrudAudit(client, user.uuid, "maintenance.brake_wear_measurement.created", {
        unit_uuid: body.unit_uuid,
        position: body.position,
        thickness_mm: body.thickness_mm,
      });
      return measurement;
    });
    return reply.code(201).send(row);
  });

  app.get("/api/v1/maintenance/brake-wear/measurements", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = companyQuery.safeParse(req.query);
    if (!parsed.success) return validationError(reply, parsed.error);
    const unitUuid = parsed.data.unit ?? parsed.data.unit_uuid;

    const rows = await withCompany(user.uuid, parsed.data.operating_company_id, async (client) => {
      if (unitUuid && !parsed.data.position && parsed.data.scope === "latest") {
        return getLatestForUnit(client, parsed.data.operating_company_id, unitUuid);
      }
      return listMeasurements(client, parsed.data.operating_company_id, {
        unit_uuid: unitUuid,
        position: parsed.data.position,
      });
    });
    return reply.send({ rows });
  });

  app.get("/api/v1/maintenance/brake-wear/projections", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = companyQuery.safeParse(req.query);
    if (!parsed.success) return validationError(reply, parsed.error);
    const unitUuid = parsed.data.unit ?? parsed.data.unit_uuid;
    if (!unitUuid) {
      return reply.code(400).send({ error: "unit_required" });
    }

    const rows = await withCompany(user.uuid, parsed.data.operating_company_id, async (client) => {
      if (parsed.data.position) {
        const projection = await projectReplacement(
          client,
          parsed.data.operating_company_id,
          unitUuid,
          parsed.data.position
        );
        return [projection];
      }
      return listProjectionsForUnit(client, parsed.data.operating_company_id, unitUuid);
    });
    return reply.send({ rows });
  });

  app.get("/api/v1/maintenance/brake-wear/at-risk", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = companyQuery.safeParse(req.query);
    if (!parsed.success) return validationError(reply, parsed.error);

    let rows = await withCompany(user.uuid, parsed.data.operating_company_id, async (client) =>
      getAtRiskFleet(client, parsed.data.operating_company_id, parsed.data.within_days)
    );

    if (parsed.data.axle_group !== "all") {
      rows = rows.filter((row) => row.axle_group === parsed.data.axle_group);
    }

    return reply.send({ rows, count: rows.length, within_days: parsed.data.within_days });
  });
}

/**
 * CAP-12 Tire Tread Wear Routes — GAP-62
 * Base path: /api/v1/maintenance/tire-tread
 */
import type { PoolClient } from "pg";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../../../audit/crud-audit.js";
import { withCurrentUser } from "../../../auth/db.js";
import { requireAuth } from "../../../auth/session-middleware.js";
import {
  getLatestForUnit,
  listMeasurements,
  recordMeasurement,
  type TreadMeasurementSource,
} from "./measurement.service.js";
import {
  listAtRiskUnits,
  listProjectionsForUnit,
  projectReplacementDate,
} from "./projection.service.js";

const companyQuery = z.object({
  operating_company_id: z.string().uuid(),
  unit: z.string().uuid().optional(),
  unit_uuid: z.string().uuid().optional(),
  position: z.string().trim().min(1).max(40).optional(),
  within_days: z.coerce.number().int().min(1).max(365).optional().default(30),
  axle_group: z.enum(["steer", "drive", "trailer", "all"]).optional().default("all"),
});

const recordSchema = z.object({
  operating_company_id: z.string().uuid(),
  unit_uuid: z.string().uuid(),
  position: z.string().trim().min(1).max(40),
  depth_32nds: z.number().int().min(0).max(40),
  source: z.enum(["dvir_inspection", "maintenance_pm", "tire_service", "samsara_smart_sensor"]),
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

async function withCompany<T>(userId: string, companyId: string, fn: (client: PoolClient) => Promise<T>) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [companyId]);
    return fn(client);
  });
}

export async function registerCap12TireTreadRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/v1/maintenance/tire-tread/measurements", async (req, reply) => {
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
        depth_32nds: body.depth_32nds,
        source: body.source as TreadMeasurementSource,
        measured_at: body.measured_at,
        measured_by_user_uuid: user.uuid,
        odometer_miles: body.odometer_miles ?? null,
      });
      await appendCrudAudit(client, user.uuid, "maintenance.tire_tread_measurement.created", {
        unit_uuid: body.unit_uuid,
        position: body.position,
        depth_32nds: body.depth_32nds,
      });
      return measurement;
    });
    return reply.code(201).send(row);
  });

  app.get("/api/v1/maintenance/tire-tread/measurements", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = companyQuery.safeParse(req.query);
    if (!parsed.success) return validationError(reply, parsed.error);
    const unitUuid = parsed.data.unit ?? parsed.data.unit_uuid;

    const rows = await withCompany(user.uuid, parsed.data.operating_company_id, async (client) => {
      if (unitUuid && !parsed.data.position) {
        return getLatestForUnit(client, parsed.data.operating_company_id, unitUuid);
      }
      return listMeasurements(client, parsed.data.operating_company_id, {
        unit_uuid: unitUuid,
        position: parsed.data.position,
      });
    });
    return reply.send({ rows });
  });

  app.get("/api/v1/maintenance/tire-tread/projections", async (req, reply) => {
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
        const projection = await projectReplacementDate(
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

  app.get("/api/v1/maintenance/tire-tread/at-risk", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = companyQuery.safeParse(req.query);
    if (!parsed.success) return validationError(reply, parsed.error);

    let rows = await withCompany(user.uuid, parsed.data.operating_company_id, async (client) =>
      listAtRiskUnits(client, parsed.data.operating_company_id, parsed.data.within_days)
    );

    if (parsed.data.axle_group !== "all") {
      rows = rows.filter((row) => row.position_group === parsed.data.axle_group);
    }

    return reply.send({ rows, count: rows.length, within_days: parsed.data.within_days });
  });
}

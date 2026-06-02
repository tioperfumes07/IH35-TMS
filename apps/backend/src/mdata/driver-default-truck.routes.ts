import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const companyQuerySchema = z.object({ operating_company_id: z.string().uuid() });
const driverParamsSchema = z.object({ id: z.string().uuid() });
const setDefaultSchema = z.object({ unit_id: z.string().uuid() });

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function isWriteRole(role: string) {
  return role === "Owner" || role === "Administrator" || role === "Manager";
}

async function assertDriverScope(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<{ id: string }> }> },
  driverId: string,
  operatingCompanyId: string
) {
  const res = await client.query(
    `
      SELECT d.id::text
      FROM mdata.drivers d
      WHERE d.id = $1::uuid
        AND (
          d.operating_company_id = $2::uuid
          OR EXISTS (
            SELECT 1 FROM mdata.driver_company_authorizations dca
            WHERE dca.driver_id = d.id AND dca.company_id = $2::uuid AND dca.is_authorized = true AND dca.deactivated_at IS NULL
          )
        )
      LIMIT 1
    `,
    [driverId, operatingCompanyId]
  );
  return res.rows[0]?.id ?? null;
}

async function assertUnitScope(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<{ id: string }> }> },
  unitId: string,
  operatingCompanyId: string
) {
  const res = await client.query(
    `
      SELECT id::text
      FROM mdata.units
      WHERE id = $1::uuid
        AND (owner_company_id = $2::uuid OR currently_leased_to_company_id = $2::uuid)
      LIMIT 1
    `,
    [unitId, operatingCompanyId]
  );
  return res.rows[0]?.id ?? null;
}

async function fetchTruckAssignments(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> },
  driverId: string,
  operatingCompanyId: string
) {
  const defaultRes = await client.query(
    `
      SELECT u.id::text AS unit_id, u.unit_number, u.vin, vda.started_at::text, vda.source, vda.is_default
      FROM telematics.vehicle_driver_assignments vda
      JOIN mdata.units u ON u.id = vda.unit_id
      WHERE vda.driver_id = $1::uuid
        AND vda.operating_company_id = $2::uuid
        AND vda.is_default = true
        AND vda.ended_at IS NULL
      ORDER BY vda.started_at DESC
      LIMIT 1
    `,
    [driverId, operatingCompanyId]
  );
  const currentRes = await client.query(
    `
      SELECT u.id::text AS unit_id, u.unit_number, u.vin, vda.started_at::text AS samsara_logged_in_at, vda.source
      FROM telematics.vehicle_driver_assignments vda
      JOIN mdata.units u ON u.id = vda.unit_id
      WHERE vda.driver_id = $1::uuid
        AND vda.operating_company_id = $2::uuid
        AND vda.source = 'samsara_webhook'
        AND vda.ended_at IS NULL
      ORDER BY vda.started_at DESC
      LIMIT 1
    `,
    [driverId, operatingCompanyId]
  );
  return {
    default_truck: defaultRes.rows[0] ?? null,
    currently_driving_truck: currentRes.rows[0] ?? null,
  };
}

export async function registerDriverDefaultTruckRoutes(app: FastifyInstance) {
  app.get("/api/v1/mdata/drivers/:id/truck-assignments", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = driverParamsSchema.safeParse(req.params ?? {});
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!params.success || !query.success) return reply.code(400).send({ error: "validation_error" });
    const payload = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [query.data.operating_company_id]);
      const driverOk = await assertDriverScope(client, params.data.id, query.data.operating_company_id);
      if (!driverOk) return null;
      return fetchTruckAssignments(client, params.data.id, query.data.operating_company_id);
    });
    if (!payload) return reply.code(404).send({ error: "mdata_driver_not_found" });
    return payload;
  });

  app.post("/api/v1/mdata/drivers/:id/default-truck", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!isWriteRole(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = driverParamsSchema.safeParse(req.params ?? {});
    const query = companyQuerySchema.safeParse(req.query ?? {});
    const body = setDefaultSchema.safeParse(req.body ?? {});
    if (!params.success || !query.success || !body.success) {
      return reply.code(400).send({ error: "validation_error" });
    }
    const result = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [query.data.operating_company_id]);
      const driverOk = await assertDriverScope(client, params.data.id, query.data.operating_company_id);
      if (!driverOk) return null;
      const unitOk = await assertUnitScope(client, body.data.unit_id, query.data.operating_company_id);
      if (!unitOk) return { error: "mdata_unit_not_found" as const };
      await client.query(
        `
          UPDATE telematics.vehicle_driver_assignments
          SET ended_at = now()
          WHERE unit_id = $1::uuid
            AND operating_company_id = $2::uuid
            AND is_default = true
            AND ended_at IS NULL
        `,
        [body.data.unit_id, query.data.operating_company_id]
      );
      await client.query(
        `
          UPDATE telematics.vehicle_driver_assignments
          SET ended_at = now()
          WHERE driver_id = $1::uuid
            AND operating_company_id = $2::uuid
            AND is_default = true
            AND ended_at IS NULL
        `,
        [params.data.id, query.data.operating_company_id]
      );
      await client.query(
        `
          INSERT INTO telematics.vehicle_driver_assignments (
            operating_company_id, unit_id, driver_id, started_at, source, is_default, created_by_user_uuid
          ) VALUES ($1,$2,$3,now(),'manual_override',true,$4)
        `,
        [query.data.operating_company_id, body.data.unit_id, params.data.id, user.uuid]
      );
      await appendCrudAudit(client, user.uuid, "mdata.driver.default_truck_set", {
        resource_id: params.data.id,
        unit_id: body.data.unit_id,
      });
      return fetchTruckAssignments(client, params.data.id, query.data.operating_company_id);
    });
    if (!result) return reply.code(404).send({ error: "mdata_driver_not_found" });
    if ("error" in result) return reply.code(404).send({ error: result.error });
    return result;
  });

  app.post("/api/v1/mdata/drivers/:id/clear-default-truck", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!isWriteRole(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = driverParamsSchema.safeParse(req.params ?? {});
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!params.success || !query.success) return reply.code(400).send({ error: "validation_error" });
    const result = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [query.data.operating_company_id]);
      const driverOk = await assertDriverScope(client, params.data.id, query.data.operating_company_id);
      if (!driverOk) return null;
      await client.query(
        `
          UPDATE telematics.vehicle_driver_assignments
          SET ended_at = now()
          WHERE driver_id = $1::uuid
            AND operating_company_id = $2::uuid
            AND is_default = true
            AND ended_at IS NULL
        `,
        [params.data.id, query.data.operating_company_id]
      );
      await appendCrudAudit(client, user.uuid, "mdata.driver.default_truck_cleared", {
        resource_id: params.data.id,
      });
      return fetchTruckAssignments(client, params.data.id, query.data.operating_company_id);
    });
    if (!result) return reply.code(404).send({ error: "mdata_driver_not_found" });
    return result;
  });
}

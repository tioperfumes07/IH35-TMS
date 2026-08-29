import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { setScopedCompanyContext } from "../_helpers/scoped-company-context.js";

const companyQuerySchema = z.object({ operating_company_id: z.string().uuid() });
const unitParamsSchema = z.object({ id: z.string().uuid() });
const setDefaultSchema = z.object({ driver_id: z.string().uuid() });
const clearDefaultSchema = z.object({ expected_driver_id: z.string().uuid() });

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function isWriteRole(role: string) {
  return role === "Owner" || role === "Administrator" || role === "Manager";
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

async function assertDriverScope(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<{ id: string }> }> },
  driverId: string,
  operatingCompanyId: string
) {
  const res = await client.query(
    `SELECT d.id::text
       FROM mdata.drivers d
      WHERE d.id = $1::uuid
        AND d.archived_at IS NULL
        AND (
          d.operating_company_id = $2::uuid
          OR EXISTS (
            SELECT 1 FROM mdata.driver_company_authorizations set_default_dca
             WHERE set_default_dca.driver_id = d.id
               AND set_default_dca.company_id = $2::uuid
               AND set_default_dca.is_authorized = true
               AND set_default_dca.deactivated_at IS NULL
          )
        )
      LIMIT 1`,
    [driverId, operatingCompanyId]
  );
  return res.rows[0]?.id ?? null;
}

function mapDriver(row: Record<string, unknown> | undefined, extra?: Record<string, unknown>) {
  if (!row) return null;
  return {
    id: String(row.id),
    name: [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || null,
    phone: row.phone ?? null,
    photo_url: row.photo_url ?? null,
    ...extra,
  };
}

async function fetchDriverAssignments(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> },
  unitId: string,
  operatingCompanyId: string
) {
  const defaultRes = await client.query(
    `
      SELECT d.id, d.first_name, d.last_name, d.phone, vda.started_at::text, vda.source, vda.is_default
      FROM telematics.vehicle_driver_assignments vda
      JOIN mdata.drivers d ON d.id = vda.driver_id
                           AND (d.operating_company_id = $2::uuid OR EXISTS (
                             SELECT 1 FROM mdata.driver_company_authorizations default_dca
                              WHERE default_dca.driver_id = d.id AND default_dca.company_id = $2::uuid
                                AND default_dca.is_authorized = true AND default_dca.deactivated_at IS NULL
                           ))
      WHERE vda.unit_id = $1::uuid
        AND vda.operating_company_id = $2::uuid
        AND vda.is_default = true
        AND vda.ended_at IS NULL
      ORDER BY vda.started_at DESC
      LIMIT 1
    `,
    [unitId, operatingCompanyId]
  );
  const currentRes = await client.query(
    `
      SELECT d.id, d.first_name, d.last_name, d.phone, vda.started_at::text AS logged_in_at, vda.source
      FROM telematics.vehicle_driver_assignments vda
      JOIN mdata.drivers d ON d.id = vda.driver_id
                           AND (d.operating_company_id = $2::uuid OR EXISTS (
                             SELECT 1 FROM mdata.driver_company_authorizations current_dca
                              WHERE current_dca.driver_id = d.id AND current_dca.company_id = $2::uuid
                                AND current_dca.is_authorized = true AND current_dca.deactivated_at IS NULL
                           ))
      WHERE vda.unit_id = $1::uuid
        AND vda.operating_company_id = $2::uuid
        AND vda.source = 'samsara_webhook'
        AND vda.ended_at IS NULL
      ORDER BY vda.started_at DESC
      LIMIT 1
    `,
    [unitId, operatingCompanyId]
  );
  const historyRes = await client.query(
    `
      SELECT vda.id::text, vda.source, vda.is_default, vda.started_at::text, vda.ended_at::text,
             d.id::text AS driver_id, d.first_name, d.last_name
      FROM telematics.vehicle_driver_assignments vda
      LEFT JOIN mdata.drivers d ON d.id = vda.driver_id
                                AND (d.operating_company_id = $2::uuid OR EXISTS (
                                  SELECT 1 FROM mdata.driver_company_authorizations history_dca
                                   WHERE history_dca.driver_id = d.id AND history_dca.company_id = $2::uuid
                                     AND history_dca.is_authorized = true AND history_dca.deactivated_at IS NULL
                                ))
      WHERE vda.unit_id = $1::uuid
        AND vda.operating_company_id = $2::uuid
      ORDER BY vda.started_at DESC
      LIMIT 25
    `,
    [unitId, operatingCompanyId]
  );
  return {
    default: mapDriver(defaultRes.rows[0], { source: defaultRes.rows[0]?.source }),
    current: mapDriver(currentRes.rows[0], {
      source: currentRes.rows[0]?.source,
      logged_in_at: currentRes.rows[0]?.logged_in_at,
    }),
    history: historyRes.rows,
  };
}

export async function registerUnitDefaultDriverRoutes(app: FastifyInstance) {
  app.get("/api/v1/mdata/units/:id/drivers/assignments", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = unitParamsSchema.safeParse(req.params ?? {});
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!params.success || !query.success) return reply.code(400).send({ error: "validation_error" });
    const payload = await withCurrentUser(user.uuid, async (client) => {
      await setScopedCompanyContext(client, user.uuid, query.data.operating_company_id);
      const unitOk = await assertUnitScope(client, params.data.id, query.data.operating_company_id);
      if (!unitOk) return null;
      return fetchDriverAssignments(client, params.data.id, query.data.operating_company_id);
    });
    if (!payload) return reply.code(404).send({ error: "mdata_unit_not_found" });
    return payload;
  });

  app.get("/api/v1/mdata/units/:id/current-driver", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = unitParamsSchema.safeParse(req.params ?? {});
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!params.success || !query.success) return reply.code(400).send({ error: "validation_error" });
    const payload = await withCurrentUser(user.uuid, async (client) => {
      await setScopedCompanyContext(client, user.uuid, query.data.operating_company_id);
      const unitOk = await assertUnitScope(client, params.data.id, query.data.operating_company_id);
      if (!unitOk) return null;
      const assignments = await fetchDriverAssignments(client, params.data.id, query.data.operating_company_id);
      return { current_driver: assignments.current };
    });
    if (!payload) return reply.code(404).send({ error: "mdata_unit_not_found" });
    return payload;
  });

  app.post("/api/v1/mdata/units/:id/drivers/default", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!isWriteRole(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = unitParamsSchema.safeParse(req.params ?? {});
    const query = companyQuerySchema.safeParse(req.query ?? {});
    const body = setDefaultSchema.safeParse(req.body ?? {});
    if (!params.success || !query.success || !body.success) {
      return reply.code(400).send({ error: "validation_error" });
    }
    const result = await withCurrentUser(user.uuid, async (client) => {
      await setScopedCompanyContext(client, user.uuid, query.data.operating_company_id);
      const unitOk = await assertUnitScope(client, params.data.id, query.data.operating_company_id);
      if (!unitOk) return null;
      const driverOk = await assertDriverScope(client, body.data.driver_id, query.data.operating_company_id);
      if (!driverOk) return { error: "mdata_driver_not_found" as const };
        await client.query(
          `UPDATE telematics.vehicle_driver_assignments
           SET ended_at = now()
           WHERE unit_id = $1::uuid
             AND operating_company_id = $2::uuid
             AND is_default = true
             AND ended_at IS NULL`,
          [params.data.id, query.data.operating_company_id]
        );
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO telematics.vehicle_driver_assignments (
             operating_company_id, unit_id, driver_id, started_at, source, is_default, created_by_user_uuid
           ) VALUES ($1,$2,$3,now(),'manual_override',true,$4)
           RETURNING id::text AS id`,
          [query.data.operating_company_id, params.data.id, body.data.driver_id, user.uuid]
        );
        const assignmentId = inserted.rows[0]?.id;
        if (!assignmentId) throw new Error("unit_default_driver_insert_failed");
        await appendCrudAudit(client, user.uuid, "mdata.unit.default_driver_set", {
          resource_id: params.data.id,
          operating_company_id: query.data.operating_company_id,
          driver_id: body.data.driver_id,
          assignment_id: assignmentId,
        });
      return fetchDriverAssignments(client, params.data.id, query.data.operating_company_id);
    });
    if (!result) return reply.code(404).send({ error: "mdata_unit_not_found" });
    if ("error" in result) return reply.code(404).send({ error: result.error });
    return result;
  });

  app.post("/api/v1/mdata/units/:id/drivers/clear-default", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!isWriteRole(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = unitParamsSchema.safeParse(req.params ?? {});
    const query = companyQuerySchema.safeParse(req.query ?? {});
    const body = clearDefaultSchema.safeParse(req.body ?? {});
    if (!params.success || !query.success || !body.success) return reply.code(400).send({ error: "validation_error" });
    const result = await withCurrentUser(user.uuid, async (client) => {
      await setScopedCompanyContext(client, user.uuid, query.data.operating_company_id);
      const unitOk = await assertUnitScope(client, params.data.id, query.data.operating_company_id);
      if (!unitOk) return null;
      const cleared = await client.query(
        `
          UPDATE telematics.vehicle_driver_assignments
          SET ended_at = now()
          WHERE unit_id = $1::uuid
            AND operating_company_id = $2::uuid
            AND driver_id = $3::uuid
            AND is_default = true
            AND ended_at IS NULL
          RETURNING id::text
        `,
        [params.data.id, query.data.operating_company_id, body.data.expected_driver_id]
      );
      if (!cleared.rows[0]) return { conflict: true as const };
      await appendCrudAudit(client, user.uuid, "mdata.unit.default_driver_cleared", {
        resource_id: params.data.id,
        driver_id: body.data.expected_driver_id,
      });
      return fetchDriverAssignments(client, params.data.id, query.data.operating_company_id);
    });
    if (!result) return reply.code(404).send({ error: "mdata_unit_not_found" });
    if ("conflict" in result) return reply.code(409).send({ error: "default_driver_changed" });
    return result;
  });
}

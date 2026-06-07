import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../../../audit/crud-audit.js";
import { withCurrentUser } from "../../../auth/db.js";
import { requireAuth } from "../../../auth/session-middleware.js";
import {
  assertUnitScope,
  createUnitPermit,
  listUnitPermits,
  PERMIT_TYPES,
  scanUnitPermitExpiries,
  softDeleteUnitPermit,
  updateUnitPermit,
} from "./service.js";

const companyQuerySchema = z.object({ operating_company_id: z.string().uuid() });
const unitParamsSchema = z.object({ unit_uuid: z.string().uuid() });
const permitParamsSchema = z.object({ unit_uuid: z.string().uuid(), uuid: z.string().uuid() });

const createPermitSchema = z.object({
  permit_type: z.enum(PERMIT_TYPES),
  issuing_state: z.string().trim().min(1).max(8),
  permit_number: z.string().trim().min(1).max(80),
  effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  expiration_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cost: z.number().nonnegative().optional(),
  notes: z.string().trim().max(4000).optional(),
  pdf_evidence_uuid: z.string().uuid().optional(),
});

const patchPermitSchema = z
  .object({
    permit_type: z.enum(PERMIT_TYPES).optional(),
    issuing_state: z.string().trim().min(1).max(8).optional(),
    permit_number: z.string().trim().min(1).max(80).optional(),
    effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    expiration_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    cost: z.number().nonnegative().nullable().optional(),
    notes: z.string().trim().max(4000).nullable().optional(),
    pdf_evidence_uuid: z.string().uuid().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "at least one field is required" });

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function isWriteRole(role: string) {
  return role === "Owner" || role === "Administrator" || role === "Manager";
}

export async function registerUnitPermitsRoutes(app: FastifyInstance) {
  app.get("/api/units/:unit_uuid/permits", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = unitParamsSchema.safeParse(req.params ?? {});
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!params.success || !query.success) return reply.code(400).send({ error: "validation_error" });

    const result = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [query.data.operating_company_id]);
      const unitOk = await assertUnitScope(client, params.data.unit_uuid, query.data.operating_company_id);
      if (!unitOk) return null;
      const permits = await listUnitPermits(client, params.data.unit_uuid, query.data.operating_company_id);
      const expiry_alerts = await scanUnitPermitExpiries(client, query.data.operating_company_id);
      return {
        permits,
        expiry_alerts: expiry_alerts.filter((a) => a.unit_uuid === params.data.unit_uuid),
      };
    });
    if (!result) return reply.code(404).send({ error: "unit_not_found" });
    return result;
  });

  app.post("/api/units/:unit_uuid/permits", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!isWriteRole(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = unitParamsSchema.safeParse(req.params ?? {});
    const query = companyQuerySchema.safeParse(req.query ?? {});
    const body = createPermitSchema.safeParse(req.body ?? {});
    if (!params.success || !query.success || !body.success) {
      return reply.code(400).send({ error: "validation_error" });
    }

    const created = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [query.data.operating_company_id]);
      const unitOk = await assertUnitScope(client, params.data.unit_uuid, query.data.operating_company_id);
      if (!unitOk) return null;
      const row = await createUnitPermit(client, params.data.unit_uuid, query.data.operating_company_id, body.data);
      await appendCrudAudit(client, user.uuid, "master_data.unit_permits.created", {
        resource_id: row.uuid,
        unit_uuid: params.data.unit_uuid,
      });
      return row;
    });
    if (!created) return reply.code(404).send({ error: "unit_not_found" });
    return reply.code(201).send(created);
  });

  app.patch("/api/units/:unit_uuid/permits/:uuid", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!isWriteRole(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = permitParamsSchema.safeParse(req.params ?? {});
    const query = companyQuerySchema.safeParse(req.query ?? {});
    const body = patchPermitSchema.safeParse(req.body ?? {});
    if (!params.success || !query.success || !body.success) {
      return reply.code(400).send({ error: "validation_error" });
    }

    const updated = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [query.data.operating_company_id]);
      const row = await updateUnitPermit(
        client,
        params.data.unit_uuid,
        params.data.uuid,
        query.data.operating_company_id,
        body.data
      );
      if (!row) return null;
      await appendCrudAudit(client, user.uuid, "master_data.unit_permits.updated", {
        resource_id: row.uuid,
        unit_uuid: params.data.unit_uuid,
        changes: body.data,
      });
      return row;
    });
    if (!updated) return reply.code(404).send({ error: "unit_permit_not_found" });
    return updated;
  });

  app.delete("/api/units/:unit_uuid/permits/:uuid", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!isWriteRole(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = permitParamsSchema.safeParse(req.params ?? {});
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!params.success || !query.success) return reply.code(400).send({ error: "validation_error" });

    const deleted = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [query.data.operating_company_id]);
      const ok = await softDeleteUnitPermit(
        client,
        params.data.unit_uuid,
        params.data.uuid,
        query.data.operating_company_id
      );
      if (!ok) return null;
      await appendCrudAudit(client, user.uuid, "master_data.unit_permits.soft_deleted", {
        resource_id: params.data.uuid,
        unit_uuid: params.data.unit_uuid,
      });
      return { ok: true, uuid: params.data.uuid };
    });
    if (!deleted) return reply.code(404).send({ error: "unit_permit_not_found" });
    return deleted;
  });
}

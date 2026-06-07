import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../../../audit/crud-audit.js";
import { withCurrentUser } from "../../../auth/db.js";
import { requireAuth } from "../../../auth/session-middleware.js";
import {
  assertUnitScope,
  createUnitTollTag,
  isLowBalance,
  listUnitTollTags,
  softDeleteUnitTollTag,
  TAG_NETWORKS,
  updateUnitTollTag,
} from "./service.js";

const companyQuerySchema = z.object({ operating_company_id: z.string().uuid() });
const unitParamsSchema = z.object({ unit_uuid: z.string().uuid() });
const tagParamsSchema = z.object({ unit_uuid: z.string().uuid(), uuid: z.string().uuid() });

const createTagSchema = z.object({
  tag_network: z.enum(TAG_NETWORKS),
  tag_number: z.string().trim().min(1).max(80),
  activated_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  deactivated_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  monthly_fee: z.number().nonnegative().optional(),
  balance_current: z.number().optional(),
  auto_replenish: z.boolean().optional(),
  notes: z.string().trim().max(4000).optional(),
});

const patchTagSchema = z
  .object({
    tag_network: z.enum(TAG_NETWORKS).optional(),
    tag_number: z.string().trim().min(1).max(80).optional(),
    activated_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    deactivated_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    monthly_fee: z.number().nonnegative().nullable().optional(),
    balance_current: z.number().nullable().optional(),
    auto_replenish: z.boolean().optional(),
    notes: z.string().trim().max(4000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "at least one field is required" });

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function isWriteRole(role: string) {
  return role === "Owner" || role === "Administrator" || role === "Manager";
}

export async function registerUnitTollTagsRoutes(app: FastifyInstance) {
  app.get("/api/units/:unit_uuid/toll-tags", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = unitParamsSchema.safeParse(req.params ?? {});
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!params.success || !query.success) return reply.code(400).send({ error: "validation_error" });

    const result = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [query.data.operating_company_id]);
      const unitOk = await assertUnitScope(client, params.data.unit_uuid, query.data.operating_company_id);
      if (!unitOk) return null;
      const toll_tags = await listUnitTollTags(client, params.data.unit_uuid, query.data.operating_company_id);
      return {
        toll_tags,
        low_balance_tags: toll_tags.filter((tag) => isLowBalance(tag.balance_current) && !tag.deactivated_at),
      };
    });
    if (!result) return reply.code(404).send({ error: "unit_not_found" });
    return result;
  });

  app.post("/api/units/:unit_uuid/toll-tags", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!isWriteRole(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = unitParamsSchema.safeParse(req.params ?? {});
    const query = companyQuerySchema.safeParse(req.query ?? {});
    const body = createTagSchema.safeParse(req.body ?? {});
    if (!params.success || !query.success || !body.success) {
      return reply.code(400).send({ error: "validation_error" });
    }

    const created = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [query.data.operating_company_id]);
      const unitOk = await assertUnitScope(client, params.data.unit_uuid, query.data.operating_company_id);
      if (!unitOk) return null;
      const row = await createUnitTollTag(client, params.data.unit_uuid, query.data.operating_company_id, body.data);
      await appendCrudAudit(client, user.uuid, "master_data.unit_toll_tags.created", {
        resource_id: row.uuid,
        unit_uuid: params.data.unit_uuid,
      });
      return row;
    });
    if (!created) return reply.code(404).send({ error: "unit_not_found" });
    return reply.code(201).send(created);
  });

  app.patch("/api/units/:unit_uuid/toll-tags/:uuid", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!isWriteRole(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = tagParamsSchema.safeParse(req.params ?? {});
    const query = companyQuerySchema.safeParse(req.query ?? {});
    const body = patchTagSchema.safeParse(req.body ?? {});
    if (!params.success || !query.success || !body.success) {
      return reply.code(400).send({ error: "validation_error" });
    }

    const updated = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [query.data.operating_company_id]);
      const row = await updateUnitTollTag(
        client,
        params.data.unit_uuid,
        params.data.uuid,
        query.data.operating_company_id,
        body.data
      );
      if (!row) return null;
      await appendCrudAudit(client, user.uuid, "master_data.unit_toll_tags.updated", {
        resource_id: row.uuid,
        unit_uuid: params.data.unit_uuid,
        changes: body.data,
      });
      return row;
    });
    if (!updated) return reply.code(404).send({ error: "unit_toll_tag_not_found" });
    return updated;
  });

  app.delete("/api/units/:unit_uuid/toll-tags/:uuid", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!isWriteRole(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = tagParamsSchema.safeParse(req.params ?? {});
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!params.success || !query.success) return reply.code(400).send({ error: "validation_error" });

    const deleted = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [query.data.operating_company_id]);
      const ok = await softDeleteUnitTollTag(
        client,
        params.data.unit_uuid,
        params.data.uuid,
        query.data.operating_company_id
      );
      if (!ok) return null;
      await appendCrudAudit(client, user.uuid, "master_data.unit_toll_tags.soft_deleted", {
        resource_id: params.data.uuid,
        unit_uuid: params.data.unit_uuid,
      });
      return { ok: true, uuid: params.data.uuid };
    });
    if (!deleted) return reply.code(404).send({ error: "unit_toll_tag_not_found" });
    return deleted;
  });
}

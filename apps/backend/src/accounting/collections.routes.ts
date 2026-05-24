import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError } from "./shared.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import {
  getCollectionTask,
  listCollectionTasks,
  logCollectionContact,
  resolveCollectionTask,
  syncCollectionTasks,
  type CollectionAgingBucket,
  type CollectionContactType,
  type CollectionTaskResolution,
} from "./collections.service.js";

const collectionReadRoles = new Set(["Owner", "Administrator", "Manager", "Accountant"]);

const listCollectionsQuerySchema = companyQuerySchema.extend({
  bucket: z.enum(["current", "1_30", "31_60", "61_90", "91_plus"]).optional(),
  owner: z.string().uuid().or(z.literal("unassigned")).optional(),
});

const taskParamSchema = z.object({
  taskId: z.string().uuid(),
});

const contactBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  contact_type: z.enum(["call", "email", "letter", "sms"]),
  notes: z.string().trim().min(1).max(4000),
  next_action_date: z.string().date().optional(),
});

const resolveBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  resolution: z.enum(["paid", "disputed", "written_off"]),
});

const syncBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  thresholds_days: z.array(z.coerce.number().int().min(1).max(365)).max(8).optional(),
});

function collectionsReader(req: Parameters<typeof currentAuthUser>[0], reply: Parameters<typeof currentAuthUser>[1]) {
  const user = currentAuthUser(req, reply);
  if (!user) return null;
  if (!collectionReadRoles.has(String(user.role ?? ""))) {
    reply.code(403).send({ error: "forbidden" });
    return null;
  }
  return user;
}

export async function registerCollectionsRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/collections", async (req, reply) => {
    const user = collectionsReader(req, reply);
    if (!user) return;

    const query = listCollectionsQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    await assertCompanyMembership(user.uuid, query.data.operating_company_id);

    const result = await listCollectionTasks({
      userId: user.uuid,
      operatingCompanyId: query.data.operating_company_id,
      bucket: query.data.bucket as CollectionAgingBucket | undefined,
      owner: query.data.owner,
    });
    return reply.code(200).send(result);
  });

  app.get("/api/v1/accounting/collections/:taskId", async (req, reply) => {
    const user = collectionsReader(req, reply);
    if (!user) return;
    const params = taskParamSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const detail = await getCollectionTask({
      userId: user.uuid,
      operatingCompanyId: query.data.operating_company_id,
      taskId: params.data.taskId,
    });
    if (!detail) return reply.code(404).send({ error: "collection_task_not_found" });
    return reply.code(200).send(detail);
  });

  app.post("/api/v1/accounting/collections/:taskId/contact", async (req, reply) => {
    const user = collectionsReader(req, reply);
    if (!user) return;
    const params = taskParamSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const body = contactBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const contact = await logCollectionContact({
      userId: user.uuid,
      operatingCompanyId: body.data.operating_company_id,
      taskId: params.data.taskId,
      contactType: body.data.contact_type as CollectionContactType,
      notes: body.data.notes,
      nextActionDate: body.data.next_action_date,
    });
    if (!contact) return reply.code(404).send({ error: "collection_task_not_found" });
    return reply.code(200).send({ contact });
  });

  app.post("/api/v1/accounting/collections/:taskId/resolve", async (req, reply) => {
    const user = collectionsReader(req, reply);
    if (!user) return;
    const params = taskParamSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const body = resolveBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const resolved = await resolveCollectionTask({
      userId: user.uuid,
      operatingCompanyId: body.data.operating_company_id,
      taskId: params.data.taskId,
      resolution: body.data.resolution as CollectionTaskResolution,
    });
    if (!resolved) return reply.code(404).send({ error: "collection_task_not_found" });
    return reply.code(200).send(resolved);
  });

  app.post("/api/v1/accounting/collections/sync", async (req, reply) => {
    const user = collectionsReader(req, reply);
    if (!user) return;
    const body = syncBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const result = await syncCollectionTasks({
      operatingCompanyId: body.data.operating_company_id,
      actorUserId: user.uuid,
      thresholdsDays: body.data.thresholds_days,
    });
    return reply.code(200).send(result);
  });
}


export default fp(async (app) => {
  await registerCollectionsRoutes(app);
}, { name: "accounting.registerCollectionsRoutes" });

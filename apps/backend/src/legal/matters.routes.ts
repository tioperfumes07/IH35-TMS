import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { PoolClient } from "pg";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";
import {
  addMatterDeadlineRow,
  addMatterDocumentRow,
  addMatterEventRow,
  canAccessLegalMattersOffice,
  canManageLegalMatters,
  closeMatter,
  closeMatterSchema,
  completeMatterDeadline,
  createMatter,
  getMatter,
  getMatterDocumentForDownload,
  legalMattersReportsSummary,
  listMatters,
  matterCreateSchema,
  matterDeadlineSchema,
  matterEventSchema,
  matterUpdateSchema,
  updateMatter,
} from "./matters.service.js";

const operatingCompanyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const listQuerySchema = operatingCompanyQuerySchema.extend({
  status: z.string().trim().optional(),
  severity: z.string().trim().optional(),
  type: z.string().trim().optional(),
  related_driver_id: z.string().uuid().optional(),
});

const matterIdParamsSchema = z.object({
  id: z.string().uuid(),
});

const documentIdParamsSchema = z.object({
  id: z.string().uuid(),
  documentId: z.string().uuid(),
});

const deadlineCompleteParamsSchema = z.object({
  id: z.string().uuid(),
  deadline_id: z.string().uuid(),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

async function withCompanyScope<T>(userId: string, operatingCompanyId: string, fn: (client: PoolClient) => Promise<T>) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    return fn(client);
  });
}

export async function registerLegalMattersRoutes(app: FastifyInstance) {
  app.get("/api/v1/legal/matters/reports/summary", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!canAccessLegalMattersOffice(String(authUser.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const parsed = operatingCompanyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);
    const summary = await withCompanyScope(authUser.uuid, parsed.data.operating_company_id, async (client) =>
      legalMattersReportsSummary(client, parsed.data.operating_company_id)
    );
    return summary;
  });

  app.get("/api/v1/legal/matters", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!canAccessLegalMattersOffice(String(authUser.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const parsed = listQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);
    const rows = await withCompanyScope(authUser.uuid, parsed.data.operating_company_id, async (client) =>
      listMatters(client, {
        operatingCompanyId: parsed.data.operating_company_id,
        status: parsed.data.status,
        severity: parsed.data.severity,
        type: parsed.data.type,
        related_driver_id: parsed.data.related_driver_id,
        requesterUserId: authUser.uuid,
        requesterRole: String(authUser.role ?? ""),
      })
    );
    return { matters: rows };
  });

  app.get("/api/v1/legal/matters/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!canAccessLegalMattersOffice(String(authUser.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const p = matterIdParamsSchema.safeParse(req.params ?? {});
    if (!p.success) return sendValidationError(reply, p.error);
    const q = operatingCompanyQuerySchema.safeParse(req.query ?? {});
    if (!q.success) return sendValidationError(reply, q.error);
    const detail = await withCompanyScope(authUser.uuid, q.data.operating_company_id, async (client) =>
      getMatter(client, {
        operatingCompanyId: q.data.operating_company_id,
        matterId: p.data.id,
        requesterUserId: authUser.uuid,
        requesterRole: String(authUser.role ?? ""),
      })
    );
    if (!detail) return reply.code(404).send({ error: "matter_not_found" });
    return detail;
  });

  app.get("/api/v1/legal/matters/:id/documents/:documentId/download", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!canAccessLegalMattersOffice(String(authUser.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const p = documentIdParamsSchema.safeParse(req.params ?? {});
    if (!p.success) return sendValidationError(reply, p.error);
    const q = operatingCompanyQuerySchema.safeParse(req.query ?? {});
    if (!q.success) return sendValidationError(reply, q.error);
    const result = await withCompanyScope(authUser.uuid, q.data.operating_company_id, async (client) =>
      getMatterDocumentForDownload(client, {
        operatingCompanyId: q.data.operating_company_id,
        matterId: p.data.id,
        documentId: p.data.documentId,
        requesterUserId: authUser.uuid,
        requesterRole: String(authUser.role ?? ""),
      })
    );
    if (!result) return reply.code(404).send({ error: "not_found" });
    if ("error" in result && result.error === "forbidden_privileged") return reply.code(403).send({ error: result.error });
    if ("error" in result && result.error === "r2_not_configured") return reply.code(503).send({ error: result.error });
    return result;
  });

  app.post("/api/v1/legal/matters", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!canManageLegalMatters(String(authUser.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const q = operatingCompanyQuerySchema.safeParse(req.query ?? {});
    if (!q.success) return sendValidationError(reply, q.error);
    const body = matterCreateSchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    try {
      const row = await withCompanyScope(authUser.uuid, q.data.operating_company_id, async (client) =>
        createMatter(client, {
          operatingCompanyId: q.data.operating_company_id,
          actorUserId: authUser.uuid,
          body: body.data,
        })
      );
      return reply.code(201).send({ matter: row });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("unique") || msg.includes("duplicate")) {
        return reply.code(409).send({ error: "matter_number_conflict" });
      }
      throw err;
    }
  });

  app.patch("/api/v1/legal/matters/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!canManageLegalMatters(String(authUser.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const p = matterIdParamsSchema.safeParse(req.params ?? {});
    if (!p.success) return sendValidationError(reply, p.error);
    const q = operatingCompanyQuerySchema.safeParse(req.query ?? {});
    if (!q.success) return sendValidationError(reply, q.error);
    const body = matterUpdateSchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    const row = await withCompanyScope(authUser.uuid, q.data.operating_company_id, async (client) =>
      updateMatter(client, {
        operatingCompanyId: q.data.operating_company_id,
        matterId: p.data.id,
        actorUserId: authUser.uuid,
        body: body.data,
      })
    );
    if (!row) return reply.code(404).send({ error: "matter_not_found" });
    return { matter: row };
  });

  app.post("/api/v1/legal/matters/:id/close", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!canManageLegalMatters(String(authUser.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const p = matterIdParamsSchema.safeParse(req.params ?? {});
    if (!p.success) return sendValidationError(reply, p.error);
    const q = operatingCompanyQuerySchema.safeParse(req.query ?? {});
    if (!q.success) return sendValidationError(reply, q.error);
    const body = closeMatterSchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    const result = await withCompanyScope(authUser.uuid, q.data.operating_company_id, async (client) =>
      closeMatter(client, {
        operatingCompanyId: q.data.operating_company_id,
        matterId: p.data.id,
        actorUserId: authUser.uuid,
        body: body.data,
      })
    );
    if (result === null) return reply.code(404).send({ error: "matter_not_found" });
    if ("error" in result) return reply.code(409).send({ error: result.error });
    return result;
  });

  app.post("/api/v1/legal/matters/:id/events", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!canManageLegalMatters(String(authUser.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const p = matterIdParamsSchema.safeParse(req.params ?? {});
    if (!p.success) return sendValidationError(reply, p.error);
    const q = operatingCompanyQuerySchema.safeParse(req.query ?? {});
    if (!q.success) return sendValidationError(reply, q.error);
    const body = matterEventSchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    await withCompanyScope(authUser.uuid, q.data.operating_company_id, async (client) =>
      addMatterEventRow(client, {
        operatingCompanyId: q.data.operating_company_id,
        matterId: p.data.id,
        actorUserId: authUser.uuid,
        body: body.data,
      })
    );
    return { ok: true };
  });

  app.post("/api/v1/legal/matters/:id/documents", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!canManageLegalMatters(String(authUser.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const p = matterIdParamsSchema.safeParse(req.params ?? {});
    if (!p.success) return sendValidationError(reply, p.error);
    const q = operatingCompanyQuerySchema.safeParse(req.query ?? {});
    if (!q.success) return sendValidationError(reply, q.error);
    let title = "";
    let isPrivileged = false;
    let buffer: Buffer | null = null;
    let contentType = "application/octet-stream";
    const parts = req.parts();
    for await (const part of parts) {
      if (part.type === "file") {
        buffer = await part.toBuffer();
        contentType = part.mimetype || contentType;
        if (!title && part.filename) title = part.filename;
      } else if (part.type === "field") {
        if (part.fieldname === "title") title = String(part.value ?? "").trim();
        if (part.fieldname === "is_privileged") isPrivileged = String(part.value).toLowerCase() === "true" || part.value === true;
      }
    }
    if (!buffer || buffer.length < 1) return reply.code(400).send({ error: "file_required" });
    if (!title) return reply.code(400).send({ error: "title_required" });
    try {
      const row = await withCompanyScope(authUser.uuid, q.data.operating_company_id, async (client) =>
        addMatterDocumentRow(client, {
          operatingCompanyId: q.data.operating_company_id,
          matterId: p.data.id,
          actorUserId: authUser.uuid,
          title,
          isPrivileged,
          buffer,
          contentType,
        })
      );
      return reply.code(201).send({ document: row });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("r2_not_configured")) return reply.code(503).send({ error: "r2_not_configured" });
      throw err;
    }
  });

  app.post("/api/v1/legal/matters/:id/deadlines", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!canManageLegalMatters(String(authUser.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const p = matterIdParamsSchema.safeParse(req.params ?? {});
    if (!p.success) return sendValidationError(reply, p.error);
    const q = operatingCompanyQuerySchema.safeParse(req.query ?? {});
    if (!q.success) return sendValidationError(reply, q.error);
    const body = matterDeadlineSchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    const row = await withCompanyScope(authUser.uuid, q.data.operating_company_id, async (client) =>
      addMatterDeadlineRow(client, {
        operatingCompanyId: q.data.operating_company_id,
        matterId: p.data.id,
        actorUserId: authUser.uuid,
        body: body.data,
      })
    );
    return reply.code(201).send({ deadline: row });
  });

  app.patch("/api/v1/legal/matters/:id/deadlines/:deadline_id/complete", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!canManageLegalMatters(String(authUser.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const p = deadlineCompleteParamsSchema.safeParse(req.params ?? {});
    if (!p.success) return sendValidationError(reply, p.error);
    const q = operatingCompanyQuerySchema.safeParse(req.query ?? {});
    if (!q.success) return sendValidationError(reply, q.error);
    const row = await withCompanyScope(authUser.uuid, q.data.operating_company_id, async (client) =>
      completeMatterDeadline(client, {
        operatingCompanyId: q.data.operating_company_id,
        matterId: p.data.id,
        deadlineId: p.data.deadline_id,
        actorUserId: authUser.uuid,
      })
    );
    if (!row) return reply.code(404).send({ error: "deadline_not_found" });
    return { deadline: row };
  });
}

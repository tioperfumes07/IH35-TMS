import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { PoolClient } from "pg";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";
import {
  addMatterDeadlineRow,
  addMatterDocumentRow,
  addMatterEventRow,
  closeMatter,
  closeMatterSchema,
  completeMatterDeadline,
  createMatter,
  getMatter,
  getMatterDocumentForDownload,
  LEGAL_MATTERS_MANAGE_ROLES,
  LEGAL_MATTERS_READ_ROLES,
  legalMattersReportsSummary,
  listMatters,
  matterCreateSchema,
  matterDeadlineSchema,
  matterEventSchema,
  matterUpdateSchema,
  updateMatter,
} from "./matters.service.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const operatingCompanyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const listQuerySchema = operatingCompanyQuerySchema.extend({
  status: z.string().trim().optional(),
  severity: z.string().trim().optional(),
  type: z.string().trim().optional(),
  related_driver_id: z.string().uuid().optional(),
  unit_id: z.string().uuid().optional(),
  equipment_id: z.string().uuid().optional(),
  insurance_claim_id: z.string().uuid().optional(),
  insurance_lawsuit_id: z.string().uuid().optional(),
  // CLS-SILENT-CAP — caller-controlled paging. Bounded at 500 (the old hard cap) so this cannot
  // become an unbounded scan, and defaulted to 200 so existing callers get a sane page.
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
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

// Legal matters hold litigation evidence — gate every handler on role, the same way other sensitive
// routes do (docs/files.routes.ts). Reads: office roles; writes: Owner/Administrator only.
function requireRole(reply: FastifyReply, role: string, allowed: readonly string[]) {
  if (!allowed.includes(role)) {
    reply.code(403).send({ error: "forbidden" });
    return false;
  }
  return true;
}

async function withCompanyScope<T>(userId: string, operatingCompanyId: string, fn: (client: PoolClient) => Promise<T>) {
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    return fn(client);
  });
}

export async function registerLegalMattersRoutes(app: FastifyInstance) {
  app.get("/api/v1/legal/matters/reports/summary", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return reply;
    if (!requireRole(reply, String(authUser.role ?? ""), LEGAL_MATTERS_READ_ROLES)) return;
    const parsed = operatingCompanyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);
    const summary = await withCompanyScope(authUser.uuid, parsed.data.operating_company_id, async (client) =>
      legalMattersReportsSummary(client, parsed.data.operating_company_id)
    );
    return summary;
  });

  app.get(
    "/api/v1/legal/matters",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return reply;
    if (!requireRole(reply, String(authUser.role ?? ""), LEGAL_MATTERS_READ_ROLES)) return;
    const parsed = listQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);
    const page = await withCompanyScope(authUser.uuid, parsed.data.operating_company_id, async (client) =>
      listMatters(client, {
        operatingCompanyId: parsed.data.operating_company_id,
        status: parsed.data.status,
        severity: parsed.data.severity,
        type: parsed.data.type,
        related_driver_id: parsed.data.related_driver_id,
        unit_id: parsed.data.unit_id,
        equipment_id: parsed.data.equipment_id,
        insurance_claim_id: parsed.data.insurance_claim_id,
        insurance_lawsuit_id: parsed.data.insurance_lawsuit_id,
        requesterUserId: authUser.uuid,
        requesterRole: String(authUser.role ?? ""),
        limit: parsed.data.limit,
        offset: parsed.data.offset,
      })
    );
    // CLS-SILENT-CAP — return total/limit/offset alongside the rows so a consumer can page or say
    // "showing N of M". `matters` keeps its existing shape so current callers are unaffected.
    return { matters: page.rows, total: page.total, limit: page.limit, offset: page.offset };
    }
  );

  app.get("/api/v1/legal/matters/:id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return reply;
    if (!requireRole(reply, String(authUser.role ?? ""), LEGAL_MATTERS_READ_ROLES)) return;
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

  app.get("/api/v1/legal/matters/:id/documents/:documentId/download", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return reply;
    if (!requireRole(reply, String(authUser.role ?? ""), LEGAL_MATTERS_READ_ROLES)) return;
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

  app.post(
    "/api/v1/legal/matters",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return reply;
    if (!requireRole(reply, String(authUser.role ?? ""), LEGAL_MATTERS_MANAGE_ROLES)) return;
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
      if ((err as { code?: string }).code === "linked_entity_not_in_operating_company") {
        return reply.code(400).send({ error: "linked_entity_not_in_operating_company" });
      }
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("unique") || msg.includes("duplicate")) {
        return reply.code(409).send({ error: "matter_number_conflict" });
      }
      throw err;
    }
    }
  );

  app.patch(
    "/api/v1/legal/matters/:id",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return reply;
    if (!requireRole(reply, String(authUser.role ?? ""), LEGAL_MATTERS_MANAGE_ROLES)) return;
    const p = matterIdParamsSchema.safeParse(req.params ?? {});
    if (!p.success) return sendValidationError(reply, p.error);
    const q = operatingCompanyQuerySchema.safeParse(req.query ?? {});
    if (!q.success) return sendValidationError(reply, q.error);
    const body = matterUpdateSchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    let row: Awaited<ReturnType<typeof updateMatter>> | undefined;
    try {
      row = await withCompanyScope(authUser.uuid, q.data.operating_company_id, async (client) =>
        updateMatter(client, {
          operatingCompanyId: q.data.operating_company_id,
          matterId: p.data.id,
          actorUserId: authUser.uuid,
          body: body.data,
        })
      );
    } catch (err: unknown) {
      if ((err as { code?: string }).code === "linked_entity_not_in_operating_company") {
        return reply.code(400).send({ error: "linked_entity_not_in_operating_company" });
      }
      throw err;
    }
    if (!row) return reply.code(404).send({ error: "matter_not_found" });
    return { matter: row };
    }
  );

  app.post("/api/v1/legal/matters/:id/close", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return reply;
    if (!requireRole(reply, String(authUser.role ?? ""), LEGAL_MATTERS_MANAGE_ROLES)) return;
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

  app.post("/api/v1/legal/matters/:id/events", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return reply;
    if (!requireRole(reply, String(authUser.role ?? ""), LEGAL_MATTERS_MANAGE_ROLES)) return;
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

  app.post("/api/v1/legal/matters/:id/documents", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return reply;
    if (!requireRole(reply, String(authUser.role ?? ""), LEGAL_MATTERS_MANAGE_ROLES)) return;
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

  app.post("/api/v1/legal/matters/:id/deadlines", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return reply;
    if (!requireRole(reply, String(authUser.role ?? ""), LEGAL_MATTERS_MANAGE_ROLES)) return;
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

  app.patch("/api/v1/legal/matters/:id/deadlines/:deadline_id/complete", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return reply;
    if (!requireRole(reply, String(authUser.role ?? ""), LEGAL_MATTERS_MANAGE_ROLES)) return;
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

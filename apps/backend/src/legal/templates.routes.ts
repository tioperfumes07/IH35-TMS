import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";
import {
  approveTemplate,
  createTemplate,
  getTemplate,
  legalTemplateDraftSchema,
  legalTemplateUpdateSchema,
  listTemplates,
  listVersions,
  remintAttorneyReviewLink,
  retireTemplate,
  submitForAttorneyReview,
  activateTemplate,
  updateTemplate,
} from "./templates.service.js";

const officeRoles = new Set(["Owner", "Administrator", "Manager", "Accountant", "Dispatcher", "Safety", "Mechanic"]);
const adminWriteRoles = new Set(["Owner", "Administrator"]);

const operatingCompanyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const listQuerySchema = operatingCompanyQuerySchema.extend({
  category: z.string().trim().min(1).max(120).optional(),
  language: z.enum(["en", "es", "bilingual"]).optional(),
  status: z.enum(["draft", "pending_review", "approved", "active", "retired"]).optional(),
  search: z.string().trim().min(1).max(120).optional(),
});

const templateIdParamSchema = z.object({
  id: z.string().uuid(),
});

const templateDetailQuerySchema = operatingCompanyQuerySchema.extend({
  version: z.coerce.number().int().min(1).optional(),
});

const listVersionsQuerySchema = operatingCompanyQuerySchema.extend({
  template_code: z.string().trim().min(1).max(120),
});

const approveBodySchema = z.object({
  attorney_name: z.string().trim().min(2).max(200),
  bar_number: z.string().trim().min(2).max(120),
  notes: z.string().trim().max(2000).optional(),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function requireOfficeReadRole(reply: FastifyReply, role: string) {
  if (!officeRoles.has(role)) {
    reply.code(403).send({ error: "forbidden" });
    return false;
  }
  return true;
}

function requireAdminWriteRole(reply: FastifyReply, role: string) {
  if (!adminWriteRoles.has(role)) {
    reply.code(403).send({ error: "forbidden" });
    return false;
  }
  return true;
}

async function setOperatingCompany(client: { query: (sql: string) => Promise<unknown> }, operatingCompanyId: string) {
  await client.query(`SET LOCAL app.operating_company_id = '${operatingCompanyId}'`);
}

export async function registerLegalTemplateRoutes(app: FastifyInstance) {
  app.get("/api/v1/legal/templates", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!requireOfficeReadRole(reply, String(authUser.role ?? ""))) return;

    const parsedQuery = listQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);
    const query = parsedQuery.data;

    const rows = await withCurrentUser(authUser.uuid, async (client) => {
      await setOperatingCompany(client, query.operating_company_id);
      return listTemplates(client, {
        operatingCompanyId: query.operating_company_id,
        category: query.category,
        language: query.language,
        status: query.status,
        search: query.search,
      });
    });

    return { templates: rows };
  });

  app.get("/api/v1/legal/templates/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!requireOfficeReadRole(reply, String(authUser.role ?? ""))) return;

    const parsedParams = templateIdParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedQuery = templateDetailQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

    const detail = await withCurrentUser(authUser.uuid, async (client) => {
      await setOperatingCompany(client, parsedQuery.data.operating_company_id);
      return getTemplate(client, {
        operatingCompanyId: parsedQuery.data.operating_company_id,
        id: parsedParams.data.id,
        version: parsedQuery.data.version,
      });
    });
    if (!detail) return reply.code(404).send({ error: "legal_template_not_found" });
    return detail;
  });

  app.get("/api/v1/legal/templates/versions/list", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!requireOfficeReadRole(reply, String(authUser.role ?? ""))) return;

    const parsedQuery = listVersionsQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

    const rows = await withCurrentUser(authUser.uuid, async (client) => {
      await setOperatingCompany(client, parsedQuery.data.operating_company_id);
      return listVersions(client, {
        operatingCompanyId: parsedQuery.data.operating_company_id,
        templateCode: parsedQuery.data.template_code,
      });
    });
    return { versions: rows };
  });

  app.post("/api/v1/legal/templates", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!requireAdminWriteRole(reply, String(authUser.role ?? ""))) return;

    const parsedQuery = operatingCompanyQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);
    const parsedBody = legalTemplateDraftSchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

    const created = await withCurrentUser(authUser.uuid, async (client) => {
      await setOperatingCompany(client, parsedQuery.data.operating_company_id);
      return createTemplate(client, {
        operatingCompanyId: parsedQuery.data.operating_company_id,
        actorUserId: authUser.uuid,
        draft: parsedBody.data,
      });
    });

    return reply.code(201).send(created);
  });

  app.patch("/api/v1/legal/templates/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!requireAdminWriteRole(reply, String(authUser.role ?? ""))) return;

    const parsedParams = templateIdParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedQuery = operatingCompanyQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);
    const parsedBody = legalTemplateUpdateSchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

    const updated = await withCurrentUser(authUser.uuid, async (client) => {
      await setOperatingCompany(client, parsedQuery.data.operating_company_id);
      return updateTemplate(client, {
        operatingCompanyId: parsedQuery.data.operating_company_id,
        actorUserId: authUser.uuid,
        id: parsedParams.data.id,
        changes: parsedBody.data,
      });
    });
    if (updated.error === "legal_template_not_found") return reply.code(404).send({ error: updated.error });
    if (updated.error === "legal_template_edit_requires_draft_status") return reply.code(409).send({ error: updated.error });
    return updated.row;
  });

  app.post("/api/v1/legal/templates/:id/submit", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!requireAdminWriteRole(reply, String(authUser.role ?? ""))) return;

    const parsedParams = templateIdParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedQuery = operatingCompanyQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

    const submitted = await withCurrentUser(authUser.uuid, async (client) => {
      await setOperatingCompany(client, parsedQuery.data.operating_company_id);
      return submitForAttorneyReview(client, {
        operatingCompanyId: parsedQuery.data.operating_company_id,
        actorUserId: authUser.uuid,
        id: parsedParams.data.id,
      });
    });
    if (!submitted) return reply.code(409).send({ error: "legal_template_submit_requires_draft_status" });
    return submitted;
  });

  app.post("/api/v1/legal/templates/:id/attorney-review-link", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!requireAdminWriteRole(reply, String(authUser.role ?? ""))) return;

    const parsedParams = templateIdParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedQuery = operatingCompanyQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

    const result = await withCurrentUser(authUser.uuid, async (client) => {
      await setOperatingCompany(client, parsedQuery.data.operating_company_id);
      return remintAttorneyReviewLink(client, {
        operatingCompanyId: parsedQuery.data.operating_company_id,
        actorUserId: authUser.uuid,
        id: parsedParams.data.id,
      });
    });
    if (!result) return reply.code(404).send({ error: "legal_template_not_found" });
    if ("error" in result) return reply.code(409).send({ error: result.error });
    return result;
  });

  app.post("/api/v1/legal/templates/:id/approve", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!requireAdminWriteRole(reply, String(authUser.role ?? ""))) return;

    const parsedParams = templateIdParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedQuery = operatingCompanyQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);
    const parsedBody = approveBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

    const approved = await withCurrentUser(authUser.uuid, async (client) => {
      await setOperatingCompany(client, parsedQuery.data.operating_company_id);
      return approveTemplate(client, {
        operatingCompanyId: parsedQuery.data.operating_company_id,
        actorUserId: authUser.uuid,
        id: parsedParams.data.id,
        attorneyName: parsedBody.data.attorney_name,
        barNumber: parsedBody.data.bar_number,
        notes: parsedBody.data.notes,
      });
    });
    if (!approved) return reply.code(409).send({ error: "legal_template_approve_requires_pending_review_status" });
    return approved;
  });

  app.post("/api/v1/legal/templates/:id/activate", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!requireAdminWriteRole(reply, String(authUser.role ?? ""))) return;

    const parsedParams = templateIdParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedQuery = operatingCompanyQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

    const activated = await withCurrentUser(authUser.uuid, async (client) => {
      await setOperatingCompany(client, parsedQuery.data.operating_company_id);
      return activateTemplate(client, {
        operatingCompanyId: parsedQuery.data.operating_company_id,
        actorUserId: authUser.uuid,
        id: parsedParams.data.id,
      });
    });
    if (activated.error === "legal_template_not_found") return reply.code(404).send({ error: activated.error });
    if (activated.error === "legal_template_activate_requires_approved_status") return reply.code(409).send({ error: activated.error });
    return activated.row;
  });

  app.post("/api/v1/legal/templates/:id/retire", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!requireAdminWriteRole(reply, String(authUser.role ?? ""))) return;

    const parsedParams = templateIdParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedQuery = operatingCompanyQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

    const retired = await withCurrentUser(authUser.uuid, async (client) => {
      await setOperatingCompany(client, parsedQuery.data.operating_company_id);
      return retireTemplate(client, {
        operatingCompanyId: parsedQuery.data.operating_company_id,
        actorUserId: authUser.uuid,
        id: parsedParams.data.id,
      });
    });
    if (!retired) return reply.code(404).send({ error: "legal_template_not_found_or_already_retired" });
    return retired;
  });
}

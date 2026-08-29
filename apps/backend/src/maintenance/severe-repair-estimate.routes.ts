import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import {
  getFleetRestoreCost,
  getPerUnitBreakdown,
  getRollupTotal,
  listOpenEstimates,
  manualMarkUnitOos,
  manualReturnUnitToService,
  refreshEstimate,
} from "./severe-repair-estimate.service.js";
import { renderSevereRepairInsurancePdf } from "./severe-repair-pdf-export.js";
import { setScopedCompanyContext } from "../_helpers/scoped-company-context.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  unit_id: z.string().uuid().optional(),
});

const estimateIdSchema = z.object({ id: z.string().uuid() });
const unitIdSchema = z.object({ id: z.string().uuid() });

const refreshBodySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const markOosBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  reason: z.string().trim().min(5).max(1000),
  oos_location: z.string().trim().max(300).optional(),
});

const markBackBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  review_notes: z.string().trim().min(10).max(2000),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return reply;
  return req.user;
}

function validationError(reply: FastifyReply, err: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: err.flatten() });
}

function canManageOos(role: string) {
  return role === "Owner" || role === "Administrator" || role === "Manager";
}

function isOwner(role: string) {
  return role === "Owner";
}

export async function registerMaintenanceSevereRepairEstimateRoutes(app: FastifyInstance) {
  app.get("/api/v1/maintenance/severe-repair-estimates", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const rows = await withCurrentUser(user.uuid, async (client) => {
      await setScopedCompanyContext(client, user.uuid, query.data.operating_company_id);
      return listOpenEstimates(client, query.data.operating_company_id, query.data.unit_id);
    });
    return reply.send({ data: rows });
  });

  app.get("/api/v1/maintenance/severe-repair/fleet-restore-cost", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const row = await withCurrentUser(user.uuid, async (client) => {
      await setScopedCompanyContext(client, user.uuid, query.data.operating_company_id);
      return getFleetRestoreCost(client, query.data.operating_company_id);
    });
    return reply.send({ data: row });
  });

  app.get("/api/v1/maintenance/severe-repair/per-unit-breakdown", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const rows = await withCurrentUser(user.uuid, async (client) => {
      await setScopedCompanyContext(client, user.uuid, query.data.operating_company_id);
      return getPerUnitBreakdown(client, query.data.operating_company_id);
    });
    return reply.send({ data: rows });
  });

  app.post("/api/v1/maintenance/severe-repair/export-pdf", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!isOwner(user.role)) return reply.code(403).send({ error: "forbidden_owner_only" });
    const body = refreshBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const { summary, units } = await withCurrentUser(user.uuid, async (client) => {
      await setScopedCompanyContext(client, user.uuid, body.data.operating_company_id);
      return {
        summary: await getFleetRestoreCost(client, body.data.operating_company_id),
        units: await getPerUnitBreakdown(client, body.data.operating_company_id),
      };
    });
    // Rendering is CPU work with no DB dependency — kept OUT of the transaction so a slow PDF does
    // not hold a pooled connection and its txn open.
    const pdf = await renderSevereRepairInsurancePdf({
      operatingCompanyId: body.data.operating_company_id,
      summary,
      units,
    });
    return reply
      .header("Content-Type", pdf.mimeType)
      .header("Content-Disposition", `attachment; filename="${pdf.filename}"`)
      .send(pdf.pdfBuffer);
  });

  app.get("/api/v1/maintenance/severe-repair-estimates/total", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const row = await withCurrentUser(user.uuid, async (client) => {
      await setScopedCompanyContext(client, user.uuid, query.data.operating_company_id);
      return getRollupTotal(client, query.data.operating_company_id);
    });
    return reply.send({ data: row });
  });

  app.post("/api/v1/maintenance/severe-repair-estimates/:id/refresh", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = estimateIdSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const body = refreshBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    try {
      const row = await refreshEstimate(user.uuid, params.data.id, body.data.operating_company_id);
      return reply.send({ data: row });
    } catch (error) {
      const msg = String((error as Error).message ?? "refresh_failed");
      if (msg.startsWith("E_NOT_FOUND")) return reply.code(404).send({ error: msg });
      throw error;
    }
  });

  app.post("/api/v1/maintenance/units/:id/mark-oos", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!canManageOos(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = unitIdSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const body = markOosBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    try {
      const out = await manualMarkUnitOos(user.uuid, {
        operating_company_id: body.data.operating_company_id,
        unit_id: params.data.id,
        reason: body.data.reason,
        oos_location: body.data.oos_location,
      });
      return reply.send({ data: out });
    } catch (error) {
      const msg = String((error as Error).message ?? "mark_oos_failed");
      if (msg.startsWith("E_NOT_FOUND")) return reply.code(404).send({ error: msg });
      if (msg.startsWith("E_REASON_REQUIRED")) return reply.code(400).send({ error: msg });
      throw error;
    }
  });

  app.post("/api/v1/maintenance/units/:id/mark-back-in-service", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!canManageOos(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = unitIdSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const body = markBackBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    try {
      const out = await manualReturnUnitToService(user.uuid, {
        operating_company_id: body.data.operating_company_id,
        unit_id: params.data.id,
        review_notes: body.data.review_notes,
      });
      return reply.send({ data: out });
    } catch (error) {
      const msg = String((error as Error).message ?? "mark_in_service_failed");
      if (msg.startsWith("E_OPEN_ESTIMATES")) return reply.code(409).send({ error: msg });
      if (msg.startsWith("E_REVIEW_NOTES_REQUIRED")) return reply.code(400).send({ error: msg });
      if (msg.startsWith("E_NOT_FOUND")) return reply.code(404).send({ error: msg });
      throw error;
    }
  });
}

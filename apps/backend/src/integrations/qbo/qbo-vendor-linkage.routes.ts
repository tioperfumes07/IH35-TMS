import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../auth/session-middleware.js";
import {
  linkClass,
  linkExistingDriverToQboVendor,
  linkVendor,
  listAvailableVendors,
  listDriverMappingStatus,
  listLinkageHistory,
  suggestMatches,
  unlinkClass,
  unlinkVendor,
} from "./qbo-vendor-linkage.service.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const idParamsSchema = z.object({
  id: z.string().uuid(),
});

const entityParamsSchema = z.object({
  entity_type: z.enum(["driver"]),
  entity_id: z.string().uuid(),
});

const linkVendorBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  entity_type: z.enum(["driver"]),
  entity_id: z.string().uuid(),
  qbo_vendor_id: z.string().trim().min(1),
  reason: z.string().trim().min(3).max(500),
  force: z.boolean().optional().default(false),
});

const linkClassBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  qbo_class_id: z.string().trim().min(1),
  reason: z.string().trim().min(3).max(500),
  force: z.boolean().optional().default(false),
});

const unlinkBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
});

const listVendorsQuerySchema = companyQuerySchema.extend({
  query: z.string().trim().optional().default(""),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
});

const mappingHistoryQuerySchema = companyQuerySchema.extend({
  entity_type: z.enum(["driver", "unit", "equipment", "asset"]).optional(),
  entity_id: z.string().uuid().optional(),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user as { uuid: string; role: string };
}

function canLink(role: string) {
  return role === "Owner" || role === "Administrator" || role === "Accountant";
}

function canUnlink(role: string) {
  return role === "Owner" || role === "Administrator";
}

function validationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

export async function registerQboVendorLinkageRoutes(app: FastifyInstance) {
  app.get("/api/v1/integrations/qbo/vendors", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canLink(user.role)) return reply.code(403).send({ error: "forbidden" });
    const query = listVendorsQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const rows = await listAvailableVendors(user.uuid, query.data.operating_company_id, query.data.query, query.data.limit);
    return { rows };
  });

  app.get("/api/v1/integrations/qbo/vendor-suggestions/:entity_type/:entity_id", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canLink(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = entityParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const rows = await suggestMatches(user.uuid, query.data.operating_company_id, params.data.entity_type, params.data.entity_id);
    return { rows };
  });

  app.post("/api/v1/integrations/qbo/vendor-link", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canLink(user.role)) return reply.code(403).send({ error: "forbidden" });
    const body = linkVendorBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    try {
      const result = await linkVendor(user.uuid, {
        operatingCompanyId: body.data.operating_company_id,
        entityType: body.data.entity_type,
        entityId: body.data.entity_id,
        qboVendorId: body.data.qbo_vendor_id,
        reason: body.data.reason,
        force: body.data.force,
      });
      return result;
    } catch (error) {
      const message = String((error as Error)?.message ?? "link_vendor_failed");
      if (
        message === "qbo_vendor_not_found" ||
        message === "entity_not_found" ||
        message === "qbo_vendor_already_linked_use_force"
      ) {
        return reply.code(message.endsWith("not_found") ? 404 : 409).send({ error: message });
      }
      throw error;
    }
  });

  app.delete("/api/v1/integrations/qbo/vendor-link/:entity_type/:entity_id", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canUnlink(user.role)) return reply.code(403).send({ error: "forbidden_owner_admin_only" });
    const params = entityParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const body = unlinkBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    try {
      const result = await unlinkVendor(user.uuid, {
        operatingCompanyId: body.data.operating_company_id,
        entityType: params.data.entity_type,
        entityId: params.data.entity_id,
        reason: body.data.reason,
      });
      return result;
    } catch (error) {
      const message = String((error as Error)?.message ?? "unlink_vendor_failed");
      if (message === "entity_not_found") return reply.code(404).send({ error: message });
      throw error;
    }
  });

  app.get("/api/v1/integrations/qbo/vendor-linkage-history", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canLink(user.role)) return reply.code(403).send({ error: "forbidden" });
    const query = mappingHistoryQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const rows = await listLinkageHistory(
      user.uuid,
      query.data.operating_company_id,
      query.data.entity_type,
      query.data.entity_id
    );
    return { rows };
  });

  app.post("/api/v1/master-data/drivers/:id/link-qbo-vendor", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canLink(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const body = z
      .object({
        operating_company_id: z.string().uuid(),
        qbo_vendor_id: z.string().trim().min(1),
        reason: z.string().trim().min(3).max(500),
        force: z.boolean().optional().default(false),
      })
      .safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    try {
      const result = await linkExistingDriverToQboVendor(user.uuid, {
        operatingCompanyId: body.data.operating_company_id,
        driverId: params.data.id,
        qboVendorId: body.data.qbo_vendor_id,
        reason: body.data.reason,
        force: body.data.force,
      });
      return result;
    } catch (error) {
      const message = String((error as Error)?.message ?? "driver_link_failed");
      if (message === "entity_not_found" || message === "qbo_vendor_not_found") return reply.code(404).send({ error: message });
      if (message === "qbo_vendor_already_linked_use_force") return reply.code(409).send({ error: message });
      throw error;
    }
  });

  app.post("/api/v1/master-data/units/:id/link-qbo-class", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canLink(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const body = linkClassBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    try {
      const result = await linkClass(user.uuid, {
        operatingCompanyId: body.data.operating_company_id,
        entityType: "unit",
        entityId: params.data.id,
        qboClassId: body.data.qbo_class_id,
        reason: body.data.reason,
        force: body.data.force,
      });
      return result;
    } catch (error) {
      const message = String((error as Error)?.message ?? "unit_link_failed");
      if (message === "entity_not_found") return reply.code(404).send({ error: message });
      if (message === "qbo_class_already_linked_use_force") return reply.code(409).send({ error: message });
      throw error;
    }
  });

  app.post("/api/v1/master-data/trailers/:id/link-qbo-class", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canLink(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const body = linkClassBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    try {
      const result = await linkClass(user.uuid, {
        operatingCompanyId: body.data.operating_company_id,
        entityType: "trailer",
        entityId: params.data.id,
        qboClassId: body.data.qbo_class_id,
        reason: body.data.reason,
        force: body.data.force,
      });
      return result;
    } catch (error) {
      const message = String((error as Error)?.message ?? "trailer_link_failed");
      if (message === "entity_not_found") return reply.code(404).send({ error: message });
      if (message === "qbo_class_already_linked_use_force") return reply.code(409).send({ error: message });
      throw error;
    }
  });

  app.get("/api/v1/master-data/drivers/qbo-mapping-status", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canLink(user.role)) return reply.code(403).send({ error: "forbidden" });
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const rows = await listDriverMappingStatus(user.uuid, query.data.operating_company_id);
    return { rows };
  });

  app.post("/api/v1/master-data/units/:id/unlink-qbo-class", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canUnlink(user.role)) return reply.code(403).send({ error: "forbidden_owner_admin_only" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const body = unlinkBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    await unlinkClass(user.uuid, {
      operatingCompanyId: body.data.operating_company_id,
      entityType: "unit",
      entityId: params.data.id,
      reason: body.data.reason,
    });
    return { ok: true };
  });

  app.post("/api/v1/master-data/trailers/:id/unlink-qbo-class", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canUnlink(user.role)) return reply.code(403).send({ error: "forbidden_owner_admin_only" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const body = unlinkBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    await unlinkClass(user.uuid, {
      operatingCompanyId: body.data.operating_company_id,
      entityType: "trailer",
      entityId: params.data.id,
      reason: body.data.reason,
    });
    return { ok: true };
  });
}

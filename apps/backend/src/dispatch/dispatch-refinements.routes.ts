import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { sendZodValidation } from "../lib/zod-http-error.js";
import {
  createLoadTemplate,
  getDispatchLoadEta,
  listAvailableDriversForDispatch,
  listLoadStopsRefined,
  listLoadTemplates,
  manualReassignLoad,
  replaceLoadStopsRefined,
  type LoadStopInput,
} from "./dispatch-refinements.service.js";
import { listOptimalDriversForLoad } from "./driver-optimizer.service.js";

const loadIdParams = z.object({ loadId: z.string().uuid() });
const companyQ = z.object({ operating_company_id: z.string().uuid() });

const reassignBody = z.object({
  operating_company_id: z.string().uuid(),
  new_driver_id: z.string().uuid(),
  reason_code: z.string().trim().min(2).max(80),
  notes: z.string().trim().max(2000).optional(),
});

const stopBodyItem = z.object({
  sequence_number: z.number().int().min(1),
  stop_type: z.string().trim().min(1).max(24),
  location_address: z.string().trim().max(500).optional().nullable(),
  city: z.string().trim().max(120).optional().nullable(),
  state: z.string().trim().max(120).optional().nullable(),
  country: z.string().trim().max(120).optional().nullable(),
  address_line1: z.string().trim().max(300).optional().nullable(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  window_start: z.string().datetime({ offset: true }).optional().nullable(),
  window_end: z.string().datetime({ offset: true }).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  signature_required: z.boolean().optional(),
  photo_required: z.boolean().optional(),
});

const replaceStopsBody = z.object({
  operating_company_id: z.string().uuid(),
  stops: z.array(stopBodyItem).min(2),
});

const availableDriversQuery = z.object({
  operating_company_id: z.string().uuid(),
  load_id: z.string().uuid(),
  for_pickup_at: z.string().datetime({ offset: true }).optional(),
});

const optimalDriversQuery = z.object({
  operating_company_id: z.string().uuid(),
  for_pickup_at: z.string().datetime({ offset: true }).optional(),
  preview_pickup_city: z.string().trim().max(120).optional(),
  preview_pickup_state: z.string().trim().max(120).optional(),
  preview_hazmat: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((v) => v === true || v === "true"),
  preview_trailer_type: z.string().trim().max(80).optional(),
});

const templateCreateBody = z.object({
  operating_company_id: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  template_json: z.record(z.string(), z.unknown()),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  const role = String(req.user?.role ?? "");
  if (!["Owner", "Administrator", "Manager", "Dispatcher"].includes(role)) {
    reply.code(403).send({ error: "forbidden" });
    return null;
  }
  return req.user!;
}

export async function registerDispatchRefinementsRoutes(app: FastifyInstance) {
  app.post("/api/v1/loads/:loadId/reassign", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = loadIdParams.safeParse(req.params ?? {});
    if (!params.success) return sendZodValidation(reply, params.error);
    const body = reassignBody.safeParse(req.body ?? {});
    if (!body.success) return sendZodValidation(reply, body.error);
    try {
      return await manualReassignLoad(user.uuid, {
        operating_company_id: body.data.operating_company_id,
        load_id: params.data.loadId,
        new_driver_id: body.data.new_driver_id,
        reason_code: body.data.reason_code,
        notes: body.data.notes,
      });
    } catch (e) {
      if (String((e as Error).message) === "E_LOAD_NOT_FOUND") return reply.code(404).send({ error: "E_LOAD_NOT_FOUND" });
      throw e;
    }
  });

  app.get("/api/v1/loads/:loadId/stops", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = loadIdParams.safeParse(req.params ?? {});
    if (!params.success) return sendZodValidation(reply, params.error);
    const q = companyQ.safeParse(req.query ?? {});
    if (!q.success) return sendZodValidation(reply, q.error);
    try {
      return await listLoadStopsRefined(user.uuid, q.data.operating_company_id, params.data.loadId);
    } catch {
      return reply.code(500).send({ error: "server_error" });
    }
  });

  app.post("/api/v1/loads/:loadId/stops", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = loadIdParams.safeParse(req.params ?? {});
    if (!params.success) return sendZodValidation(reply, params.error);
    const body = replaceStopsBody.safeParse(req.body ?? {});
    if (!body.success) return sendZodValidation(reply, body.error);
    if (body.data.stops[0]?.sequence_number !== 1) {
      return reply.code(400).send({ error: "validation_error", message: "First stop must use sequence_number 1" });
    }
    try {
      return await replaceLoadStopsRefined(user.uuid, body.data.operating_company_id, params.data.loadId, body.data.stops as LoadStopInput[]);
    } catch (e) {
      if (String((e as Error).message) === "E_LOAD_NOT_FOUND") return reply.code(404).send({ error: "E_LOAD_NOT_FOUND" });
      throw e;
    }
  });

  app.get("/api/v1/dispatch/available-drivers", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const q = availableDriversQuery.safeParse(req.query ?? {});
    if (!q.success) return sendZodValidation(reply, q.error);
    return listAvailableDriversForDispatch(user.uuid, q.data.operating_company_id, q.data.load_id, q.data.for_pickup_at);
  });

  app.get("/api/v1/dispatch/loads/:loadId/optimal-drivers", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = loadIdParams.safeParse(req.params ?? {});
    if (!params.success) return sendZodValidation(reply, params.error);
    const q = optimalDriversQuery.safeParse(req.query ?? {});
    if (!q.success) return sendZodValidation(reply, q.error);
    try {
      return await listOptimalDriversForLoad(user.uuid, {
        operating_company_id: q.data.operating_company_id,
        load_id: params.data.loadId,
        for_pickup_at: q.data.for_pickup_at,
        preview_pickup_city: q.data.preview_pickup_city,
        preview_pickup_state: q.data.preview_pickup_state,
        preview_hazmat: q.data.preview_hazmat,
        preview_trailer_type: q.data.preview_trailer_type,
      });
    } catch (e) {
      if (String((e as Error).message) === "E_LOAD_NOT_FOUND") return reply.code(404).send({ error: "E_LOAD_NOT_FOUND" });
      throw e;
    }
  });

  app.get("/api/v1/dispatch/loads/:loadId/eta", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = z.object({ loadId: z.string().uuid() }).safeParse(req.params ?? {});
    if (!params.success) return sendZodValidation(reply, params.error);
    const q = companyQ.safeParse(req.query ?? {});
    if (!q.success) return sendZodValidation(reply, q.error);
    try {
      return await getDispatchLoadEta(user.uuid, q.data.operating_company_id, params.data.loadId);
    } catch (e) {
      const msg = String((e as Error).message ?? "");
      if (msg === "E_LOAD_NOT_FOUND") return reply.code(404).send({ error: "E_LOAD_NOT_FOUND" });
      if (msg === "E_ETA_NOT_IN_TRANSIT") return reply.code(409).send({ error: "E_ETA_NOT_IN_TRANSIT" });
      throw e;
    }
  });

  app.get("/api/v1/load-templates", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const q = companyQ.safeParse(req.query ?? {});
    if (!q.success) return sendZodValidation(reply, q.error);
    return listLoadTemplates(user.uuid, q.data.operating_company_id);
  });

  app.post("/api/v1/load-templates", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const body = templateCreateBody.safeParse(req.body ?? {});
    if (!body.success) return sendZodValidation(reply, body.error);
    const row = await createLoadTemplate(user.uuid, body.data);
    return reply.code(201).send({ template: row });
  });
}

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
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
  override_reason: z.string().trim().min(10).max(2000).optional(),
});

const stopBodyItem = z.object({
  sequence_number: z.number().int().min(1),
  stop_type: z.enum(["pickup", "delivery", "dropoff", "fuel", "rest", "border", "customs"]),
  location_address: z.string().trim().max(500).optional().nullable(),
  city: z.string().trim().max(120).optional().nullable(),
  state: z.string().trim().max(120).optional().nullable(),
  country: z.string().trim().max(120).optional().nullable(),
  postal_code: z.string().trim().max(32).optional().nullable(),
  address_line1: z.string().trim().max(300).optional().nullable(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  window_start: z.string().datetime({ offset: true }).optional().nullable(),
  window_end: z.string().datetime({ offset: true }).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  signature_required: z.boolean().optional(),
  photo_required: z.boolean().optional(),
  pickup_time_type_id: z.string().uuid().optional().nullable(),
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

const ownerOverrideLogQuery = z.object({
  operating_company_id: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function registerDispatchRefinementsRoutes(app: FastifyInstance) {
  // OWNER-OVERRIDE LOG (owner ruling 2026-08-02). Read-only report of every owner attestation that
  // pushed a dispatch past a blocker: who, when, which load/driver, which blocker codes, and the
  // reason given. Queried by the stable `override_class` tag rather than by prose, so an insurer,
  // DOT/FMCSA reviewer or attorney can pull exactly this event class.
  //
  // Reads audit.audit_events, which is APPEND-ONLY (WORM) — this endpoint only SELECTs; there is no
  // edit or delete path for an override record anywhere in the system, by design.
  app.get("/api/v1/dispatch/owner-override-log", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const q = ownerOverrideLogQuery.safeParse(req.query ?? {});
    if (!q.success) return sendZodValidation(reply, q.error);

    // G2-2: the requested opco is CLIENT-SUPPLIED, so it must pass a membership check before it is
    // bound as tenant scope — otherwise any authenticated user could read another entity's override
    // log by passing its uuid. Caught by verify-money-dispatch-opco-resolver on the first run of this
    // route; the guard was right.
    // Throws a 403-tagged error (statusCode 403) when the user has no active membership — the same
    // shape every other caller relies on, so Fastify's error handler renders it consistently.
    await assertCompanyMembership(user.uuid, q.data.operating_company_id);

    return withCurrentUser(user.uuid, async (client) => {
      await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [
        q.data.operating_company_id,
      ]);
      const res = await client.query(
        `
          SELECT
            e.uuid::text            AS id,
            e.created_at,
            e.event_class,
            e.actor_user_uuid::text AS actor_user_id,
            e.payload->>'role'                 AS actor_role,
            e.payload->>'override_class'       AS override_class,
            e.payload->>'attestation_scope'    AS attestation_scope,
            e.payload->>'override_reason'      AS override_reason,
            e.payload->>'driver_id'            AS driver_id,
            e.payload->>'driver_name'          AS driver_name,
            e.payload->'overridden_reasons'    AS overridden_reasons,
            e.payload->>'cdl_expires_at'       AS cdl_expires_at,
            e.payload->>'medical_expiry_date'  AS medical_expiry_date
          FROM audit.audit_events e
          WHERE e.payload->>'operating_company_id' = $1
            AND e.event_class LIKE 'dispatch.%overridden_by_owner'
          ORDER BY e.created_at DESC
          LIMIT $2 OFFSET $3
        `,
        [q.data.operating_company_id, q.data.limit, q.data.offset]
      );
      const countRes = await client.query<{ total: number }>(
        `
          SELECT count(*)::int AS total
          FROM audit.audit_events e
          WHERE e.payload->>'operating_company_id' = $1
            AND e.event_class LIKE 'dispatch.%overridden_by_owner'
        `,
        [q.data.operating_company_id]
      );
      return { overrides: res.rows, total: countRes.rows[0]?.total ?? 0 };
    });
  });

  app.post("/api/v1/loads/:loadId/reassign", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
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
        requesting_user_role: user.role,
        override_reason: body.data.override_reason,
      });
    } catch (e) {
      const msg = String((e as Error).message);
      if (msg === "E_LOAD_NOT_FOUND") {
        return reply.code(404).send({
          error: "E_LOAD_NOT_FOUND",
          message: "Load not found for this operating company.",
        });
      }
      if (msg === "E_DRIVER_NOT_FOUND") {
        return reply.code(404).send({
          error: "E_DRIVER_NOT_FOUND",
          message: "Selected driver was not found for this operating company.",
        });
      }
      if (msg === "E_DRIVER_NOT_QUALIFIED") {
        return reply.code(422).send({
          error: "E_DRIVER_NOT_QUALIFIED",
          reasons: ((e as Error & { reasons?: string[] }).reasons) ?? [],
          message: "Selected driver does not meet DOT qualification requirements for this load.",
        });
      }
      req.log.error({ err: e }, "dispatch reassign failed");
      return reply.code(500).send({
        error: "server_error",
        message: "Could not reassign this load. Try again or contact support.",
      });
    }
  });

  app.get("/api/v1/loads/:loadId/stops", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = loadIdParams.safeParse(req.params ?? {});
    if (!params.success) return sendZodValidation(reply, params.error);
    const q = companyQ.safeParse(req.query ?? {});
    if (!q.success) return sendZodValidation(reply, q.error);
    try {
      return await listLoadStopsRefined(user.uuid, q.data.operating_company_id, params.data.loadId);
    } catch (e) {
      req.log.error({ err: e }, "dispatch load stops lookup failed");
      return reply.code(500).send({
        error: "server_error",
        message: "Could not load stops for this load. Try again or contact support.",
      });
    }
  });

  app.post("/api/v1/loads/:loadId/stops", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
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
      if (String((e as Error).message) === "E_LOAD_NOT_FOUND") {
        return reply.code(404).send({
          error: "E_LOAD_NOT_FOUND",
          message: "Load not found for this operating company.",
        });
      }
      if ((e as { code?: string }).code === "E_STOP_TYPE_INVALID") {
        return reply.code(400).send({
          error: "E_STOP_TYPE_INVALID",
          message: "Stop type must be pickup, delivery, fuel, rest, or border.",
        });
      }
      req.log.error({ err: e }, "dispatch load stops replacement failed");
      return reply.code(500).send({
        error: "server_error",
        message: "Could not update stops for this load. Try again or contact support.",
      });
    }
  });

  app.get("/api/v1/dispatch/available-drivers", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const q = availableDriversQuery.safeParse(req.query ?? {});
    if (!q.success) return sendZodValidation(reply, q.error);
    try {
      return await listAvailableDriversForDispatch(user.uuid, q.data.operating_company_id, q.data.load_id, q.data.for_pickup_at);
    } catch (e) {
      if (String((e as Error).message) === "E_LOAD_NOT_FOUND") {
        return reply.code(404).send({
          error: "E_LOAD_NOT_FOUND",
          message: "Load not found for this operating company.",
        });
      }
      req.log.error({ err: e }, "dispatch available drivers lookup failed");
      return reply.code(500).send({
        error: "server_error",
        message: "Could not load available drivers. Try again or contact support.",
      });
    }
  });

  app.get("/api/v1/dispatch/loads/:loadId/optimal-drivers", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
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
      if (String((e as Error).message) === "E_LOAD_NOT_FOUND") {
        return reply.code(404).send({
          error: "E_LOAD_NOT_FOUND",
          message: "Load not found for this operating company.",
        });
      }
      req.log.error({ err: e }, "dispatch available drivers lookup failed");
      return reply.code(500).send({
        error: "server_error",
        message: "Could not load available drivers. Try again or contact support.",
      });
    }
  });

  app.get("/api/v1/dispatch/loads/:loadId/eta", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
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
      if (msg === "E_LOAD_NOT_FOUND") {
        return reply.code(404).send({
          error: "E_LOAD_NOT_FOUND",
          message: "Load not found for this operating company.",
        });
      }
      if (msg === "E_ETA_NOT_IN_TRANSIT") {
        return reply.code(409).send({
          error: "E_ETA_NOT_IN_TRANSIT",
          message: "ETA is only available while the load is in transit.",
        });
      }
      req.log.error({ err: e }, "dispatch ETA lookup failed");
      return reply.code(500).send({
        error: "server_error",
        message: "Could not calculate ETA for this load. Try again or contact support.",
      });
    }
  });

  app.get("/api/v1/load-templates", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const q = companyQ.extend({ customer_id: z.string().uuid().optional(), template_id: z.string().uuid().optional() }).safeParse(req.query ?? {});
    if (!q.success) return sendZodValidation(reply, q.error);
    return listLoadTemplates(user.uuid, q.data.operating_company_id, { customer_id: q.data.customer_id, template_id: q.data.template_id });
  });

  app.post("/api/v1/load-templates", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const body = templateCreateBody.safeParse(req.body ?? {});
    if (!body.success) return sendZodValidation(reply, body.error);
    const row = await createLoadTemplate(user.uuid, body.data);
    return reply.code(201).send({ template: row });
  });
}

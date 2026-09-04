import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCompanyScope } from "../accounting/shared.js";
import { canAssignLoadToDriver } from "./driver-availability.service.js";

const uuidSchema = z.string().uuid();
/** Edge guard: these ids flow into the tenant-scoping GUC (app.operating_company_id) downstream. */
function isUuid(v: string): boolean {
  return uuidSchema.safeParse(v).success;
}

function readBodyRecord(req: FastifyRequest): Record<string, unknown> {
  if (typeof req.body === "object" && req.body !== null) {
    return req.body as Record<string, unknown>;
  }
  return {};
}

export async function registerDispatchLoadAssignRoutes(app: FastifyInstance) {
  // DRV-AVAILABILITY-RLS-MASKED: this MUST run at preHandler, not preValidation. Fastify's
  // lifecycle is onRequest -> preParsing -> preValidation -> preHandler -> handler, and
  // session-middleware's own auth hook (which populates req.user/req.session from the cookie) is
  // registered at preHandler. A preValidation hook here would run BEFORE that, seeing req.user as
  // always null — this hook needs a real authenticated user to scope the driver-availability read
  // correctly (see driver-availability.service.ts's header comment for the RLS root cause).
  app.addHook("preHandler", async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.method !== "POST") return;
    if (req.routeOptions.url !== "/api/v1/dispatch/loads/:id/quick-assign") return;
    if (!requireAuth(req, reply)) return reply;
    const authUser = req.user;
    if (!authUser) return reply;

    const body = readBodyRecord(req);
    const driverId = typeof body.driver_id === "string" ? body.driver_id : "";
    const tenantId = typeof body.operating_company_id === "string" ? body.operating_company_id : "";
    const overrideRepairBlock = body.override_repair_block === true;

    if (!driverId || !tenantId) return;
    if (!isUuid(driverId) || !isUuid(tenantId)) {
      return reply
        .code(400)
        .send({ error: "validation_error", message: "driver_id and operating_company_id must be UUIDs" });
    }

    // withCompanyScope asserts real org membership (403 otherwise) and sets BOTH
    // app.current_user_id (via withCurrentUser) and app.operating_company_id — canAssignLoadToDriver
    // reads mdata.drivers (RLS keys on the former) AND maintenance.work_orders (RLS keys on the
    // latter), so both GUCs are required, not just one.
    const availability = await withCompanyScope(authUser.uuid, tenantId, (client) =>
      canAssignLoadToDriver(driverId, tenantId, client)
    );
    if (!availability.ok) {
      if (availability.code === "E_DRIVER_NOT_FOUND") {
        return reply.code(404).send({
          error: "E_DRIVER_NOT_FOUND",
          message: availability.blocker ?? "Driver was not found for this operating company",
        });
      }
      if (availability.code === "E_DRIVER_HOS_VIOLATION") {
        // HOS cannot be cleared with override_repair_block — that flag is repair-only.
        const message = availability.blocker ?? "Driver is in HOS violation";
        return reply.code(422).send({
          error: "E_DRIVER_HOS_VIOLATION",
          message,
          blocker: availability.blocker,
        });
      }
      if (!overrideRepairBlock) {
      // FAIL-U1 (second surface). The pre-check panel in LoadCreateModal reads
      // `work_order_display_id` / `asset_label` and shows a dispatcher which work order and which
      // truck. This 409 — the SAME interlock, reached from the board's Quick Assign instead of the
      // create modal — hand-built a subset of the availability object and dropped exactly those two
      // human labels, keeping only the uuids.
      //
      // It also carried no `message`. DispatchBoard's catch toasts `data.message ?? data.error`, so
      // the dispatcher's red toast read the literal string `E_DRIVER_REPAIR_BLOCK` while the
      // readable sentence sat unused in `blocker` one field away.
      const assetSuffix = availability.asset_label ? ` · Unit ${availability.asset_label}` : "";
      const message = `${availability.blocker ?? "Driver has an active repair work order"}${assetSuffix}. Re-submit with Override repair block to continue.`;
      return reply.code(409).send({
        error: "E_DRIVER_REPAIR_BLOCK",
        message,
        blocker: availability.blocker,
        work_order_id: availability.work_order_id ?? null,
        asset_id: availability.asset_id ?? null,
        work_order_display_id: availability.work_order_display_id ?? null,
        asset_label: availability.asset_label ?? null,
      });
      }
    }
  });

  app.get("/api/v1/dispatch/drivers/:driver_id/load-availability", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!requireAuth(req, reply)) return reply;
    const authUser = req.user;
    if (!authUser) return reply;
    const params = (req.params ?? {}) as Record<string, unknown>;
    const query = (req.query ?? {}) as Record<string, unknown>;
    const driverId = typeof params.driver_id === "string" ? params.driver_id : "";
    const tenantId = typeof query.operating_company_id === "string" ? query.operating_company_id : "";
    if (!driverId || !tenantId || !isUuid(driverId) || !isUuid(tenantId)) {
      return reply.code(400).send({ error: "validation_error" });
    }

    // See the preHandler hook above for why this must be scoped through a real per-user
    // connection (DRV-AVAILABILITY-RLS-MASKED) rather than an unscoped bare-pool read.
    const availability = await withCompanyScope(authUser.uuid, tenantId, (client) =>
      canAssignLoadToDriver(driverId, tenantId, client)
    );
    return reply.send(availability);
  });
}

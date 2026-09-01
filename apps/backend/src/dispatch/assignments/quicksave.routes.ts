import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../auth/session-middleware.js";
import { reassignDriver, reassignTrailer, reassignUnit } from "./quicksave.service.js";
import { DriverNotQualifiedError } from "../driver-qualification.service.js";
import { withCurrentUser } from "../../auth/db.js";
import { isEnabled } from "../../lib/feature-flags/service.js";
import { appendCrudAudit } from "../../audit/crud-audit.js";

// DSP-05 (owner requirement 5.5, 2026-09-01): "the dispatcher needs to receive a message on the
// screen and must confirm. Warnings and override by owner." Flag default OFF (no seed row -> isEnabled
// returns false) until the owner turns it on -- ships dormant, current assign behavior unchanged.
export const DSP_ASSIGN_CONFIRMATION_FLAG_KEY = "DSP_ASSIGN_CONFIRMATION_ENABLED";

const loadParamsSchema = z.object({ uuid: z.string().uuid() });
const companyBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  // DSP-05 confirmation payload. Both optional at the schema level -- ordinary dispatcher confirms
  // (confirmed=true); Owner may instead override with a captured reason (confirmed omitted/false is
  // fine when override_reason is present). Neither is READ when the flag is off.
  confirmed: z.boolean().optional(),
  override_reason: z.string().trim().min(1).max(1000).optional(),
});
const unitBodySchema = companyBodySchema.extend({ unit_uuid: z.string().uuid() });
const trailerBodySchema = companyBodySchema.extend({ trailer_uuid: z.string().uuid() });
const driverBodySchema = companyBodySchema.extend({ driver_uuid: z.string().uuid() });

/**
 * DSP-05 gate. Returns null to proceed, or a {status, payload} to short-circuit the route.
 * Owner: confirmed=true OR override_reason both satisfy the gate -- override_reason is audited
 * distinctly (traceable who/when/why an owner bypassed the on-screen confirmation).
 * Everyone else: confirmed=true is required; there is no override for a non-Owner role.
 */
async function checkAssignConfirmation(
  userUuid: string,
  role: string,
  operatingCompanyId: string,
  body: { confirmed?: boolean; override_reason?: string },
  assignmentKind: "unit" | "trailer" | "driver",
  targetId: string,
  loadUuid: string
): Promise<{ status: number; payload: Record<string, unknown> } | null> {
  const flagOn = await withCurrentUser(userUuid, (client) =>
    isEnabled(client, DSP_ASSIGN_CONFIRMATION_FLAG_KEY, { operating_company_id: operatingCompanyId, user_uuid: userUuid })
  );
  if (!flagOn) return null;

  const isOwner = role === "Owner";
  const isOverride = isOwner && !!body.override_reason;
  if (!body.confirmed && !isOverride) {
    return {
      status: 400,
      payload: {
        error: "assignment_confirmation_required",
        message: isOwner
          ? "Confirm the assignment, or provide override_reason to bypass confirmation."
          : "Confirm the assignment on screen before it can be saved.",
      },
    };
  }

  // LAW-EDITABLE-BY-PERMISSION-ALWAYS-TRACEABLE-2026-09-01: named fields, not a JSON blob -- actor,
  // action, what changed, why. Written on THIS request's own client so an audit failure never silently
  // drops (it would throw and the caller gets a real error, not a false "assigned" with no trail).
  await withCurrentUser(userUuid, (client) =>
    appendCrudAudit(
      client,
      userUuid,
      isOverride ? "dispatch.load.assignment_confirmation_overridden" : "dispatch.load.assignment_confirmed",
      {
        resource_type: "mdata.loads",
        resource_id: loadUuid,
        operating_company_id: operatingCompanyId,
        assignment_kind: assignmentKind,
        target_id: targetId,
        actor_role: role,
        override_reason: isOverride ? body.override_reason : null,
      },
      isOverride ? "warning" : "info",
      "DSP-05-ASSIGN-CONFIRM"
    )
  );
  return null;
}

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function mapValidationError(error: unknown) {
  // DISP-2: the shared driver-qualification gate (used by the assign-driver reassign path) throws a
  // typed error carrying the full block → render the canonical E_DRIVER_NOT_QUALIFIED 422 payload,
  // matching the quick-assign route's contract.
  if (error instanceof DriverNotQualifiedError) {
    return {
      status: 422,
      payload: {
        error: error.code,
        message: error.message,
        details: {
          driver_id: error.block.driverId,
          reasons: error.block.reasons,
          cdl_expires_at: error.block.cdlExpiresAt,
          medical_expiry_date: error.block.medicalExpiryDate,
          hazmat_endorsement_expires_at: error.block.hazmatEndorsementExpiresAt,
        },
      },
    };
  }
  const code = String((error as Error)?.message ?? "");
  if (code === "E_LOAD_NOT_FOUND") return { status: 404, payload: { error: code } };
  if (code.startsWith("E_UNIT_OOS")) {
    return {
      status: 422,
      payload: {
        error: "E_UNIT_OOS",
        message: code.includes(":") ? code.slice(code.indexOf(":") + 1) : "Unit is out of service (OOS) and cannot be assigned.",
      },
    };
  }
  if (code.startsWith("E_UNIT_DISPATCH_BLOCKED")) {
    return {
      status: 422,
      payload: {
        error: "E_UNIT_DISPATCH_BLOCKED",
        message: code.includes(":") ? code.slice(code.indexOf(":") + 1) : "Unit is dispatch-blocked.",
      },
    };
  }
  if (code.startsWith("E_VALIDATION_")) return { status: 422, payload: { error: code.split(":")[0], message: code.split(":")[1] ?? code } };
  return null;
}

export async function registerDispatchAssignmentsQuicksaveRoutes(app: FastifyInstance) {
  app.patch("/api/v1/dispatch/loads/:uuid/assign-unit", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = loadParamsSchema.safeParse(req.params ?? {});
    const body = unitBodySchema.safeParse(req.body ?? {});
    if (!params.success || !body.success) {
      return reply.code(400).send({ error: "validation_error" });
    }
    const gate = await checkAssignConfirmation(
      user.uuid,
      String((user as { role?: string }).role ?? ""),
      body.data.operating_company_id,
      body.data,
      "unit",
      body.data.unit_uuid,
      params.data.uuid
    );
    if (gate) return reply.code(gate.status).send(gate.payload);
    try {
      const result = await reassignUnit(user.uuid, {
        operating_company_id: body.data.operating_company_id,
        load_uuid: params.data.uuid,
        unit_uuid: body.data.unit_uuid,
      });
      return result;
    } catch (error) {
      const mapped = mapValidationError(error);
      if (mapped) return reply.code(mapped.status).send(mapped.payload);
      throw error;
    }
  });

  app.patch("/api/v1/dispatch/loads/:uuid/assign-trailer", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = loadParamsSchema.safeParse(req.params ?? {});
    const body = trailerBodySchema.safeParse(req.body ?? {});
    if (!params.success || !body.success) {
      return reply.code(400).send({ error: "validation_error" });
    }
    try {
      const result = await reassignTrailer(user.uuid, {
        operating_company_id: body.data.operating_company_id,
        load_uuid: params.data.uuid,
        trailer_uuid: body.data.trailer_uuid,
      });
      return result;
    } catch (error) {
      const mapped = mapValidationError(error);
      if (mapped) return reply.code(mapped.status).send(mapped.payload);
      throw error;
    }
  });

  app.patch("/api/v1/dispatch/loads/:uuid/assign-driver", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = loadParamsSchema.safeParse(req.params ?? {});
    const body = driverBodySchema.safeParse(req.body ?? {});
    if (!params.success || !body.success) {
      return reply.code(400).send({ error: "validation_error" });
    }
    const gate = await checkAssignConfirmation(
      user.uuid,
      String((user as { role?: string }).role ?? ""),
      body.data.operating_company_id,
      body.data,
      "driver",
      body.data.driver_uuid,
      params.data.uuid
    );
    if (gate) return reply.code(gate.status).send(gate.payload);
    try {
      const result = await reassignDriver(user.uuid, {
        operating_company_id: body.data.operating_company_id,
        load_uuid: params.data.uuid,
        driver_uuid: body.data.driver_uuid,
      });
      return result;
    } catch (error) {
      const mapped = mapValidationError(error);
      if (mapped) return reply.code(mapped.status).send(mapped.payload);
      throw error;
    }
  });
}

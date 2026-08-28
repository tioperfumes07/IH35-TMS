import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import {
  completeQuicksaveDraft,
  getAssignmentHistory,
  listQuicksaveDrafts,
  quickAssignLoad,
} from "./quick-assign.service.js";
import { DriverNotQualifiedError } from "./driver-qualification.service.js";

const loadIdParamsSchema = z.object({ id: z.string().uuid() });
const quickAssignBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  driver_id: z.string().uuid(),
  unit_id: z.string().uuid().optional(),
  trailer_id: z.string().uuid().optional(),
  assignment_method: z.enum(["quicksave", "drag_drop"]).default("quicksave"),
  acknowledged_warnings: z.array(z.string()).optional(),
});
const completeBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  fields: z.record(z.string(), z.unknown()).default({}),
});
const listQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function mapQuickAssignError(error: unknown) {
  // G9-C1 + D3-1: the shared driver-qualification gate throws a typed error carrying the block.
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
  if (code === "E_UNIT_NOT_FOUND") {
    return { status: 404, payload: { error: code, message: "Unit is not active in this operating company." } };
  }
  if (code === "E_TRAILER_NOT_FOUND") {
    return {
      status: 404,
      payload: { error: code, message: "Trailer is not active in this operating company." },
    };
  }
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
  if (code === "E_HARD_BLOCKS_PRESENT") return { status: 422, payload: { error: code, message: "hard blocks present for quick-assign" } };
  return null;
}

export async function registerDispatchQuicksaveRoutes(app: FastifyInstance) {
  app.post("/api/v1/dispatch/loads/:id/quick-assign", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = loadIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const body = quickAssignBodySchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });
    try {
      const result = await quickAssignLoad(user.uuid, user.role, {
        ...body.data,
        load_id: params.data.id,
      });
      return result;
    } catch (error) {
      const mapped = mapQuickAssignError(error);
      if (mapped) return reply.code(mapped.status).send(mapped.payload);
      throw error;
    }
  });

  app.post("/api/v1/dispatch/loads/:id/complete-quicksave-draft", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = loadIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const body = completeBodySchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });
    try {
      const result = await completeQuicksaveDraft(user.uuid, {
        operating_company_id: body.data.operating_company_id,
        load_id: params.data.id,
        fields: body.data.fields,
      });
      return result;
      } catch (error) {
              if (String((error as Error)?.message ?? "") === "E_LOAD_NOT_FOUND") {
        return reply.code(404).send({
          error: "E_LOAD_NOT_FOUND",
          message: "Load not found for this operating company.",
        });
      }
      const mapped = mapQuickAssignError(error);
      if (mapped) return reply.code(mapped.status).send(mapped.payload);
      throw error;
    }
  });

  app.get("/api/v1/dispatch/loads/quicksave-drafts", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = listQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    return listQuicksaveDrafts(user.uuid, query.data.operating_company_id);
  });

  app.get("/api/v1/dispatch/loads/:id/assignment-history", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = loadIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const query = listQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    return getAssignmentHistory(user.uuid, query.data.operating_company_id, params.data.id);
  });
}

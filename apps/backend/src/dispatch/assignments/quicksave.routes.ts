import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../auth/session-middleware.js";
import { reassignDriver, reassignTrailer, reassignUnit } from "./quicksave.service.js";

const loadParamsSchema = z.object({ uuid: z.string().uuid() });
const companyBodySchema = z.object({ operating_company_id: z.string().uuid() });
const unitBodySchema = companyBodySchema.extend({ unit_uuid: z.string().uuid() });
const trailerBodySchema = companyBodySchema.extend({ trailer_uuid: z.string().uuid() });
const driverBodySchema = companyBodySchema.extend({ driver_uuid: z.string().uuid() });

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function mapValidationError(error: unknown) {
  const code = String((error as Error)?.message ?? "");
  if (code === "E_LOAD_NOT_FOUND") return { status: 404, payload: { error: code } };
  if (code.startsWith("E_VALIDATION_")) return { status: 422, payload: { error: code.split(":")[0], message: code.split(":")[1] ?? code } };
  return null;
}

export async function registerDispatchAssignmentsQuicksaveRoutes(app: FastifyInstance) {
  app.patch("/api/v1/dispatch/loads/:uuid/assign-unit", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = loadParamsSchema.safeParse(req.params ?? {});
    const body = unitBodySchema.safeParse(req.body ?? {});
    if (!params.success || !body.success) {
      return reply.code(400).send({ error: "validation_error" });
    }
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

  app.patch("/api/v1/dispatch/loads/:uuid/assign-trailer", async (req, reply) => {
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

  app.patch("/api/v1/dispatch/loads/:uuid/assign-driver", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = loadParamsSchema.safeParse(req.params ?? {});
    const body = driverBodySchema.safeParse(req.body ?? {});
    if (!params.success || !body.success) {
      return reply.code(400).send({ error: "validation_error" });
    }
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

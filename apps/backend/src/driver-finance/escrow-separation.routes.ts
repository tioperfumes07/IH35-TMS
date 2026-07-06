// BLOCK-02 — Driver Escrow separation/return-path HTTP surface. Read endpoints are available to
// Owner/Administrator/Accountant (matches accounting/escrow's canAccessEscrow gate); the release action
// (moves cash) is Owner-only, matching the void/cancel-governance posture for money-moving actions.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import {
  getDriverEscrowSeparation,
  listEligibleDriverEscrowReturns,
  recordDriverEscrowSeparation,
  releaseDriverEscrowSeparation,
} from "./escrow-separation.service.js";

const companyQuerySchema = z.object({ operating_company_id: z.string().uuid() });
const driverParamsSchema = z.object({ driver_id: z.string().uuid() });
const separationParamsSchema = z.object({ id: z.string().uuid() });
const recordBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  driver_id: z.string().uuid(),
});
const releaseBodySchema = z.object({ operating_company_id: z.string().uuid() });

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function validationError(reply: FastifyReply, err: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: err.flatten() });
}

function canAccessEscrowSeparation(role: string) {
  return ["Owner", "Administrator", "Accountant"].includes(role);
}

export async function registerDriverEscrowSeparationRoutes(app: FastifyInstance) {
  // Forward link: driver -> separation record (+ status/eligibility/balance).
  app.get("/api/v1/driver-finance/escrow-separations/driver/:driver_id", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!canAccessEscrowSeparation(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = driverParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    await assertCompanyMembership(user.uuid, query.data.operating_company_id);
    const row = await getDriverEscrowSeparation(query.data.operating_company_id, params.data.driver_id, user.uuid);
    return reply.send({ data: row });
  });

  // Owner/Accountant queue: separations whose 90-day hold has elapsed.
  app.get("/api/v1/driver-finance/escrow-separations", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!canAccessEscrowSeparation(user.role)) return reply.code(403).send({ error: "forbidden" });
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    await assertCompanyMembership(user.uuid, query.data.operating_company_id);
    const rows = await listEligibleDriverEscrowReturns(query.data.operating_company_id, user.uuid);
    return reply.send({ data: rows });
  });

  // Record a driver's separation (starts the 90-day clock). Owner/Administrator only.
  app.post("/api/v1/driver-finance/escrow-separations", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!["Owner", "Administrator"].includes(user.role)) return reply.code(403).send({ error: "forbidden" });
    const body = recordBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    await assertCompanyMembership(user.uuid, body.data.operating_company_id);
    const result = await recordDriverEscrowSeparation(
      { operating_company_id: body.data.operating_company_id, driver_id: body.data.driver_id },
      { userId: user.uuid, role: user.role }
    );
    if (!result.separation) return reply.code(409).send({ error: result.reason });
    return reply.send({ data: result });
  });

  // Release the driver's escrow balance (net of outstanding damage claims). Owner-only — moves cash.
  app.post("/api/v1/driver-finance/escrow-separations/:id/release", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = separationParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const body = releaseBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    await assertCompanyMembership(user.uuid, body.data.operating_company_id);
    try {
      const result = await releaseDriverEscrowSeparation(
        { operating_company_id: body.data.operating_company_id, separation_id: params.data.id },
        { userId: user.uuid, role: user.role }
      );
      if (result.result === "skipped_flag_off") return reply.code(409).send({ error: "driver_escrow_separation_return_flag_off" });
      if (result.result === "not_eligible") {
        return reply.code(409).send({ error: "not_eligible", days_remaining: result.days_remaining });
      }
      return reply.send({ data: result });
    } catch (err) {
      const msg = String((err as Error)?.message ?? "unknown_error");
      if (msg.startsWith("E_OWNER_ONLY")) return reply.code(403).send({ error: msg });
      if (msg.startsWith("E_NOT_FOUND")) return reply.code(404).send({ error: msg });
      if (msg.startsWith("E_ALREADY_RESOLVED")) return reply.code(409).send({ error: msg });
      throw err;
    }
  });
}

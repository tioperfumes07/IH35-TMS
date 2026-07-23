// SAF-F01 — Driver escrow FORFEIT HTTP surface (build-and-HOLD, financial cluster).
//
// POST /api/v1/driver-finance/escrow/:driverId/forfeit — the endpoint EscrowForfeitModal calls via
// api/driverFinance.ts. Before this it 404'd (no handler existed). Owner/Administrator only (money-moving),
// matching the release action's Owner-gated posture.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { forfeitDriverEscrow, EscrowForfeitError } from "./escrow-forfeit.service.js";

const driverParamsSchema = z.object({ driverId: z.string().uuid() });

// amount is DOLLARS (the unit is stated here on purpose — the service converts ×100 to cents exactly once).
const forfeitBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  driver_uuid: z.string().uuid(),
  amount: z.number().positive(),
  reason: z.string().trim().min(3).max(500),
  // REQUIRED shape kept as uuid, but OPTIONAL per owner ruling 2026-07-23 (two branches: linked debt, or
  // a general forfeit crediting damage_recovery). When present it must FK a real driver_liabilities row.
  linked_liability_id: z.string().uuid().nullish(),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function validationError(reply: FastifyReply, err: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: err.flatten() });
}

// Money-moving → Owner/Administrator only.
function canForfeit(role: string) {
  return role === "Owner" || role === "Administrator";
}

export async function registerDriverEscrowForfeitRoutes(app: FastifyInstance) {
  app.post(
    "/api/v1/driver-finance/escrow/:driverId/forfeit",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = authed(req, reply);
      if (!user) return;
      if (!canForfeit(user.role)) return reply.code(403).send({ error: "forbidden" });

      const params = driverParamsSchema.safeParse(req.params ?? {});
      if (!params.success) return validationError(reply, params.error);
      const body = forfeitBodySchema.safeParse(req.body ?? {});
      if (!body.success) return validationError(reply, body.error);
      // The path driver and the body driver must agree — no cross-driver forfeit.
      if (body.data.driver_uuid !== params.data.driverId) {
        return reply.code(400).send({ error: "driver_id_mismatch" });
      }

      await assertCompanyMembership(user.uuid, body.data.operating_company_id);

      try {
        const result = await forfeitDriverEscrow(
          {
            operating_company_id: body.data.operating_company_id,
            driver_uuid: body.data.driver_uuid,
            amount: body.data.amount,
            reason: body.data.reason,
            linked_liability_id: body.data.linked_liability_id ?? null,
          },
          { userId: user.uuid, role: user.role }
        );

        if (result.result === "flag_off") {
          // Posting dark until the owner flips DRIVER_ESCROW_FORFEIT_GL_POSTING_ENABLED. Fail loud, never
          // silently succeed with no ledger movement.
          return reply.code(409).send({
            error: "escrow_forfeit_gl_posting_flag_off",
            message: "Escrow forfeit GL posting is OFF for this entity. No entry was posted. The owner must enable it.",
          });
        }
        if (result.result === "over_draw") {
          return reply.code(409).send({
            error: "escrow_forfeit_over_draw",
            message: "Forfeit exceeds the driver's current escrow balance.",
            balance_cents: result.balance_cents,
            requested_cents: result.requested_cents,
          });
        }
        if (result.result === "linked_liability_not_found") {
          return reply.code(404).send({ error: "linked_liability_not_found" });
        }
        return reply.send({ data: result });
      } catch (err) {
        // damage_recovery undesignated, escrow account unbound/wrong-type/Faro, etc. — fail loud with the
        // resolver's own code so the operator learns exactly what to configure. Nothing was posted (atomic).
        const code = (err as EscrowForfeitError)?.code ?? (err as Error)?.name ?? "unknown_error";
        const msg = String((err as Error)?.message ?? "unknown_error");
        if (/undesignated|not (mapped|designated)|no active.*role|role='damage_recovery'/i.test(msg) || code === "E_ROLE_UNDESIGNATED") {
          return reply.code(409).send({
            error: "damage_recovery_account_undesignated",
            message: "The damage_recovery account is not designated for this entity. Designate it, then retry. Nothing was posted.",
            detail: msg,
          });
        }
        if (code.startsWith("DRIVER_ESCROW_ACCOUNT") || code.startsWith("E_ESCROW") || code === "E_INVALID_AMOUNT") {
          return reply.code(409).send({ error: code, message: msg });
        }
        throw err;
      }
    }
  );
}

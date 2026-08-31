import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { withCurrentUser } from "../auth/db.js";
import { closeSettlementPayRun, SettlementPayRunError } from "./settlement-payrun-close.service.js";
import { stampTripClosedForBookendedSettlement } from "./settlements-load-bookended.service.js";
import { EscrowResolverError } from "./escrow-resolver.service.js";

// SETTLEMENT PAY-RUN CLOSE routes (Phase 2b). TIER-1 FINANCIAL / BUILD-AND-HOLD. The close is a no-op-safe
// preview whenever SETTLEMENT_GL_POSTING_ENABLED is OFF (the default) — it computes the net + a balanced JE
// preview and writes NOTHING. Only Owner/Administrator/Accountant (the settlement-authority roles) may call.

const companyQuerySchema = z.object({ operating_company_id: z.string().uuid() });
const idParamsSchema = z.object({ id: z.string().uuid() });
/** Preview GET may pass the same disbursement inputs as close so net>0 settlements can balance the cash leg. */
const previewQuerySchema = companyQuerySchema.extend({
  payment_method_id: z.string().uuid().nullable().optional(),
  standard_escrow_contribution_cents: z.coerce.number().int().min(0).max(1_000_000).optional(),
});
const closeBodySchema = companyQuerySchema.extend({
  payment_method_id: z.string().uuid().nullable().optional(),
  standard_escrow_contribution_cents: z.coerce.number().int().min(0).max(1_000_000).optional(),
  payment_reference: z.string().trim().max(200).nullable().optional(),
  bank_txn_id: z.string().uuid().nullable().optional(),
  /** SET-05 — required (with reason) to close when post-withholding net breaches the resolved floor. */
  override_floor: z
    .object({
      pct: z.number().min(0).max(100).nullable().optional(),
      cents: z.number().int().min(0).nullable().optional(),
      reason: z.string().trim().min(1).max(500).nullable().optional(),
    })
    .nullable()
    .optional(),
});
const closeTripBodySchema = companyQuerySchema;

const AUTHORITY_ROLES = new Set(["Owner", "Administrator", "Accountant"]);
const CLOSE_TRIP_ROLES = new Set(["Owner", "Administrator", "Manager", "Accountant", "Payroll"]);
const READ_RL = { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } };
const WRITE_RL = { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } };

function currentUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user as { uuid: string; role: string };
}
function validationError(reply: FastifyReply, err: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: err.flatten() });
}
function mapPayRunError(reply: FastifyReply, e: unknown) {
  if (e instanceof SettlementPayRunError) {
    const code = e.code === "SETTLEMENT_NOT_FOUND" ? 404 : 409;
    return reply.code(code).send({ error: e.code, message: e.message, details: e.details ?? null });
  }
  if (e instanceof EscrowResolverError) {
    return reply.code(409).send({ error: e.code, message: e.message, details: e.details ?? null });
  }
  throw e;
}

export function registerSettlementPayRunCloseRoutes(app: FastifyInstance) {
  // Preview: compute the net + balanced JE preview WITHOUT posting (forced preview, ignores the flag).
  app.get("/api/v1/driver-finance/settlements/:id/payrun-preview", READ_RL, async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    if (!AUTHORITY_ROLES.has(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const p = idParamsSchema.safeParse(req.params ?? {});
    if (!p.success) return validationError(reply, p.error);
    const q = previewQuerySchema.safeParse(req.query ?? {});
    if (!q.success) return validationError(reply, q.error);
    await assertCompanyMembership(user.uuid, q.data.operating_company_id);
    try {
      return await closeSettlementPayRun(
        {
          operatingCompanyId: q.data.operating_company_id,
          settlementId: p.data.id,
          paymentMethodId: q.data.payment_method_id ?? null,
          standardEscrowContributionCents: q.data.standard_escrow_contribution_cents ?? null,
          previewOnly: true,
        },
        { userId: user.uuid }
      );
    } catch (e) {
      return mapPayRunError(reply, e);
    }
  });

  // Close: previews when the flag is OFF (default → writes nothing); posts the balanced JE + recovers
  // advances + records the escrow contribution + records the disbursement when the flag is ON.
  app.post("/api/v1/driver-finance/settlements/:id/payrun-close", WRITE_RL, async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    if (!AUTHORITY_ROLES.has(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const p = idParamsSchema.safeParse(req.params ?? {});
    if (!p.success) return validationError(reply, p.error);
    const b = closeBodySchema.safeParse(req.body ?? {});
    if (!b.success) return validationError(reply, b.error);
    await assertCompanyMembership(user.uuid, b.data.operating_company_id);
    try {
      return await closeSettlementPayRun(
        {
          operatingCompanyId: b.data.operating_company_id,
          settlementId: p.data.id,
          paymentMethodId: b.data.payment_method_id ?? null,
          standardEscrowContributionCents: b.data.standard_escrow_contribution_cents ?? null,
          paymentReference: b.data.payment_reference ?? null,
          bankTxnId: b.data.bank_txn_id ?? null,
          overrideFloor: b.data.override_floor ?? null,
        },
        { userId: user.uuid }
      );
    } catch (e) {
      return mapPayRunError(reply, e);
    }
  });

  /**
   * POST /api/v1/driver-finance/settlements/:id/close-trip
   * Stamps trip_closed_at on a load-bookended settlement stuck with NULL after payrun-close or
   * when the anchor load is already past delivered_pending_docs (PINGSETTLEMENT-TRIP-CLOSE-STAMP).
   */
  app.post("/api/v1/driver-finance/settlements/:id/close-trip", WRITE_RL, async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    if (!CLOSE_TRIP_ROLES.has(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const p = idParamsSchema.safeParse(req.params ?? {});
    if (!p.success) return validationError(reply, p.error);
    const b = closeTripBodySchema.safeParse(req.body ?? {});
    if (!b.success) return validationError(reply, b.error);
    await assertCompanyMembership(user.uuid, b.data.operating_company_id);

    const result = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [b.data.operating_company_id]);
      return stampTripClosedForBookendedSettlement(client, {
        settlementId: p.data.id,
        operatingCompanyId: b.data.operating_company_id,
        actorUserId: user.uuid,
      });
    });

    if (!result.stamped) {
      // ACCT-F10161-adjacent (live-caught 2026-08-31, CC-1) — #18859 made
      // stampTripClosedForBookendedSettlement re-attempt appendSettlementLineFromDriverBillIfMissing
      // even on the already_closed path (a real heal, not a no-op refusal), but this route was never
      // updated to match: it still 409'd already_closed as if it were a rejected request, so the
      // CloseTripPanel's own catch handler reported "Close trip failed" on a call that had, in fact,
      // just successfully re-attached a driver bill and rolled up the settlement totals. already_closed
      // is now a completed, successful re-check — respond 200 with the anchor load it re-verified, not
      // an error status. not_found/other reasons remain genuine failures.
      if (result.reason === "already_closed") {
        return { stamped: false, reason: result.reason, anchor_load_id: result.anchor_load_id };
      }
      const code = result.reason === "not_found" ? 404 : 422;
      return reply.code(code).send({ error: `trip_close_${result.reason}`, stamped: false, reason: result.reason });
    }
    return { stamped: true, trip_closed_at: result.trip_closed_at, anchor_load_id: result.anchor_load_id };
  });
}

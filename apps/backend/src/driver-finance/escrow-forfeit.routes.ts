// SAF-F01 — Driver escrow FORFEIT HTTP surface (build-and-HOLD, financial cluster).
//
// POST /api/v1/driver-finance/escrow/:driverId/forfeit — the endpoint EscrowForfeitModal calls via
// api/driverFinance.ts. Before this it 404'd (no handler existed). Owner/Administrator only (money-moving),
// matching the release action's Owner-gated posture.
//
// TWO gates, both required (LEGAL-PAPER-01, 2026-07-26): canForfeit(role) — WHO may act — and
// has_signed_clause — WHETHER the record authorises taking the money. See the gate below.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { forfeitDriverEscrow, EscrowForfeitError } from "./escrow-forfeit.service.js";
import { resolveDriverEscrowTarget } from "./escrow-target.service.js";

const driverParamsSchema = z.object({ driverId: z.string().uuid() });

// amount is DOLLARS (the unit is stated here on purpose — the service converts ×100 to cents exactly once).
const forfeitBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  driver_uuid: z.string().uuid(),
  amount: z.number().positive(),
  /** Catalog code from catalogs.escrow_types where may_draw_escrow=true (ND-ESC-01). */
  reason_code: z.string().trim().min(2).max(64),
  /** Optional free-text note appended to the catalog display name in memos. */
  reason_note: z.string().trim().max(400).optional(),
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

      // SIGNED-CLAUSE GATE (LEGAL-PAPER-01, 2026-07-26). Until now this endpoint gated ONLY on
      // requireAuth + canForfeit(role): an Owner could forfeit a driver's escrow with no signed
      // authorisation on file at all. The READ path next door
      // (debt.routes.ts → /escrow-target) already resolved has_signed_clause and the UI shows it —
      // so the number was displayed, and then ignored by the one call that actually takes the
      // money. Deducting from a worker's held funds without signed authorisation is wage-deduction
      // exposure (DOL / TX Payday Law) and, with escrow booked as a Chapter-11 liability, an
      // estate-property problem too. Role is WHO may act; the signed clause is WHETHER anyone may.
      //
      // Same resolver as the read path — resolveDriverEscrowTarget — deliberately: one definition
      // of "signed", so the screen and the gate can never disagree. No new logic, no new GL math.
      const clause = await withCurrentUser(user.uuid, async (client) => {
        await client.query("SELECT set_config('app.operating_company_id', $1, true)", [
          body.data.operating_company_id,
        ]);
        return resolveDriverEscrowTarget(client, {
          driverId: body.data.driver_uuid,
          operatingCompanyId: body.data.operating_company_id,
        });
      });
      if (!clause.hasSignedClause) {
        // Fail CLOSED and loud, before anything is posted. 409, not 403: the caller is authorised,
        // the RECORD is not — and the remedy is a document, not a permission.
        return reply.code(409).send({
          error: "escrow_forfeit_no_signed_clause",
          message:
            "No signed driver contract authorises this forfeiture. File the signed contract " +
            "(e-signed, or paper with the scan attached) before forfeiting escrow. Nothing was posted.",
          driver_uuid: body.data.driver_uuid,
        });
      }

      // ND-ESC-01 draw catalog: forfeit reason must be an active catalogs.escrow_types row with
      // may_draw_escrow=true (abandonment / damage / safety fines seeded; owner can rename/add).
      const drawReason = await withCurrentUser(user.uuid, async (client) => {
        await client.query("SELECT set_config('app.operating_company_id', $1, true)", [
          body.data.operating_company_id,
        ]);
        const col = await client.query(
          `
            SELECT EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'catalogs'
                AND table_name = 'escrow_types'
                AND column_name = 'may_draw_escrow'
            ) AS ok
          `
        );
        if (!Boolean((col.rows[0] as { ok?: boolean } | undefined)?.ok)) {
          return { status: "column_missing" as const };
        }
        const res = await client.query(
          `
            SELECT code, display_name
              FROM catalogs.escrow_types
             WHERE operating_company_id = $1::uuid
               AND code = $2
               AND is_active = true
               AND may_draw_escrow = true
             LIMIT 1
          `,
          [body.data.operating_company_id, body.data.reason_code.toUpperCase()]
        );
        const row = res.rows[0] as { code?: string; display_name?: string } | undefined;
        if (!row?.code) return { status: "not_allowed" as const };
        return {
          status: "ok" as const,
          code: String(row.code),
          display_name: String(row.display_name ?? row.code),
        };
      });
      if (drawReason.status === "column_missing") {
        return reply.code(409).send({
          error: "escrow_draw_catalog_not_applied",
          message:
            "Escrow draw catalog (may_draw_escrow) is not live yet — owner must Neon-apply ND-ESC-01. Nothing was posted.",
        });
      }
      if (drawReason.status === "not_allowed") {
        return reply.code(409).send({
          error: "escrow_draw_reason_not_allowed",
          message:
            "reason_code must be an active escrow draw reason with may_draw_escrow=true " +
            "(seeded: ABANDONMENT, DAMAGE, SAFETY-FINE — or an owner-added reason).",
          reason_code: body.data.reason_code,
        });
      }

      const reasonMemo = body.data.reason_note
        ? `${drawReason.display_name} (${drawReason.code}): ${body.data.reason_note}`
        : `${drawReason.display_name} (${drawReason.code})`;

      try {
        const result = await forfeitDriverEscrow(
          {
            operating_company_id: body.data.operating_company_id,
            driver_uuid: body.data.driver_uuid,
            amount: body.data.amount,
            reason: reasonMemo,
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

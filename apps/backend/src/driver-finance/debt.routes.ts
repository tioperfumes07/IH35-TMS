import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { requireAuth } from "../auth/session-middleware.js";
import { escrowAccumulationPct, resolveDriverEscrowTarget } from "./escrow-target.service.js";

const paramsSchema = z.object({ id: z.string().uuid() });
const companyQuerySchema = z.object({ operating_company_id: z.string().uuid() });

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function validationError(reply: FastifyReply, err: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: err.flatten() });
}

async function withCompany<T>(userId: string, companyId: string, fn: (client: any) => Promise<T>) {
  await assertCompanyMembership(userId, companyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    return fn(client);
  });
}

const READ_RL = { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } };

export async function registerDriverFinanceDebtRoutes(app: FastifyInstance) {
  /**
   * SAF-F09 — the driver's escrow target, resolved from configuration instead of a client constant.
   *
   * The Escrow Record screen computed `accumulation_rate_pct` against a hardcoded 1000 in
   * apps/frontend/src/api/driverFinance.ts, and gated the forfeiture block on an INFERENCE
   * (`postClause > 0 || some bucket === 'post_clause'`). Both drove decisions about a driver's money.
   * This returns the real numbers: target from driver override -> entity default, and
   * has_signed_clause from an actual signed contract instance.
   *
   * `accumulation_rate_pct` is NULL when no target is configured. The UI must render that as unknown
   * — never fall back to a constant, which is the defect this replaces.
   */
  app.get("/api/v1/driver-finance/drivers/:id/escrow-target", READ_RL, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = paramsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const balanceCents = Number((req.query as Record<string, unknown>)?.balance_cents ?? 0);

    const resolution = await withCompany(user.uuid, query.data.operating_company_id, (client) =>
      resolveDriverEscrowTarget(client, {
        driverId: params.data.id,
        operatingCompanyId: query.data.operating_company_id,
      })
    );

    return {
      driver_id: params.data.id,
      escrow_target_cents: resolution.targetCents,
      target_source: resolution.source,
      has_signed_clause: resolution.hasSignedClause,
      accumulation_rate_pct: escrowAccumulationPct(balanceCents, resolution.targetCents),
    };
  });

  app.get("/api/v1/driver-finance/drivers/:id/debt-summary", READ_RL, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = paramsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const payload = await withCompany(user.uuid, query.data.operating_company_id, async (client) => {
      try {
        const res = await client.query(
          `
            SELECT *
            FROM driver_finance.recompute_driver_debt($1::uuid)
          `,
          [params.data.id]
        );
        const row = res.rows[0] ?? {};
        return {
          driver_id: params.data.id,
          total_active_debt: Number(row.total_active_debt ?? 0),
          pending_ack_count: Number(row.pending_ack_liability_count ?? 0),
          pending_ack_total: Number(row.pending_ack_total ?? 0),
          escrow_pre_clause: Number(row.escrow_balance_pre_clause ?? 0),
          escrow_post_clause: Number(row.escrow_balance_post_clause ?? 0),
          computed_at: row.computed_at ?? new Date().toISOString(),
          source_liabilities: row.source_liabilities ?? [],
        };
      } catch {
        return { unavailable: true as const };
      }
    });

    if ("unavailable" in payload) {
      return reply.code(501).send({ error: "recompute_driver_debt_unavailable" });
    }
    return payload;
  });
}

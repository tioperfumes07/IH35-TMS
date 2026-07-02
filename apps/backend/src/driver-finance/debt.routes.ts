import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

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
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
    return fn(client);
  });
}

export async function registerDriverFinanceDebtRoutes(app: FastifyInstance) {
  app.get("/api/v1/driver-finance/drivers/:id/debt-summary", async (req, reply) => {
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

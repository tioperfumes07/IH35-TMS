import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const escrowQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  from: z.string().optional(),
  to: z.string().optional(),
  type: z.string().optional(),
});

const driverParamsSchema = z.object({
  driver_id: z.string().uuid(),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

async function withCompanyScope<T>(
  userId: string,
  operatingCompanyId: string,
  fn: (client: {
    query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
  }) => Promise<T>
) {
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [operatingCompanyId]);
    return fn(client);
  });
}

export async function registerBankingEscrowVisualizerRoutes(app: FastifyInstance) {
  app.get("/api/v1/banking/escrow-visualizer", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = escrowQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const q = query.data;

    const rows = await withCompanyScope(user.uuid, q.operating_company_id, async (client) => {
      const res = await client
        .query(
          // §4 landmine: there is NO mdata.drivers.escrow_balance column (the prior ref returned blank
          // via the .catch fallback below). Driver escrow lives in driver_finance.escrow_balances
          // (current_balance_cents — migration 202606120600). Expose it as dollars for the visualizer,
          // which renders escrow_balance with .toFixed(2).
          `
            SELECT
              d.id AS driver_id,
              CONCAT_WS(' ', d.first_name, d.last_name) AS driver_name,
              COALESCE(eb.current_balance_cents, 0) / 100.0 AS escrow_balance
            FROM mdata.drivers d
            LEFT JOIN driver_finance.escrow_balances eb
              ON eb.driver_id = d.id
              AND eb.operating_company_id = d.operating_company_id
            WHERE d.operating_company_id = $1
              AND d.deactivated_at IS NULL
            ORDER BY driver_name
          `,
          [q.operating_company_id]
        )
        .catch(() => ({ rows: [] as Record<string, unknown>[] }));
      return res.rows;
    });
    return { drivers: rows };
  });

  app.get("/api/v1/banking/escrow-visualizer/:driver_id", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = driverParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = escrowQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const q = query.data;

    const timeline = await withCompanyScope(user.uuid, q.operating_company_id, async (client) => {
      const values: unknown[] = [q.operating_company_id, params.data.driver_id];
      const filters = ["operating_company_id = $1", "driver_id = $2"];
      if (q.from) {
        values.push(q.from);
        filters.push(`created_at >= $${values.length}::timestamptz`);
      }
      if (q.to) {
        values.push(q.to);
        filters.push(`created_at <= $${values.length}::timestamptz`);
      }
      if (q.type) {
        values.push(q.type);
        filters.push(`transaction_type = $${values.length}`);
      }
      // §4 landmine fix: driver_finance.escrow_ledger has NO entry_type/bucket/memo/amount columns
      // (migration 202606120600) — SELECT * used to leave the frontend's EscrowDriverTimelineRow
      // contract (entry_type/bucket/amount/memo) entirely unfilled, so every timeline row rendered a
      // generic "Escrow movement" label with a $0.00 amount. Real columns: transaction_type,
      // amount_cents, description. Aliased here to match the existing frontend contract (no bucket
      // concept exists on this ledger — always null, same honest-— rather than fabricated behavior
      // already used elsewhere in this codebase for missing dimensions).
      const res = await client
        .query(
          `
            SELECT
              id,
              driver_id,
              transaction_type AS entry_type,
              NULL::text AS bucket,
              (amount_cents::numeric / 100) AS amount,
              description AS memo,
              created_at
            FROM driver_finance.escrow_ledger
            WHERE ${filters.join(" AND ")}
            ORDER BY created_at DESC
            LIMIT 500
          `,
          values
        )
        .catch(() => ({ rows: [] as Record<string, unknown>[] }));
      return res.rows;
    });
    return { timeline };
  });
}

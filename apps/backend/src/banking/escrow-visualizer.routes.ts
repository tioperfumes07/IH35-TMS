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
  bucket: z.string().optional(),
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
          `
            SELECT
              d.id AS driver_id,
              CONCAT_WS(' ', d.first_name, d.last_name) AS driver_name,
              COALESCE(d.escrow_balance, 0) AS escrow_balance
            FROM mdata.drivers d
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
        filters.push(`entry_type = $${values.length}`);
      }
      if (q.bucket) {
        values.push(q.bucket);
        filters.push(`bucket = $${values.length}`);
      }
      const res = await client
        .query(
          `
            SELECT *
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

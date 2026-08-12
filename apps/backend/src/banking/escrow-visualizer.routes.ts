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
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [operatingCompanyId]);
    return fn(client);
  });
}

export async function registerBankingEscrowVisualizerRoutes(app: FastifyInstance) {
  app.get("/api/v1/banking/escrow-visualizer", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
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
            WHERE d.operating_company_id = $1::uuid
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

  app.get("/api/v1/banking/escrow-visualizer/:driver_id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = driverParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = escrowQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const q = query.data;

    const timeline = await withCompanyScope(user.uuid, q.operating_company_id, async (client) => {
      const values: unknown[] = [q.operating_company_id, params.data.driver_id];
      const filters = ["el.operating_company_id = $1::uuid", "el.driver_id = $2"];
      if (q.from) {
        values.push(q.from);
        filters.push(`el.created_at >= $${values.length}::timestamptz`);
      }
      if (q.to) {
        values.push(q.to);
        filters.push(`el.created_at <= $${values.length}::timestamptz`);
      }
      if (q.type) {
        values.push(q.type);
        filters.push(`el.transaction_type = $${values.length}`);
      }
      // §4 landmine fix: driver_finance.escrow_ledger has NO entry_type/bucket/memo/amount columns
      // (migration 202606120600) — SELECT * used to leave the frontend's EscrowDriverTimelineRow
      // contract (entry_type/bucket/amount/memo) entirely unfilled, so every timeline row rendered a
      // generic "Escrow movement" label with a $0.00 amount. Real columns: transaction_type,
      // amount_cents, description. Aliased here to match the existing frontend contract (no bucket
      // concept exists on this ledger — always null, same honest-— rather than fabricated behavior
      // already used elsewhere in this codebase for missing dimensions).
      // WAVE-C-gl_je-driver-escrow: forward escrow movement -> its settlement's deduction GL JE.
      // driver_finance.escrow_ledger has no journal_entry_id of its own (§4 landmine above); the JE
      // that actually recorded this deduction lives one hop over on the settlement's GL posting run
      // (driver_finance.driver_settlement_gl_runs.deduction_journal_entry_id, written by the existing
      // settlement GL poster — 202607060900_settlement_bill_payment_posting.sql). Read-only join; no
      // new GL math, no posting from this read. A movement with no settlement_id (e.g. a manual
      // adjustment) or a settlement not yet GL-posted honestly returns NULL, not a fabricated link.
      const res = await client
        .query(
          `
            SELECT
              el.id,
              el.driver_id,
              el.transaction_type AS entry_type,
              NULL::text AS bucket,
              (el.amount_cents::numeric / 100) AS amount,
              el.description AS memo,
              el.created_at,
              el.settlement_id::text AS settlement_id,
              el.settlement_line_id::text AS settlement_line_id,
              je.id::text AS journal_entry_id,
              je.entry_date::text AS journal_entry_date,
              je.memo AS journal_entry_memo
            FROM driver_finance.escrow_ledger el
            LEFT JOIN driver_finance.driver_settlement_gl_runs sgr
              ON sgr.settlement_id = el.settlement_id
             AND sgr.operating_company_id = el.operating_company_id
            LEFT JOIN accounting.journal_entries je
              ON je.id = sgr.deduction_journal_entry_id
             AND je.operating_company_id = el.operating_company_id
            WHERE ${filters.join(" AND ")}
            ORDER BY el.created_at DESC
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

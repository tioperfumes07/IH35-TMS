import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";

const paramsSchema = z.object({ loadId: z.string().uuid() });
const querySchema = z.object({ operating_company_id: z.string().uuid() });

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

export async function registerLoadSettlementSummaryRoutes(app: FastifyInstance) {
  app.get("/api/v1/dispatch/loads/:loadId/settlement-summary", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;

    const params = paramsSchema.safeParse(req.params ?? {});
    const query = querySchema.safeParse(req.query ?? {});
    if (!params.success || !query.success) {
      return reply.code(400).send({ error: "validation_error" });
    }

    const { loadId } = params.data;
    const { operating_company_id } = query.data;

    const result = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operating_company_id]);

      const loadRes = await client.query<{ id: string }>(
        `SELECT id FROM mdata.loads
         WHERE id = $1 AND operating_company_id = $2 AND soft_deleted_at IS NULL
         LIMIT 1`,
        [loadId, operating_company_id]
      );
      if (!loadRes.rows[0]) return { settlement: null };

      const reg = await client.query<{ ok: boolean }>(
        `SELECT to_regclass('driver_finance.driver_settlements') IS NOT NULL AS ok`
      );
      if (!reg.rows[0]?.ok) return { settlement: null };

      const settlRes = await client.query<Record<string, unknown>>(
        `SELECT
           s.id,
           s.display_id,
           s.driver_id,
           s.status,
           s.trip_closed_at,
           s.first_load_id,
           s.first_load_number,
           s.last_load_id,
           s.last_load_number,
           s.gross_pay,
           s.deductions_total,
           s.reimbursements_total,
           s.net_pay,
           s.period_start,
           s.period_end,
           s.settlement_model
         FROM driver_finance.driver_settlements s
         WHERE s.operating_company_id = $1
           AND s.settlement_model = 'load_bookended'
           AND (s.first_load_id = $2 OR s.last_load_id = $2)
         ORDER BY s.created_at DESC
         LIMIT 1`,
        [operating_company_id, loadId]
      );

      const s = settlRes.rows[0] ?? null;
      if (!s) return { settlement: null };

      const driverRes = await client.query<{ driver_name: string | null }>(
        `SELECT concat(d.first_name, ' ', d.last_name) AS driver_name
         FROM mdata.drivers d WHERE d.id = $1 LIMIT 1`,
        [s.driver_id]
      );
      const driverName = driverRes.rows[0]?.driver_name ?? null;

      return {
        settlement: {
          id: String(s.id ?? ""),
          display_id: s.display_id ? String(s.display_id) : null,
          status: String(s.status ?? ""),
          is_open: s.trip_closed_at === null,
          driver_id: String(s.driver_id ?? ""),
          driver_name: driverName,
          gross_pay: Number(s.gross_pay ?? 0),
          deductions_total: Number(s.deductions_total ?? 0),
          reimbursements_total: Number(s.reimbursements_total ?? 0),
          net_pay: Number(s.net_pay ?? 0),
          period_start: s.period_start ? String(s.period_start) : null,
          period_end: s.period_end ? String(s.period_end) : null,
          nb_leg: s.first_load_id
            ? { load_id: String(s.first_load_id), load_number: String(s.first_load_number ?? "") }
            : null,
          sb_leg: s.last_load_id
            ? { load_id: String(s.last_load_id), load_number: String(s.last_load_number ?? "") }
            : null,
        },
      };
    });

    return reply.send(result ?? { settlement: null });
  });
}

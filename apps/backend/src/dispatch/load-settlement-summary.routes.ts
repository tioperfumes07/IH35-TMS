import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const paramsSchema = z.object({ loadId: z.string().uuid() });
const querySchema = z.object({ operating_company_id: z.string().uuid() });

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

export async function registerLoadSettlementSummaryRoutes(app: FastifyInstance) {
  // Auth read — CodeQL js/missing-rate-limiting (touched route must declare rateLimit).
  app.get(
    "/api/v1/dispatch/loads/:loadId/settlement-summary",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;

    const params = paramsSchema.safeParse(req.params ?? {});
    const query = querySchema.safeParse(req.query ?? {});
    if (!params.success || !query.success) {
      return reply.code(400).send({ error: "validation_error" });
    }

    const { loadId } = params.data;
    const { operating_company_id } = query.data;

    await assertCompanyMembership(user.uuid, operating_company_id);
    const result = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operating_company_id]);

      const loadRes = await client.query<{ id: string; presettlement_link_id: string | null }>(
        `SELECT id, presettlement_link_id::text
           FROM mdata.loads
          WHERE id = $1 AND operating_company_id = $2::uuid AND soft_deleted_at IS NULL
          LIMIT 1`,
        [loadId, operating_company_id]
      );
      const loadRow = loadRes.rows[0];
      if (!loadRow) return { settlement: null };

      const reg = await client.query<{ ok: boolean }>(
        `SELECT to_regclass('driver_finance.driver_settlements') IS NOT NULL AS ok`
      );
      if (!reg.rows[0]?.ok) return { settlement: null };

      const settlementCols = `
           s.id,
           s.display_id,
           s.source_document_ref,
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
           s.settlement_model`;

      // ROUND 173 pt 2 (Lead, 2026-09-25 — "OWNER RULE: THE TOUR") — mdata.loads.presettlement_link_id
      // is the load's OWN current pointer to its settlement (R-168, landed on every load), open or
      // closed alike (live-verified 2026-09-25: closed/'approved' settlements are still resolved by
      // this column, not just open ones). Try it FIRST, unconditionally — it can never resolve a
      // historical/superseded settlement, because it is the load's single current link, not a
      // heuristic search across every settlement that ever mentioned the load.
      let s: Record<string, unknown> | null = null;
      if (loadRow.presettlement_link_id) {
        const byLink = await client.query<Record<string, unknown>>(
          `SELECT ${settlementCols}
             FROM driver_finance.driver_settlements s
            WHERE s.id = $1::uuid AND s.operating_company_id = $2::uuid`,
          [loadRow.presettlement_link_id, operating_company_id]
        );
        s = byLink.rows[0] ?? null;
      }

      // Fallback ONLY when the load carries no presettlement_link_id at all (none observed live as
      // of R-168, kept for older/edge-case rows) — the same dual-path heuristic as before
      // (bookend first/last_load_id, or settlement_lines/driver_bills.load_id), now EXCLUDING
      // cancelled settlements (the real gap this fix closes: the old query had no status filter at
      // all and could surface a superseded/cancelled settlement as "the" one via created_at DESC).
      if (!s) {
        const settlRes = await client.query<Record<string, unknown>>(
          `SELECT ${settlementCols}
             FROM driver_finance.driver_settlements s
            WHERE s.operating_company_id = $1::uuid
              AND s.status <> 'cancelled'
              AND (
                s.first_load_id = $2::uuid
                OR s.last_load_id = $2::uuid
                OR EXISTS (
                  SELECT 1
                  FROM driver_finance.settlement_lines sl
                  LEFT JOIN driver_finance.driver_bills db ON db.id = sl.source_driver_bill_id
                  WHERE sl.settlement_id = s.id
                    AND COALESCE(db.load_id, sl.load_id) = $2::uuid
                    AND sl.is_active AND sl.voided_at IS NULL
                )
              )
            ORDER BY s.created_at DESC
            LIMIT 1`,
          [operating_company_id, loadId]
        );
        s = settlRes.rows[0] ?? null;
      }

      if (!s) return { settlement: null };

      const driverRes = await client.query<{ driver_name: string | null }>(
        `SELECT concat(d.first_name, ' ', d.last_name) AS driver_name
         FROM mdata.drivers d
         WHERE d.id = $1
           AND (d.operating_company_id = $2::uuid OR EXISTS (
             SELECT 1 FROM mdata.driver_company_authorizations settlement_summary_driver_dca
             WHERE settlement_summary_driver_dca.driver_id = d.id
               AND settlement_summary_driver_dca.company_id = $2::uuid
               AND settlement_summary_driver_dca.is_authorized = true
               AND settlement_summary_driver_dca.deactivated_at IS NULL
           ))
         LIMIT 1`,
        [s.driver_id, operating_company_id]
      );
      const driverName = driverRes.rows[0]?.driver_name ?? null;

      return {
        settlement: {
          id: String(s.id ?? ""),
          display_id: s.display_id ? String(s.display_id) : null,
          source_document_ref: s.source_document_ref ? String(s.source_document_ref) : null,
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

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, dateRangeOrderError, reportBasisSchema, validationError, withCompanyScope } from "./shared.js";

const querySchema = companyQuerySchema.extend({
  cycle_start: z.string().optional(),
  cycle_end: z.string().optional(),
  basis: reportBasisSchema,
});

function previousCycleWindow() {
  const now = new Date();
  const currentDay = now.getUTCDay();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - currentDay, 0, 0, 0, 0));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 7);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export async function registerDriverSettlementSummaryRoutes(app: FastifyInstance) {
  // Rate-limited because this is an authorized read (CodeQL js/missing-rate-limiting). The guard flagged
  // it as soon as the escrow fix pulled this file into scope — it has always been unlimited, it was just
  // never in a changed-file set before. 60/min matches the other authorized report reads.
  app.get("/api/v1/reports/driver-settlement-summary", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const cycle = previousCycleWindow();
    const cycleStart = query.data.cycle_start ?? cycle.start;
    const cycleEnd = query.data.cycle_end ?? cycle.end;
    if (cycleStart > cycleEnd) return dateRangeOrderError(reply, "cycle_start", "cycle_end");

    const rows = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT
            s.driver_id,
            CONCAT_WS(' ', d.first_name, d.last_name) AS driver_name,
            COALESCE(ROUND(s.gross_pay::numeric * 100), 0)::bigint AS gross_cents,
            COALESCE(ROUND(s.deductions_total::numeric * 100), 0)::bigint AS deductions_cents,
            COALESCE(ROUND(s.reimbursements_total::numeric * 100), 0)::bigint AS advances_cents,
            -- Escrow withheld for THIS settlement, from the canonical escrow ledger.
            -- Was COALESCE(v.escrow_withheld, 0) * 100 off views.driver_settlement_with_debt — a column
            -- that does not exist on that view and is defined by no migration. Postgres resolves columns
            -- at PLAN time, so this endpoint threw "column v.escrow_withheld does not exist" on every
            -- request, for every entity and every date range, regardless of how many rows matched.
            -- driver_finance.escrow_ledger.amount_cents is ALREADY cents, so there is no *100 here;
            -- keeping the old scaling would have inflated escrow 100x the moment real rows existed.
            -- transaction_type is CHECK-constrained to ('hold','release','forfeit'); "withheld" is the
            -- HOLD sum — netting releases/forfeits in would under-report what was withheld this period.
            COALESCE((
              SELECT SUM(el.amount_cents)
              FROM driver_finance.escrow_ledger el
              WHERE el.settlement_id = s.id
                AND el.operating_company_id = s.operating_company_id
                AND el.transaction_type = 'hold'
            ), 0)::bigint AS escrow_cents,
            COALESCE(ROUND(s.net_pay::numeric * 100), 0)::bigint AS net_cents,
            s.status
          FROM driver_finance.driver_settlements s
          -- Entity predicate on the JOIN (CLS-JOIN-ENTITY-UNSCOPED): scoping s does not scope d, and
          -- org.user_accessible_company_ids() returns EVERY company for an Owner, so RLS is not a
          -- backstop here — an unscoped join could print another entity's driver name on a pay report.
          LEFT JOIN mdata.drivers d ON d.id = s.driver_id
                                   AND d.operating_company_id = s.operating_company_id
          WHERE s.operating_company_id = $1::uuid
            AND s.status IS DISTINCT FROM 'cancelled'
            AND s.period_start >= $2::date
            AND s.period_end <= $3::date
          ORDER BY s.period_start DESC
        `,
        [query.data.operating_company_id, cycleStart, cycleEnd]
      );
      return res.rows;
    });

    return {
      cycle_start: cycleStart,
      cycle_end: cycleEnd,
      basis: query.data.basis,
      rows,
    };
  });
}

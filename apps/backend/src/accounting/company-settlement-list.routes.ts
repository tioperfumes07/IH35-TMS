/**
 * Company Settlement List — GET /api/v1/accounting/company-settlements
 *
 * The last open piece of M.3 (owner numbered-sequence, CC-3 block): "company-settlement list/detail
 * vertical remains open" (docs/bus/OUTBOX-CC-3.md, M.3 follow-up finding on PR #20605). The DETAIL
 * half already exists (company-settlement-report.routes.ts, GET .../:id/report, 8-section waterfall).
 * This is the missing LIST half Cursor's L.6 (company settlements FE) needs to render a table before
 * a user picks one to open the detail report.
 *
 * CANONICAL-CHECK: reads accounting.company_settlements directly for the header row (status, period,
 * display_id) and REUSES buildCompanySettlementReport() per row for net_revenue_cents — never a
 * second, competing waterfall calculation. At USMCA's current scale (a handful of company
 * settlements) this is cheap; if the row count grows materially, a summary column can be
 * materialized later without changing this route's shape.
 */
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import { buildCompanySettlementReport } from "./company-settlement-report.service.js";

type CompanySettlementListRow = {
  id: string;
  display_id: string;
  period_start: string;
  period_end: string;
  status: string;
  closed_at: string | null;
  voided_at: string | null;
  driver_settlement_count: number;
  net_revenue_cents: number | null;
};

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

async function listCompanySettlements(client: DbClient, operatingCompanyId: string): Promise<CompanySettlementListRow[]> {
  const headerRes = await client.query<{
    id: string;
    display_id: string;
    period_start: string;
    period_end: string;
    status: string;
    closed_at: string | null;
    voided_at: string | null;
    driver_settlement_count: string;
  }>(
    `
      SELECT
        cs.id::text,
        cs.display_id,
        cs.period_start::text,
        cs.period_end::text,
        cs.status,
        cs.closed_at::text,
        cs.voided_at::text,
        count(csds.driver_settlement_id)::text AS driver_settlement_count
      FROM accounting.company_settlements cs
      LEFT JOIN accounting.company_settlement_driver_settlements csds ON csds.company_settlement_id = cs.id
      WHERE cs.operating_company_id = $1::uuid
      GROUP BY cs.id, cs.display_id, cs.period_start, cs.period_end, cs.status, cs.closed_at, cs.voided_at
      ORDER BY cs.period_start DESC, cs.display_id DESC
    `,
    [operatingCompanyId]
  );

  const rows: CompanySettlementListRow[] = [];
  for (const header of headerRes.rows) {
    let netRevenueCents: number | null = null;
    // Voided settlements carry no meaningful waterfall (never re-derive money for a reversed
    // document) — a dash on the list, never a fake $0.00 (law §8).
    if (!header.voided_at) {
      const report = await buildCompanySettlementReport(client, {
        companySettlementId: header.id,
        operatingCompanyId,
      });
      netRevenueCents = report?.sections.pl_rollup.net_revenue_cents ?? null;
    }
    rows.push({
      id: header.id,
      display_id: header.display_id,
      period_start: header.period_start,
      period_end: header.period_end,
      status: header.status,
      closed_at: header.closed_at,
      voided_at: header.voided_at,
      driver_settlement_count: Number(header.driver_settlement_count),
      net_revenue_cents: netRevenueCents,
    });
  }
  return rows;
}

export async function registerCompanySettlementListRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/accounting/company-settlements",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;

      const query = companyQuerySchema.safeParse(req.query ?? {});
      if (!query.success) return validationError(reply, query.error);

      const rows = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) =>
        listCompanySettlements(client, query.data.operating_company_id)
      );

      return reply.code(200).send({ company_settlements: rows });
    }
  );
}

export default fp(async (app) => {
  await registerCompanySettlementListRoutes(app);
}, { name: "accounting.registerCompanySettlementListRoutes" });

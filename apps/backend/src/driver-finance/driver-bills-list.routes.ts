/**
 * GET /api/v1/driver-finance/driver-bills/list — A3 (STANDING-DIRECTIVES-2026-09-05.md §CC-1,
 * OWNER-ISSUE-INVENTORY inv #13: "Driver bills not appearing in Bills." Bills reads
 * accounting.bills only (USMCA 0); the real driver bills live in driver_finance.driver_bills
 * (canonical) — this is the missing general-purpose LIST the Bills page's "driver" category and
 * the "All bills" union both need. The two existing driver-bills routes are narrower: one is
 * per-load (?load_id=), the other is status='open'-only (for the settlements KPI band). This
 * returns EVERY driver bill for the company (any status), void hidden by default, with the exact
 * columns the reference asks for: Bill # · Driver · Load · Loaded mi · Rate · Empty mi · Rate ·
 * Gross · Status · Settlement.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { currentAuthUser, validationError, withCompanyScope } from "../accounting/shared.js";

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
  include_voided: z.coerce.boolean().default(false),
  limit: z.coerce.number().int().min(1).max(500).default(200),
  offset: z.coerce.number().int().min(0).default(0),
});

export type DriverBillListRow = {
  id: string;
  bill_number: string | null;
  driver_id: string;
  driver_name: string | null;
  load_id: string | null;
  load_number: string | null;
  miles_basis: number | null;
  rate_per_mile_cents: number | null;
  miles_deadhead: number | null;
  rate_empty_per_mile_cents: number | null;
  gross_amount_cents: number | null;
  status: string;
  settled_in_settlement_id: string | null;
  settlement_display_id: string | null;
  voided_at: string | null;
  created_at: string;
};

export async function registerDriverFinanceDriverBillsListRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/driver-finance/driver-bills/list",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;

      const parsed = querySchema.safeParse(req.query ?? {});
      if (!parsed.success) return validationError(reply, parsed.error);

      const payload = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
        const reg = await client.query(`SELECT to_regclass('driver_finance.driver_bills') IS NOT NULL AS ok`);
        if (!Boolean((reg.rows[0] as { ok?: boolean } | undefined)?.ok)) return { kind: "unavailable" as const };

        // ACCT-F5873 — live-caught same-day: 1 of 30 USMCA driver_bills rows has status='void' but
        // voided_at IS NULL (a real, pre-existing void-marker split-brain on driver_finance.
        // driver_bills, distinct from the accounting.bills trigger CC2-ACC-08 closed earlier this
        // session). Filtering on voided_at alone would have wrongly shown that one voided bill as
        // active. Excludes on EITHER signal, matching status_authoritative precedent elsewhere in
        // this codebase.
        const voidFilter = parsed.data.include_voided ? "" : "AND db.status <> 'void' AND db.voided_at IS NULL";
        const countRes = await client.query(
          `SELECT count(*)::int AS cnt FROM driver_finance.driver_bills db WHERE db.operating_company_id = $1::uuid ${voidFilter}`,
          [parsed.data.operating_company_id]
        );

        const rowsRes = await client.query(
          `
            SELECT
              db.id::text AS id,
              db.bill_number,
              db.driver_id::text AS driver_id,
              concat_ws(' ', d.first_name, d.last_name) AS driver_name,
              db.load_id::text AS load_id,
              db.load_number,
              db.miles_basis,
              db.rate_per_mile_cents,
              db.miles_deadhead,
              db.rate_empty_per_mile_cents,
              db.gross_amount_cents,
              db.status,
              db.settled_in_settlement_id::text AS settled_in_settlement_id,
              ds.display_id AS settlement_display_id,
              db.voided_at::text AS voided_at,
              db.created_at::text AS created_at
            FROM driver_finance.driver_bills db
            LEFT JOIN mdata.drivers d ON d.id = db.driver_id AND d.operating_company_id = db.operating_company_id
            LEFT JOIN driver_finance.driver_settlements ds ON ds.id = db.settled_in_settlement_id AND ds.operating_company_id = db.operating_company_id
            WHERE db.operating_company_id = $1::uuid
              ${voidFilter}
            ORDER BY db.created_at DESC
            LIMIT $2 OFFSET $3
          `,
          [parsed.data.operating_company_id, parsed.data.limit, parsed.data.offset]
        );

        return {
          kind: "ok" as const,
          total_count: Number((countRes.rows[0] as { cnt?: number } | undefined)?.cnt ?? 0),
          rows: rowsRes.rows as DriverBillListRow[],
        };
      });

      if (!payload) return reply.code(500).send({ error: "driver_bills_list_failed" });
      if (payload.kind === "unavailable") return reply.code(501).send({ error: "driver_finance_schema_not_available" });

      return reply.code(200).send({ total_count: payload.total_count, driver_bills: payload.rows });
    }
  );
}

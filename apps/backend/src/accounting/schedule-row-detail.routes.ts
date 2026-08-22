import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { withCurrentUser } from "../auth/db.js";
import { companyQuerySchema, currentAuthUser, validationError } from "./shared.js";

const paramsSchema = z.object({
  kind: z.enum(["prepaid_amortization_row", "depreciation_schedule_row", "loan_amortization_row"]),
  id: z.string().uuid(),
});

export async function registerScheduleRowDetailRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/schedule-rows/:kind/:id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const params = paramsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const opco = query.data.operating_company_id;
    await assertCompanyMembership(user.uuid, opco);
    const row = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
      const sqlByKind = {
        prepaid_amortization_row: `SELECT r.id::text, 'prepaid_amortization_row' AS kind, r.period_number AS sequence,
          r.period_date::text AS effective_date, r.amount_cents::text AS amount_cents, r.remaining_balance_cents::text AS balance_cents,
          r.posted, r.posted_journal_entry_id::text, p.id::text AS parent_id, 'prepaid_asset' AS parent_kind,
          COALESCE(p.asset_number, p.description) AS parent_label
          FROM accounting.prepaid_amortization_rows r JOIN accounting.prepaid_assets p
            ON p.id = r.asset_id AND p.operating_company_id = r.operating_company_id
          WHERE r.operating_company_id = $1::uuid AND r.id = $2::uuid LIMIT 1`,
        depreciation_schedule_row: `SELECT r.id::text, 'depreciation_schedule_row' AS kind, r.period_number AS sequence,
          r.period_date::text AS effective_date, r.depreciation_amount_cents::text AS amount_cents, r.book_value_end_cents::text AS balance_cents,
          r.posted, r.posted_journal_entry_id::text, a.id::text AS parent_id, 'fixed_asset' AS parent_kind,
          COALESCE(a.asset_number, a.name) AS parent_label
          FROM accounting.depreciation_schedule_rows r JOIN accounting.fixed_assets a
            ON a.id = r.asset_id AND a.operating_company_id = r.operating_company_id
          WHERE r.operating_company_id = $1::uuid AND r.id = $2::uuid LIMIT 1`,
        loan_amortization_row: `SELECT r.id::text, 'loan_amortization_row' AS kind, r.payment_number AS sequence,
          r.due_date::text AS effective_date, r.payment_cents::text AS amount_cents, r.remaining_balance_cents::text AS balance_cents,
          r.posted, r.posted_journal_entry_id::text, l.id::text AS parent_id, 'finance_loan' AS parent_kind, l.name AS parent_label
          FROM finance.loan_amortization_rows r JOIN finance.loans l
            ON l.id = r.loan_id AND l.operating_company_id = r.operating_company_id
          WHERE r.operating_company_id = $1::uuid AND r.id = $2::uuid LIMIT 1`,
      } as const;
      const result = await client.query(sqlByKind[params.data.kind], [opco, params.data.id]);
      return result.rows[0] ?? null;
    });
    if (!row) return reply.code(404).send({ error: "SCHEDULE_ROW_NOT_FOUND", message: "Schedule row not found for this operating company." });
    return reply.send(row);
  });
}

export default fp(registerScheduleRowDetailRoutes, { name: "accounting-schedule-row-detail-routes" });

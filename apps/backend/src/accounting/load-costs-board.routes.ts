import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { countUncategorizedTransactions } from "../banking/pending-categorization.js";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";

export async function registerLoadCostsBoardRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/load-costs-board", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!["Owner", "Administrator", "Accountant", "Dispatcher", "SuperAdmin"].includes(String(user.role ?? ""))) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    return withCompanyScope(String(user.uuid), parsed.data.operating_company_id, async (client) => {
      const result = await client.query(
        `WITH expense_costs AS (
           SELECT e.load_id,
                  COALESCE(SUM(e.total_amount_cents), 0)::bigint AS expense_cents,
                  COUNT(*)::int AS expense_count
             FROM accounting.expenses e
            WHERE e.operating_company_id = $1::uuid
              AND e.load_id IS NOT NULL
              AND e.status <> 'void'
            GROUP BY e.load_id
         ), bill_costs AS (
           SELECT bl.load_id,
                  COALESCE(SUM(ROUND(bl.amount * 100)), 0)::bigint AS bill_cents,
                  COUNT(DISTINCT b.id)::int AS bill_count,
                  COUNT(DISTINCT b.id) FILTER (WHERE b.status IN ('open','unpaid','partial','partially_paid'))::int AS unpaid_bill_count
             FROM accounting.bill_lines bl
             JOIN accounting.bills b
               ON b.id = bl.bill_id
              AND b.operating_company_id = $1::uuid
            WHERE bl.load_id IS NOT NULL
              AND b.status NOT IN ('void','voided')
              AND b.revoked_at IS NULL
            GROUP BY bl.load_id
         ), driver_pay AS (
           SELECT db.load_id,
                  COALESCE(SUM(db.gross_amount_cents), 0)::bigint AS driver_pay_cents
             FROM driver_finance.driver_bills db
            WHERE db.operating_company_id = $1::uuid
              AND db.load_id IS NOT NULL
              AND db.status <> 'void'
            GROUP BY db.load_id
         )
         SELECT COALESCE(ec.load_id, bc.load_id, dp.load_id)::text AS load_id,
                COALESCE(ec.expense_cents, 0)::text AS expense_cents,
                COALESCE(bc.bill_cents, 0)::text AS bill_cents,
                COALESCE(dp.driver_pay_cents, 0)::text AS driver_pay_cents,
                COALESCE(ec.expense_count, 0)::int AS expense_count,
                COALESCE(bc.bill_count, 0)::int AS bill_count,
                COALESCE(bc.unpaid_bill_count, 0)::int AS unpaid_bill_count
           FROM expense_costs ec
           FULL OUTER JOIN bill_costs bc ON bc.load_id = ec.load_id
           FULL OUTER JOIN driver_pay dp ON dp.load_id = COALESCE(ec.load_id, bc.load_id)`,
        [parsed.data.operating_company_id]
      );
      const unmatchedBank = await countUncategorizedTransactions(client, parsed.data.operating_company_id);
      return { rows: result.rows, unmatched_bank_count: unmatchedBank };
    });
  });
}

export default fp(async (app) => {
  await registerLoadCostsBoardRoutes(app);
}, { name: "accounting.registerLoadCostsBoardRoutes" });

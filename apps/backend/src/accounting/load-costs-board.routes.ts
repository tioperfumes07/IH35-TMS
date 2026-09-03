import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { countUncategorizedTransactions } from "../banking/pending-categorization.js";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";

/** TAB-COMPLETION-STANDARD A — twelve hubs, both-way or explicit N/A. Silence is a defect. */
export const LOAD_COSTS_HUB_LINKAGE = {
  1: { hub: "org.companies", via: "operating_company_id on loads, expenses, bills, driver_bills", reverse: "company-scoped lists" },
  2: { hub: "identity.users", via: "created_by / actor on expense and bill rows when present", reverse: "user activity / audit" },
  3: { hub: "mdata.drivers", via: "load.assigned_primary_driver_id; expense.driver_uuid; bill.driver_id", reverse: "driver profile costs / bills" },
  4: { hub: "mdata.units", via: "load.assigned_unit_id", reverse: "unit profile loads" },
  5: { hub: "mdata.loads", via: "load_id on expenses, bill_lines, driver_bills — the board key", reverse: "this board and load Costs tab" },
  6: { hub: "catalogs.accounts", via: "expense and bill line GL account when coded", reverse: "GL / account register" },
  7: { hub: "mdata.customers", via: "load.customer_id", reverse: "customer loads" },
  8: { hub: "maintenance.work_orders", na: "A load cost is an expense or vendor bill, not a shop work order. When a shop bill is load-coded, the bill still carries load_id; the WO surface finds it through the bill, not this aggregate." },
  9: { hub: "mdata.vendors", via: "expense.vendor_id and bills.vendor_id", reverse: "vendor bills / expenses" },
  10: { hub: "accounting.journal_entries", via: "posting on the expense or bill, never a parallel ledger", reverse: "JE source links" },
  11: { hub: "docs.files", via: "receipts / attachments on the expense or bill", reverse: "Docs module by source id" },
  12: { hub: "mdata.equipment", via: "load.trailer_id when a trailer is assigned", reverse: "equipment / trailer loads" },
} as const;

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
      return { rows: result.rows, unmatched_bank_count: unmatchedBank, linkage: LOAD_COSTS_HUB_LINKAGE };
    });
  });
}

export default fp(async (app) => {
  await registerLoadCostsBoardRoutes(app);
}, { name: "accounting.registerLoadCostsBoardRoutes" });

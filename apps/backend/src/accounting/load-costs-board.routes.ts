import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
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
  8: { hub: "maintenance.work_orders", via: "same-load linked_work_order_uuid on the expense or bill; only direct trip repairs enter R&M", reverse: "work order financial links and load Costs board" },
  9: { hub: "mdata.vendors", via: "expense.vendor_id and bills.vendor_id", reverse: "vendor bills / expenses" },
  10: { hub: "accounting.journal_entries", via: "posting on the expense or bill, never a parallel ledger", reverse: "JE source links" },
  11: { hub: "docs.files", via: "receipts / attachments on the expense or bill", reverse: "Docs module by source id" },
  12: { hub: "mdata.equipment", via: "dispatch.load_assignment_history.new_trailer_id, most recent row (mdata.loads has no trailer_id column)", reverse: "equipment / trailer loads" },
} as const;

export async function registerLoadCostsBoardRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/load-costs-board", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!["Owner", "Administrator", "Accountant", "Dispatcher", "SuperAdmin"].includes(String(user.role ?? ""))) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const parsed = companyQuerySchema.extend({
      load_costs_sort: z.enum(["load", "status", "pickup_date", "projected_delivery", "delivered", "route_crew", "revenue", "costs", "repairs_maintenance", "driver", "margin", "late_fee", "lumper", "fuel", "rm_exp"]).default("load"),
      sort_direction: z.enum(["asc", "desc"]).default("desc"),
    }).safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    return withCompanyScope(String(user.uuid), parsed.data.operating_company_id, async (client) => {
      const sortColumns = { load:"l.load_number", status:"l.status", pickup_date:"pickup.scheduled_arrival_at", projected_delivery:"delivery.scheduled_arrival_at", delivered:"delivery.actual_arrival_at", route_crew:"pickup.city", revenue:"l.rate_total_cents", costs:"(COALESCE(ec.expense_cents,0)+COALESCE(bc.bill_cents,0))", repairs_maintenance:"COALESCE(rm.repairs_maintenance_cents,0)", driver:"COALESCE(dp.driver_pay_cents,0)", margin:"(l.rate_total_cents-COALESCE(ec.expense_cents,0)-COALESCE(bc.bill_cents,0)-COALESCE(dp.driver_pay_cents,0))", late_fee:"COALESCE(cc.late_fee_cents,0)", lumper:"COALESCE(cc.lumper_cents,0)", fuel:"COALESCE(cc.fuel_cents,0)", rm_exp:"COALESCE(cc.rm_exp_cents,0)" } as const;
      const sortSql = `${sortColumns[parsed.data.load_costs_sort]} ${parsed.data.sort_direction.toUpperCase()} NULLS LAST, l.load_number ASC`;
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
              AND bl.voided_at IS NULL
            GROUP BY bl.load_id
         ), repair_documents AS (
           SELECT e.load_id, e.total_amount_cents::bigint AS amount_cents
             FROM accounting.expenses e
             JOIN maintenance.work_orders wo
               ON wo.id = e.linked_work_order_uuid
              AND wo.operating_company_id = e.operating_company_id
              AND wo.load_id = e.load_id
              AND wo.load_id IS NOT NULL
              AND wo.status <> 'cancelled'
            WHERE e.operating_company_id = $1::uuid
              AND e.load_id IS NOT NULL
              AND e.status <> 'void'
           UNION ALL
           SELECT bl.load_id, ROUND(bl.amount * 100)::bigint AS amount_cents
             FROM accounting.bill_lines bl
             JOIN accounting.bills b
               ON b.id = bl.bill_id
              AND b.operating_company_id = $1::uuid
             JOIN maintenance.work_orders wo
               ON wo.id = b.linked_work_order_uuid
              AND wo.operating_company_id = b.operating_company_id
              AND wo.load_id = bl.load_id
              AND wo.load_id IS NOT NULL
              AND wo.status <> 'cancelled'
            WHERE bl.load_id IS NOT NULL
              AND b.status NOT IN ('void','voided')
              AND b.revoked_at IS NULL
              AND bl.voided_at IS NULL
         ), repair_costs AS (
           SELECT load_id, COALESCE(SUM(amount_cents), 0)::bigint AS repairs_maintenance_cents
             FROM repair_documents
            GROUP BY load_id
         ), driver_pay AS (
           SELECT db.load_id,
                  COALESCE(SUM(db.gross_amount_cents), 0)::bigint AS driver_pay_cents
             FROM driver_finance.driver_bills db
            WHERE db.operating_company_id = $1::uuid
              AND db.load_id IS NOT NULL
              AND db.status <> 'void'
            GROUP BY db.load_id
         ), category_costs AS (
           SELECT load_id,
                  COALESCE(SUM(amount_cents) FILTER (WHERE line_category IN ('detention_paid')), 0)::bigint AS late_fee_cents,
                  COALESCE(SUM(amount_cents) FILTER (WHERE line_category = 'lumper'), 0)::bigint AS lumper_cents,
                  COALESCE(SUM(amount_cents) FILTER (WHERE line_category IN ('diesel','def')), 0)::bigint AS fuel_cents,
                  COALESCE(SUM(amount_cents) FILTER (WHERE line_category = 'roadside_repair'), 0)::bigint AS rm_exp_cents
             FROM (
               SELECT el.load_id, el.line_category, ROUND(el.amount * 100)::bigint AS amount_cents
                 FROM accounting.expense_lines el
                 JOIN accounting.expenses e ON e.id = el.expense_id
                WHERE e.operating_company_id = $1::uuid
                  AND el.load_id IS NOT NULL
                  AND e.status <> 'void'
               UNION ALL
               SELECT bl.load_id, bl.line_category, ROUND(bl.amount * 100)::bigint AS amount_cents
                 FROM accounting.bill_lines bl
                 JOIN accounting.bills b ON b.id = bl.bill_id
                WHERE b.operating_company_id = $1::uuid
                  AND bl.load_id IS NOT NULL
                  AND b.status NOT IN ('void','voided')
                  AND b.revoked_at IS NULL
                  AND bl.voided_at IS NULL
             ) x
            GROUP BY load_id
         )
         SELECT l.id::text AS load_id, l.load_number, l.status::text, COALESCE(c.customer_name, mdata.resolve_customer_label_same_company(l.customer_id,l.operating_company_id)) AS customer_name,
                mdata.resolve_driver_label_same_company(l.assigned_primary_driver_id,l.operating_company_id) AS driver_name,
                u.unit_number, tr.equipment_number AS trailer_number, pickup.city AS pickup_city, delivery.city AS delivery_city,
                pickup.scheduled_arrival_at::text AS pickup_date, delivery.scheduled_arrival_at::text AS scheduled_delivery_at,
                delivery.actual_arrival_at::text AS actual_delivery_at, l.created_at::text, l.rate_total_cents::text AS revenue_cents,
                COALESCE(ec.expense_cents, 0)::text AS expense_cents,
                COALESCE(bc.bill_cents, 0)::text AS bill_cents,
                COALESCE(rm.repairs_maintenance_cents, 0)::text AS repairs_maintenance_cents,
                COALESCE(dp.driver_pay_cents, 0)::text AS driver_pay_cents,
                COALESCE(ec.expense_count, 0)::int AS expense_count,
                COALESCE(bc.bill_count, 0)::int AS bill_count,
                COALESCE(bc.unpaid_bill_count, 0)::int AS unpaid_bill_count,
                COALESCE(cc.late_fee_cents, 0)::text AS late_fee_cents,
                COALESCE(cc.lumper_cents, 0)::text AS lumper_cents,
                COALESCE(cc.fuel_cents, 0)::text AS fuel_cents,
                COALESCE(cc.rm_exp_cents, 0)::text AS rm_exp_cents
           FROM views.dispatch_load_with_driver_status l
           LEFT JOIN expense_costs ec ON ec.load_id=l.id LEFT JOIN bill_costs bc ON bc.load_id=l.id LEFT JOIN repair_costs rm ON rm.load_id=l.id LEFT JOIN driver_pay dp ON dp.load_id=l.id LEFT JOIN category_costs cc ON cc.load_id=l.id
           LEFT JOIN mdata.customers c ON c.id=l.customer_id AND c.operating_company_id=l.operating_company_id
           -- W-FIX-3b (loads.routes.ts, same rule): mdata.units has owner_company_id /
           -- currently_leased_to_company_id, never operating_company_id. mdata.loads has NO
           -- trailer_id column at all -- the only real trailer<->load link is
           -- dispatch.load_assignment_history.new_trailer_id (mdata.equipment). Both were wrong
           -- here (confirmed live: HTTP 500 on this exact endpoint); fixed to the same pattern
           -- already used by GET /api/v1/dispatch/loads (loads.routes.ts).
           LEFT JOIN mdata.units u ON u.id=l.assigned_unit_id AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id)=l.operating_company_id
           LEFT JOIN LATERAL (
             SELECT eq.equipment_number
               FROM dispatch.load_assignment_history lah
               JOIN mdata.equipment eq ON eq.id = lah.new_trailer_id
                                      AND (eq.owner_company_id = l.operating_company_id OR eq.currently_leased_to_company_id = l.operating_company_id)
              WHERE lah.load_id = l.id AND lah.new_trailer_id IS NOT NULL
              ORDER BY lah.assigned_at DESC
              LIMIT 1
           ) tr ON true
           LEFT JOIN LATERAL (SELECT city,scheduled_arrival_at FROM mdata.load_stops WHERE load_id=l.id AND stop_type='pickup' AND soft_deleted_at IS NULL ORDER BY sequence_number ASC LIMIT 1) pickup ON true
           LEFT JOIN LATERAL (SELECT city,scheduled_arrival_at,actual_arrival_at FROM mdata.load_stops WHERE load_id=l.id AND stop_type='delivery' AND soft_deleted_at IS NULL ORDER BY sequence_number DESC LIMIT 1) delivery ON true
          WHERE l.operating_company_id=$1::uuid AND l.soft_deleted_at IS NULL
          ORDER BY ${sortSql}`,
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

/**
 * DISPATCH-B — Unified Transaction Register.
 * GET /api/v1/accounting/transaction-register
 *
 * One read-only, entity-scoped list across every operational money event:
 * bank transactions, fuel purchases, invoices (AR), bills (AP) and driver
 * settlements. READ ONLY — no posting, no GL writes, no money mutation.
 *
 * Every source is scoped by operating_company_id (TRANSP in this tenant) both
 * via RLS (withCompanyScope sets app.operating_company_id) AND an explicit
 * predicate in each UNION arm — never cross-entity.
 *
 * Money is normalized to integer CENTS:
 *   - bank.amount_cents / invoice.total_cents / bill.amount_cents are already cents.
 *   - fuel.total_cost and settlement.net_pay are numeric DOLLARS -> *100 (no 10x bug).
 */
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";

const SOURCES = ["bank", "fuel", "invoice", "bill", "settlement"] as const;

const querySchema = companyQuerySchema.extend({
  source: z
    .union([z.enum(SOURCES), z.array(z.enum(SOURCES))])
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
  status: z
    .union([z.string().trim().min(1).max(40), z.array(z.string().trim().min(1).max(40))])
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
  direction: z.enum(["in", "out", "all"]).optional().default("all"),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  q: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

type RegisterRow = {
  source: string;
  id: string;
  txn_date: string | null;
  description: string | null;
  counterparty: string | null;
  type: string;
  amount_in_cents: string;
  amount_out_cents: string;
  status: string | null;
  detail_path: string | null;
  total_count: string;
};

// The unified UNION ALL. $1 = operating_company_id (reused by every arm).
// Columns verified against db/migrations: banking.bank_transactions (0073),
// fuel.fuel_transactions (0300), accounting.invoices (0060), accounting.bills
// (0090), driver_finance.driver_settlements (0124).
export const TRANSACTION_REGISTER_UNION_SQL = `
  SELECT 'bank' AS source, bt.id::text AS id, bt.transaction_date AS txn_date,
         COALESCE(NULLIF(bt.description, ''), bt.merchant_name, 'Bank transaction') AS description,
         bt.merchant_name AS counterparty,
         'Bank' AS type,
         (CASE WHEN bt.is_credit THEN ABS(bt.amount_cents) ELSE 0 END)::bigint AS amount_in_cents,
         (CASE WHEN bt.is_credit THEN 0 ELSE ABS(bt.amount_cents) END)::bigint AS amount_out_cents,
         COALESCE(bt.status, 'uncategorized') AS status,
         '/banking/transactions' AS detail_path
    FROM banking.bank_transactions bt
   WHERE bt.operating_company_id = $1

  UNION ALL

  SELECT 'fuel' AS source, ft.id::text AS id, ft.purchased_at::date AS txn_date,
         COALESCE('Fuel' || CASE WHEN NULLIF(ft.location_city, '') IS NOT NULL
                                 THEN ' — ' || ft.location_city ELSE '' END, 'Fuel purchase') AS description,
         v.vendor_name AS counterparty,
         'Fuel' AS type,
         0::bigint AS amount_in_cents,
         ROUND(COALESCE(ft.total_cost, 0) * 100)::bigint AS amount_out_cents,
         (CASE WHEN ft.qbo_expense_id IS NOT NULL THEN 'synced' ELSE 'recorded' END) AS status,
         '/fuel/history' AS detail_path
    FROM fuel.fuel_transactions ft
    LEFT JOIN mdata.vendors v ON v.id = ft.vendor_id
   WHERE ft.operating_company_id = $1 AND ft.archived_at IS NULL

  UNION ALL

  SELECT 'invoice' AS source, i.id::text AS id, i.issue_date AS txn_date,
         COALESCE(i.display_id, 'Invoice') AS description,
         c.customer_name AS counterparty,
         'Invoice (AR)' AS type,
         COALESCE(i.total_cents, 0)::bigint AS amount_in_cents,
         0::bigint AS amount_out_cents,
         i.status,
         '/accounting/invoices/' || i.id::text AS detail_path
    FROM accounting.invoices i
    LEFT JOIN mdata.customers c ON c.id = i.customer_id
   WHERE i.operating_company_id = $1

  UNION ALL

  SELECT 'bill' AS source, b.id::text AS id, b.bill_date AS txn_date,
         COALESCE(NULLIF(b.bill_number, ''), b.display_id, 'Bill') AS description,
         v.vendor_name AS counterparty,
         'Bill (AP)' AS type,
         0::bigint AS amount_in_cents,
         COALESCE(b.amount_cents, ROUND(COALESCE(b.total_amount, 0) * 100)::bigint, 0)::bigint AS amount_out_cents,
         b.status,
         '/accounting/bills' AS detail_path
    FROM accounting.bills b
    LEFT JOIN mdata.vendors v ON v.id::text = b.vendor_uuid
   WHERE b.operating_company_id = $1 AND b.revoked_at IS NULL

  UNION ALL

  SELECT 'settlement' AS source, s.id::text AS id, s.period_end AS txn_date,
         COALESCE(s.display_id, 'Settlement')
           || CASE WHEN TRIM(CONCAT_WS(' ', d.first_name, d.last_name)) <> ''
                   THEN ' — ' || CONCAT_WS(' ', d.first_name, d.last_name) ELSE '' END AS description,
         NULLIF(TRIM(CONCAT_WS(' ', d.first_name, d.last_name)), '') AS counterparty,
         'Settlement' AS type,
         0::bigint AS amount_in_cents,
         ROUND(COALESCE(s.net_pay, 0) * 100)::bigint AS amount_out_cents,
         s.status,
         '/driver-finance/settlements' AS detail_path
    FROM driver_finance.driver_settlements s
    LEFT JOIN mdata.drivers d ON d.id = s.driver_id
   WHERE s.operating_company_id = $1
`;

export async function registerTransactionRegisterRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/transaction-register", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const parsed = querySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const q = parsed.data;

    return withCompanyScope(user.uuid, q.operating_company_id, async (client) => {
      const where: string[] = [];
      const values: unknown[] = [q.operating_company_id];

      if (q.source && q.source.length > 0) {
        values.push(q.source);
        where.push(`source = ANY($${values.length}::text[])`);
      }
      if (q.status && q.status.length > 0) {
        values.push(q.status);
        where.push(`status = ANY($${values.length}::text[])`);
      }
      if (q.date_from) {
        values.push(q.date_from);
        where.push(`txn_date >= $${values.length}::date`);
      }
      if (q.date_to) {
        values.push(q.date_to);
        where.push(`txn_date <= $${values.length}::date`);
      }
      if (q.direction === "in") where.push(`amount_in_cents > 0`);
      if (q.direction === "out") where.push(`amount_out_cents > 0`);
      if (q.q) {
        values.push(`%${q.q}%`);
        where.push(`(description ILIKE $${values.length} OR counterparty ILIKE $${values.length})`);
      }

      const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
      values.push(q.limit);
      const limitIdx = values.length;
      values.push(q.offset);
      const offsetIdx = values.length;

      const sql = `
        WITH reg AS (${TRANSACTION_REGISTER_UNION_SQL})
        SELECT source, id, txn_date::text AS txn_date, description, counterparty, type,
               amount_in_cents::text AS amount_in_cents, amount_out_cents::text AS amount_out_cents,
               status, detail_path,
               count(*) OVER()::text AS total_count
          FROM reg
          ${whereSql}
         ORDER BY txn_date DESC NULLS LAST, source ASC, id ASC
         LIMIT $${limitIdx} OFFSET $${offsetIdx}
      `;

      const res = await client.query(sql, values);
      const rows = res.rows as RegisterRow[];
      const total = rows.length > 0 ? Number(rows[0].total_count) : 0;

      return {
        rows: rows.map((r: RegisterRow) => ({
          source: r.source,
          id: r.id,
          date: r.txn_date,
          description: r.description,
          counterparty: r.counterparty,
          type: r.type,
          amount_in_cents: Number(r.amount_in_cents),
          amount_out_cents: Number(r.amount_out_cents),
          status: r.status,
          detail_path: r.detail_path,
        })),
        total,
        limit: q.limit,
        offset: q.offset,
      };
    });
  });
}

export default fp(async (app) => {
  await registerTransactionRegisterRoutes(app);
}, { name: "accounting.registerTransactionRegisterRoutes" });

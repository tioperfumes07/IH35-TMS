/**
 * expense-load-confirmation.routes.ts — OWNER RULING 443.288-B. The "Expense load confirmations" queue (Dispatch and
 * Settlements Close, Cursor 443.288-C renders it) and THE confirm / change action.
 *   GET  /api/v1/accounting/expense-load-confirmations   proposed (default) | confirmed | all; multi-select filters
 *        (comma lists): driver_ids, unit_ids, load_ids, vendor_ids, settlement_ids; date_from / date_to; paged.
 *   POST /api/v1/accounting/expense-load-confirmations/confirm   { operating_company_id, items: [{ expense_id, load_id? }],
 *        reason? } — Dispatcher, the Closer (Accountant / Administrator / Manager) or the Owner. Confirms the proposal or
 *        changes the load (the whole family moves through the engines), one audit row per expense.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCompanyScope } from "./db-scope.js";
import { confirmExpenseLoadsInClientTx, EXPENSE_LOAD_CONFIRM_ROLES, ExpenseLoadConfirmRefused } from "./expense-load-confirmation.service.js";

const uuidList = z.string().optional().transform((v, ctx) => {
  const ids = (v ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  if (ids.some((x) => !z.string().uuid().safeParse(x).success)) { ctx.addIssue({ code: "custom", message: "every id must be a uuid" }); return z.NEVER; }
  return ids;
});
const listQuery = z.object({
  operating_company_id: z.string().uuid(),
  status: z.enum(["proposed", "confirmed", "all"]).default("proposed"),
  driver_ids: uuidList, unit_ids: uuidList, load_ids: uuidList, vendor_ids: uuidList, settlement_ids: uuidList,
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
  offset: z.coerce.number().int().min(0).default(0),
});
const confirmBody = z.object({
  operating_company_id: z.string().uuid(),
  items: z.array(z.object({ expense_id: z.string().uuid(), load_id: z.string().uuid().nullable().optional() })).min(1).max(200),
  reason: z.string().max(500).optional(),
});

export async function registerExpenseLoadConfirmationRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/expense-load-confirmations", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!requireAuth(req, reply)) return reply;
    const user = req.user!;
    const q = listQuery.safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "validation_error", details: q.error.flatten() });
    const f = q.data;
    return withCompanyScope(user.uuid, f.operating_company_id, async (client) => {
      const where: string[] = ["e.operating_company_id = $1::uuid", "e.voided_at IS NULL", "e.load_id IS NOT NULL", "e.parent_expense_id IS NULL"];
      const values: unknown[] = [f.operating_company_id];
      const add = (sql: string, v: unknown) => { values.push(v); where.push(sql.replace("$?", `$${values.length}`)); };
      if (f.status !== "all") add("e.load_confirmation = $?", f.status);
      if (f.driver_ids?.length) add("COALESCE(e.driver_uuid, l.assigned_primary_driver_id) = ANY($?::uuid[])", f.driver_ids);
      if (f.unit_ids?.length) add("COALESCE(e.unit_id, l.assigned_unit_id) = ANY($?::uuid[])", f.unit_ids);
      if (f.load_ids?.length) add("e.load_id = ANY($?::uuid[])", f.load_ids);
      if (f.vendor_ids?.length) add("e.vendor_uuid = ANY($?::uuid[])", f.vendor_ids);
      if (f.settlement_ids?.length) {
        add(`e.load_id IN (SELECT sl.load_id FROM driver_finance.settlement_lines sl WHERE sl.operating_company_id = e.operating_company_id
              AND sl.settlement_id = ANY($?::uuid[]) AND sl.is_active = true AND sl.voided_at IS NULL)`, f.settlement_ids);
      }
      if (f.date_from) add("e.transaction_date >= $?::date", f.date_from);
      if (f.date_to) add("e.transaction_date <= $?::date", f.date_to);
      const whereSql = where.join(" AND ");
      const total = Number((await client.query(
        `SELECT count(*)::text AS n FROM accounting.expenses e JOIN mdata.loads l ON l.id = e.load_id AND l.operating_company_id = e.operating_company_id WHERE ${whereSql}`, values,
      )).rows[0]?.n ?? 0);
      values.push(f.limit, f.offset);
      const rows = (await client.query(
        `SELECT e.id::text AS expense_id, e.expense_number, e.transaction_date::text AS date, e.total_amount_cents::text AS amount_cents,
                e.load_confirmation, e.load_proposal_evidence AS evidence, e.load_confirmed_by_user_id::text AS confirmed_by_user_id,
                e.load_confirmed_at, e.source_fuel_transaction_id::text AS fuel_transaction_id,
                e.vendor_uuid::text AS vendor_id, v.vendor_name,
                COALESCE(e.driver_uuid, l.assigned_primary_driver_id)::text AS driver_id, NULLIF(btrim(concat_ws(' ', d.first_name, d.last_name)), '') AS driver_name,
                COALESCE(e.unit_id, l.assigned_unit_id)::text AS unit_id, u.unit_number,
                l.id::text AS load_id, l.load_number, l.status::text AS load_status,
                (SELECT count(*) FROM accounting.expenses c WHERE c.parent_expense_id = e.id AND c.voided_at IS NULL)::int AS children,
                (SELECT jsonb_agg(DISTINCT jsonb_build_object('settlement_id', s.id, 'display_id', s.display_id))
                   FROM driver_finance.settlement_lines sl JOIN driver_finance.driver_settlements s ON s.id = sl.settlement_id AND s.operating_company_id = sl.operating_company_id
                  WHERE sl.load_id = e.load_id AND sl.operating_company_id = e.operating_company_id AND sl.is_active = true
                    AND sl.voided_at IS NULL AND s.voided_at IS NULL) AS settlements
           FROM accounting.expenses e
           JOIN mdata.loads l ON l.id = e.load_id AND l.operating_company_id = e.operating_company_id
           LEFT JOIN mdata.vendors v ON v.id = e.vendor_uuid AND v.operating_company_id = e.operating_company_id
           LEFT JOIN mdata.drivers d ON d.id = COALESCE(e.driver_uuid, l.assigned_primary_driver_id) AND d.operating_company_id = e.operating_company_id
           LEFT JOIN mdata.units u ON u.id = COALESCE(e.unit_id, l.assigned_unit_id)
                                AND (u.owner_company_id = e.operating_company_id OR u.currently_leased_to_company_id = e.operating_company_id)
          WHERE ${whereSql}
          ORDER BY e.transaction_date DESC NULLS LAST, e.expense_number
          LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values,
      )).rows;
      return { status: f.status, total_count: total, limit: f.limit, offset: f.offset, rows };
    });
  });

  app.post("/api/v1/accounting/expense-load-confirmations/confirm", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!requireAuth(req, reply)) return reply;
    const user = req.user!;
    if (!EXPENSE_LOAD_CONFIRM_ROLES.has(String(user.role ?? ""))) {
      return reply.code(403).send({ error: "forbidden", detail: "Only a dispatcher, the closer or the owner confirms an expense's load." });
    }
    const b = confirmBody.safeParse(req.body ?? {});
    if (!b.success) return reply.code(400).send({ error: "validation_error", details: b.error.flatten() });
    try {
      return await withCompanyScope(user.uuid, b.data.operating_company_id, (client) => confirmExpenseLoadsInClientTx(client, {
        operatingCompanyId: b.data.operating_company_id, actorUserId: user.uuid, reason: b.data.reason,
        items: b.data.items.map((i) => ({ expenseId: i.expense_id, loadId: i.load_id ?? null })),
      }));
    } catch (e) {
      if (e instanceof ExpenseLoadConfirmRefused) return reply.code(409).send({ error: e.code, message: e.message, details: e.details ?? null });
      throw e;
    }
  });
}

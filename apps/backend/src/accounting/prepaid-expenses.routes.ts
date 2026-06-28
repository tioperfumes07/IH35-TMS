/**
 * UI-1 COMPLETE-BUILD — Prepaid Expenses
 * GET  /api/v1/accounting/prepaid-expenses          list prepaid assets
 * GET  /api/v1/accounting/prepaid-expenses/:id      detail + amortization schedule + JE preview
 * POST /api/v1/accounting/prepaid-expenses          create asset + generate schedule
 *
 * NetSuite/QBO parity: Prepaid expenses module — asset header + monthly amortization schedule.
 * GL posting GATED behind PREPAID_EXPENSES_POST_ENABLED (default OFF).
 * Balanced-JE preview always returned. Posting refused until flag ON (fail-loud).
 * Money = integer cents. Entity-scoped. RLS enforced.
 */
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { isEnabled } from "../lib/feature-flags/service.js";

const PREPAID_POST_FLAG = "PREPAID_EXPENSES_POST_ENABLED";

function accountingRoles(role: string) {
  return ["Owner", "Administrator", "Accountant"].includes(role);
}

const listQuerySchema = companyQuerySchema.extend({
  status: z.enum(["active", "fully_amortized", "voided"]).optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const detailParamsSchema = z.object({ id: z.string().uuid() });

const createBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  description: z.string().trim().min(1).max(200),
  asset_number: z.string().trim().max(40).optional(),
  vendor_uuid: z.string().uuid().optional(),
  purchase_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periods: z.number().int().min(1).max(360),
  total_amount_cents: z.number().int().positive(),
  asset_account_id: z.string().uuid().optional(),
  expense_account_id: z.string().uuid().optional(),
  payment_account_id: z.string().uuid().optional(),
});

function buildScheduleRows(
  assetId: string,
  operatingCompanyId: string,
  startDate: string,
  periods: number,
  totalCents: number,
  userId: string
) {
  const periodCents = Math.floor(totalCents / periods);
  const remainderCents = totalCents - periodCents * periods;
  const [y, m] = startDate.split("-").map(Number);
  const rows = [];
  let balance = totalCents;

  for (let i = 0; i < periods; i++) {
    const mn = (m - 1 + i) % 12;
    const yr = y + Math.floor((m - 1 + i) / 12);
    const periodDate = `${yr}-${String(mn + 1).padStart(2, "0")}-01`;
    const amount = i === periods - 1 ? periodCents + remainderCents : periodCents;
    balance -= amount;
    rows.push({ assetId, operatingCompanyId, periodNumber: i + 1, periodDate, amount, balance, userId });
  }
  return { periodCents, remainderCents, rows };
}

async function registerPrepaidExpensesRoutes(app: FastifyInstance) {
  // LIST
  app.get("/api/v1/accounting/prepaid-expenses", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!accountingRoles(user.role)) return reply.code(403).send({ error: "forbidden" });

    const parsed = listQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const { operating_company_id, status, date_from, date_to, limit, offset } = parsed.data;

    return withCompanyScope(user.uuid, operating_company_id, async (client) => {
      const conds = ["pa.operating_company_id = $1", "pa.is_active = true"];
      const params: unknown[] = [operating_company_id];
      let pi = 2;

      if (status) { conds.push(`pa.status = $${pi++}`); params.push(status); }
      if (date_from) { conds.push(`pa.purchase_date >= $${pi++}::date`); params.push(date_from); }
      if (date_to) { conds.push(`pa.purchase_date < ($${pi++}::date + interval '1 day')`); params.push(date_to); }

      const where = conds.join(" AND ");

      const countRes = await client.query(
        `SELECT COUNT(*)::text AS total FROM accounting.prepaid_assets pa WHERE ${where}`,
        params
      );
      const total = Number((countRes.rows[0] as { total: string }).total ?? 0);

      params.push(limit, offset);
      const listRes = await client.query(
        `SELECT
          pa.id,
          pa.asset_number,
          pa.description,
          pa.purchase_date::text          AS purchase_date,
          pa.start_date::text             AS start_date,
          pa.end_date::text               AS end_date,
          pa.total_amount_cents::text     AS total_amount_cents,
          pa.periods,
          pa.period_amount_cents::text    AS period_amount_cents,
          pa.remainder_cents::text        AS remainder_cents,
          pa.status,
          pa.posting_status,
          pa.posted_at::text              AS posted_at,
          pa.created_at::text             AS created_at,
          COALESCE(SUM(CASE WHEN r.posted THEN r.amount_cents ELSE 0 END), 0)::text AS amortized_cents,
          COUNT(r.id) FILTER (WHERE r.posted = false AND r.is_active)::text         AS pending_periods
        FROM accounting.prepaid_assets pa
        LEFT JOIN accounting.prepaid_amortization_rows r ON r.asset_id = pa.id AND r.is_active = true
        WHERE ${where}
        GROUP BY pa.id
        ORDER BY pa.purchase_date DESC
        LIMIT $${pi++} OFFSET $${pi++}`,
        params
      );

      return {
        total, limit, offset,
        items: listRes.rows.map((r: any) => ({
          id: r.id as string,
          asset_number: r.asset_number as string | null,
          description: r.description as string,
          purchase_date: r.purchase_date as string,
          start_date: r.start_date as string,
          end_date: r.end_date as string,
          total_amount_cents: Number(r.total_amount_cents),
          periods: r.periods as number,
          period_amount_cents: Number(r.period_amount_cents),
          remainder_cents: Number(r.remainder_cents),
          status: r.status as string,
          posting_status: r.posting_status as string,
          posted_at: r.posted_at as string | null,
          created_at: r.created_at as string,
          amortized_cents: Number(r.amortized_cents),
          pending_periods: Number(r.pending_periods),
        })),
      };
    });
  });

  // DETAIL + schedule + JE preview
  app.get("/api/v1/accounting/prepaid-expenses/:id", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!accountingRoles(user.role)) return reply.code(403).send({ error: "forbidden" });

    const pp = detailParamsSchema.safeParse(req.params);
    if (!pp.success) return validationError(reply, pp.error);

    const qp = companyQuerySchema.safeParse(req.query ?? {});
    if (!qp.success) return validationError(reply, qp.error);

    return withCompanyScope(user.uuid, qp.data.operating_company_id, async (client) => {
      const assetRes = await client.query(
        `SELECT pa.*,
          pa.purchase_date::text AS purchase_date_s, pa.start_date::text AS start_date_s,
          pa.end_date::text AS end_date_s,
          pa.total_amount_cents::text AS total_s, pa.period_amount_cents::text AS period_s,
          pa.remainder_cents::text AS remainder_s, pa.posted_at::text AS posted_at_s,
          pa.created_at::text AS created_at_s,
          COALESCE(SUM(CASE WHEN r.posted THEN r.amount_cents ELSE 0 END), 0)::text AS amortized_cents,
          COUNT(r.id) FILTER (WHERE r.posted = false AND r.is_active)::text AS pending_periods
        FROM accounting.prepaid_assets pa
        LEFT JOIN accounting.prepaid_amortization_rows r ON r.asset_id = pa.id AND r.is_active = true
        WHERE pa.id = $1 AND pa.operating_company_id = $2 AND pa.is_active = true
        GROUP BY pa.id`,
        [pp.data.id, qp.data.operating_company_id]
      );
      if (!assetRes.rows[0]) return reply.code(404).send({ error: "not_found" });
      const a = assetRes.rows[0] as any;

      const schedRes = await client.query(
        `SELECT id, period_number, period_date::text AS period_date,
                amount_cents::text AS amount_cents,
                remaining_balance_cents::text AS remaining_balance_cents,
                posted, posted_at::text AS posted_at,
                posted_journal_entry_id::text AS posted_journal_entry_id
         FROM accounting.prepaid_amortization_rows
         WHERE asset_id = $1 AND is_active = true
         ORDER BY period_number`,
        [pp.data.id]
      );

      const postEnabled = await isEnabled(client, PREPAID_POST_FLAG);
      const totalCents = Number(a.total_s);
      const periodCents = Number(a.period_s);

      const je_preview = {
        posting_enabled: postEnabled,
        purchase_je: a.asset_account_id && a.payment_account_id ? {
          balanced: true,
          lines: [
            { account_id: a.asset_account_id, debit_cents: totalCents, credit_cents: 0, memo: a.description },
            { account_id: a.payment_account_id, debit_cents: 0, credit_cents: totalCents, memo: "Prepaid purchase" },
          ],
        } : null,
        amortization_je_template: a.expense_account_id && a.asset_account_id ? {
          balanced: true,
          lines: [
            { account_id: a.expense_account_id, debit_cents: periodCents, credit_cents: 0, memo: "Prepaid amortization" },
            { account_id: a.asset_account_id, debit_cents: 0, credit_cents: periodCents, memo: a.description },
          ],
        } : null,
      };

      return {
        id: a.id, asset_number: a.asset_number, description: a.description,
        purchase_date: a.purchase_date_s, start_date: a.start_date_s, end_date: a.end_date_s,
        total_amount_cents: totalCents, periods: a.periods,
        period_amount_cents: periodCents, remainder_cents: Number(a.remainder_s),
        status: a.status, posting_status: a.posting_status, posted_at: a.posted_at_s,
        asset_account_id: a.asset_account_id, expense_account_id: a.expense_account_id,
        payment_account_id: a.payment_account_id, purchase_je_id: a.purchase_je_id,
        created_at: a.created_at_s,
        amortized_cents: Number(a.amortized_cents),
        pending_periods: Number(a.pending_periods),
        schedule: schedRes.rows.map((r: any) => ({
          id: r.id as string,
          period_number: r.period_number as number,
          period_date: r.period_date as string,
          amount_cents: Number(r.amount_cents),
          remaining_balance_cents: Number(r.remaining_balance_cents),
          posted: r.posted as boolean,
          posted_at: r.posted_at as string | null,
          posted_journal_entry_id: r.posted_journal_entry_id as string | null,
        })),
        je_preview,
      };
    });
  });

  // CREATE asset + generate schedule
  app.post("/api/v1/accounting/prepaid-expenses", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!accountingRoles(user.role)) return reply.code(403).send({ error: "forbidden" });

    const parsed = createBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const input = parsed.data;

    return withCompanyScope(user.uuid, input.operating_company_id, async (client) => {
      const postEnabled = await isEnabled(client, PREPAID_POST_FLAG);
      if (postEnabled) {
        return reply.code(422).send({
          error: "gl_posting_not_implemented",
          message: "PREPAID_EXPENSES_POST_ENABLED is ON but posting is not yet implemented. Set flag OFF.",
        });
      }

      const [sy, sm] = input.start_date.split("-").map(Number);
      const endYear = sy + Math.floor((sm - 1 + input.periods) / 12);
      const endMonth = ((sm - 1 + input.periods) % 12) + 1;
      const endDate = new Date(endYear, endMonth - 1, 0);
      const endDateStr = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;

      const periodCents = Math.floor(input.total_amount_cents / input.periods);
      const remainderCents = input.total_amount_cents - periodCents * input.periods;

      const assetRes = await client.query(
        `INSERT INTO accounting.prepaid_assets (
          operating_company_id, description, asset_number, vendor_uuid,
          purchase_date, start_date, end_date, total_amount_cents,
          periods, period_amount_cents, remainder_cents,
          asset_account_id, expense_account_id, payment_account_id,
          created_by_user_id, updated_by_user_id
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15)
        RETURNING id, asset_number, description,
          purchase_date::text, start_date::text, end_date::text,
          total_amount_cents::text, periods, period_amount_cents::text,
          remainder_cents::text, status, posting_status, created_at::text`,
        [
          input.operating_company_id, input.description, input.asset_number ?? null,
          input.vendor_uuid ?? null, input.purchase_date, input.start_date, endDateStr,
          input.total_amount_cents, input.periods, periodCents, remainderCents,
          input.asset_account_id ?? null, input.expense_account_id ?? null,
          input.payment_account_id ?? null, user.uuid,
        ]
      );
      const asset = assetRes.rows[0] as any;

      const { rows: schedRows } = buildScheduleRows(
        asset.id, input.operating_company_id, input.start_date,
        input.periods, input.total_amount_cents, user.uuid
      );

      for (const row of schedRows) {
        await client.query(
          `INSERT INTO accounting.prepaid_amortization_rows
            (asset_id, operating_company_id, period_number, period_date,
             amount_cents, remaining_balance_cents, created_by_user_id, updated_by_user_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$7)`,
          [row.assetId, row.operatingCompanyId, row.periodNumber, row.periodDate,
           row.amount, row.balance, row.userId]
        );
      }

      await appendCrudAudit(client, user.uuid, "prepaid_asset.created", {
        asset_id: asset.id,
        operating_company_id: input.operating_company_id,
        total_amount_cents: input.total_amount_cents,
        periods: input.periods,
        gl_posting_status: "deferred",
      }, "info", "UI-1-prepaid");

      return reply.code(201).send({
        id: asset.id,
        asset_number: asset.asset_number,
        description: asset.description,
        purchase_date: asset.purchase_date,
        start_date: asset.start_date,
        end_date: asset.end_date,
        total_amount_cents: Number(asset.total_amount_cents),
        periods: asset.periods,
        period_amount_cents: Number(asset.period_amount_cents),
        remainder_cents: Number(asset.remainder_cents),
        status: asset.status,
        posting_status: asset.posting_status,
        created_at: asset.created_at,
        schedule_rows_created: schedRows.length,
        gl_posting_status: "deferred — PREPAID_EXPENSES_POST_ENABLED is OFF",
      });
    });
  });
}

export default fp(registerPrepaidExpensesRoutes);

/**
 * UI-1 READ-ONLY — Revenue Recognition (ASC 606)
 * GET /api/v1/accounting/revenue-contracts        list contracts (per-entity)
 * GET /api/v1/accounting/revenue-contracts/:id     detail + obligations + computed recognition schedule + JE preview
 *
 * READ/COMPUTE ONLY. ZERO posting, ZERO write. The recognition schedule (recognized vs
 * remaining-deferred roll-forward) is computed per obligation for display. GL posting is GATED
 * behind REVENUE_RECOGNITION_POST_ENABLED (default OFF) — this module never posts. Money = integer
 * cents. Entity-scoped. RLS enforced.
 */
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import { isEnabled } from "../lib/feature-flags/service.js";

const POST_FLAG = "REVENUE_RECOGNITION_POST_ENABLED";

function accountingRoles(role: string) {
  return ["Owner", "Administrator", "Accountant"].includes(role);
}

const listQuerySchema = companyQuerySchema.extend({
  status: z.enum(["draft", "active", "fully_recognized", "voided"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const detailParamsSchema = z.object({ id: z.string().uuid() });

type ObligationForCompute = {
  allocated_price_cents: number;
  recognition_method: string;
  recognition_start_date: string | null;
  recognition_end_date: string | null;
  periods: number | null;
  satisfied_at: string | null;
};

type RecognitionRow = {
  period_number: number;
  period_date: string;
  recognized_amount_cents: number;
  remaining_deferred_cents: number;
  method_snapshot: string;
};

function addMonthsFirstOfMonth(isoDate: string, monthsToAdd: number): string {
  const [y, m] = isoDate.split("-").map(Number);
  const idx = m - 1 + monthsToAdd;
  const yr = y + Math.floor(idx / 12);
  const mn = ((idx % 12) + 12) % 12;
  return `${yr}-${String(mn + 1).padStart(2, "0")}-01`;
}

/**
 * Compute the ASC 606 step-5 recognition schedule for one obligation (display only, no persistence).
 * - point_in_time: full allocated price recognized on the recognition/satisfied date.
 * - over_time_straight_line: allocated price spread evenly over `periods` months (stub absorbs rounding).
 * - over_time_usage: requires per-period usage that this read-only view does not track -> empty + note.
 */
function computeRecognitionSchedule(o: ObligationForCompute): { rows: RecognitionRow[]; note: string | null } {
  const total = o.allocated_price_cents;
  if (total <= 0) return { rows: [], note: null };

  if (o.recognition_method === "over_time_usage") {
    return { rows: [], note: "Usage-based recognition requires per-period usage data, which is not tracked in this read-only view." };
  }

  if (o.recognition_method === "point_in_time") {
    const date = (o.satisfied_at?.slice(0, 10)) || o.recognition_start_date || o.recognition_end_date;
    if (!date) return { rows: [], note: "No recognition date set for this point-in-time obligation." };
    return {
      rows: [{ period_number: 1, period_date: `${date.slice(0, 7)}-01`, recognized_amount_cents: total, remaining_deferred_cents: 0, method_snapshot: "point_in_time" }],
      note: null,
    };
  }

  // over_time_straight_line
  const periods = o.periods ?? 0;
  const start = o.recognition_start_date;
  if (!start || periods <= 0) {
    return { rows: [], note: "Straight-line recognition needs a start date and period count." };
  }
  const monthly = Math.floor(total / periods);
  const rows: RecognitionRow[] = [];
  let recognized = 0;
  for (let i = 0; i < periods; i++) {
    const amount = i === periods - 1 ? total - recognized : monthly;
    recognized += amount;
    rows.push({
      period_number: i + 1,
      period_date: addMonthsFirstOfMonth(start, i),
      recognized_amount_cents: amount,
      remaining_deferred_cents: total - recognized,
      method_snapshot: "over_time_straight_line",
    });
  }
  return { rows, note: null };
}

function recognizedToDate(rows: RecognitionRow[]): number {
  const today = new Date().toISOString().slice(0, 10);
  let sum = 0;
  for (const r of rows) {
    if (r.period_date <= today) sum += r.recognized_amount_cents;
  }
  return sum;
}

async function registerRevenueRecognitionRoutes(app: FastifyInstance) {
  // LIST contracts
  app.get("/api/v1/accounting/revenue-contracts", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!accountingRoles(user.role)) return reply.code(403).send({ error: "forbidden" });

    const parsed = listQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const { operating_company_id, status, limit, offset } = parsed.data;

    return withCompanyScope(user.uuid, operating_company_id, async (client) => {
      const conds = ["rc.operating_company_id = $1", "rc.is_active = true"];
      const params: unknown[] = [operating_company_id];
      let pi = 2;
      if (status) { conds.push(`rc.status = $${pi++}`); params.push(status); }
      const where = conds.join(" AND ");

      const countRes = await client.query(
        `SELECT COUNT(*)::text AS total FROM accounting.revenue_contracts rc WHERE ${where}`,
        params
      );
      const total = Number((countRes.rows[0] as { total: string }).total ?? 0);

      params.push(limit, offset);
      const listRes = await client.query(
        `SELECT
          rc.id, rc.contract_number, rc.description, rc.source_type,
          rc.customer_uuid::text                AS customer_uuid,
          rc.transaction_price_cents::text      AS transaction_price_cents,
          rc.contract_date::text                AS contract_date,
          rc.start_date::text                   AS start_date,
          rc.end_date::text                     AS end_date,
          rc.status, rc.created_at::text         AS created_at
        FROM accounting.revenue_contracts rc
        WHERE ${where}
        ORDER BY rc.contract_date DESC, rc.created_at DESC
        LIMIT $${pi++} OFFSET $${pi++}`,
        params
      );

      const items = [];
      for (const r of listRes.rows as any[]) {
        const obRes = await client.query(
          `SELECT allocated_price_cents::text AS allocated_price_cents, recognition_method,
                  recognition_start_date::text AS recognition_start_date,
                  recognition_end_date::text AS recognition_end_date,
                  periods, satisfied_at::text AS satisfied_at
           FROM accounting.revenue_obligations
           WHERE contract_id = $1 AND is_active = true`,
          [r.id]
        );
        let recognized = 0;
        for (const o of obRes.rows as any[]) {
          const sched = computeRecognitionSchedule({
            allocated_price_cents: Number(o.allocated_price_cents),
            recognition_method: o.recognition_method,
            recognition_start_date: o.recognition_start_date,
            recognition_end_date: o.recognition_end_date,
            periods: o.periods,
            satisfied_at: o.satisfied_at,
          });
          recognized += recognizedToDate(sched.rows);
        }
        const price = Number(r.transaction_price_cents);
        items.push({
          id: r.id as string,
          contract_number: r.contract_number as string | null,
          description: r.description as string,
          source_type: r.source_type as string,
          customer_uuid: r.customer_uuid as string | null,
          transaction_price_cents: price,
          contract_date: r.contract_date as string,
          start_date: r.start_date as string,
          end_date: r.end_date as string | null,
          status: r.status as string,
          created_at: r.created_at as string,
          recognized_to_date_cents: recognized,
          deferred_balance_cents: Math.max(0, price - recognized),
          obligation_count: obRes.rows.length,
        });
      }

      return { total, limit, offset, items };
    });
  });

  // DETAIL + obligations + computed schedules + gated JE preview
  app.get("/api/v1/accounting/revenue-contracts/:id", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!accountingRoles(user.role)) return reply.code(403).send({ error: "forbidden" });

    const pp = detailParamsSchema.safeParse(req.params);
    if (!pp.success) return validationError(reply, pp.error);
    const qp = companyQuerySchema.safeParse(req.query ?? {});
    if (!qp.success) return validationError(reply, qp.error);

    return withCompanyScope(user.uuid, qp.data.operating_company_id, async (client) => {
      const cRes = await client.query(
        `SELECT rc.*,
          rc.transaction_price_cents::text AS price_s,
          rc.contract_date::text AS contract_date_s,
          rc.start_date::text AS start_date_s,
          rc.end_date::text AS end_date_s,
          rc.customer_uuid::text AS customer_uuid_s,
          rc.created_at::text AS created_at_s
         FROM accounting.revenue_contracts rc
         WHERE rc.id = $1 AND rc.operating_company_id = $2 AND rc.is_active = true`,
        [pp.data.id, qp.data.operating_company_id]
      );
      if (!cRes.rows[0]) return reply.code(404).send({ error: "not_found" });
      const c = cRes.rows[0] as any;

      const obRes = await client.query(
        `SELECT id, obligation_number, description,
                standalone_selling_price_cents::text AS standalone_selling_price_cents,
                allocated_price_cents::text AS allocated_price_cents,
                recognition_method,
                recognition_start_date::text AS recognition_start_date,
                recognition_end_date::text AS recognition_end_date,
                periods, satisfied_at::text AS satisfied_at, satisfied_trigger,
                revenue_account_id, status
         FROM accounting.revenue_obligations
         WHERE contract_id = $1 AND is_active = true
         ORDER BY obligation_number`,
        [pp.data.id]
      );

      const postEnabled = await isEnabled(client, POST_FLAG);
      let recognizedTotal = 0;

      const obligations = (obRes.rows as any[]).map((o) => {
        const sched = computeRecognitionSchedule({
          allocated_price_cents: Number(o.allocated_price_cents),
          recognition_method: o.recognition_method,
          recognition_start_date: o.recognition_start_date,
          recognition_end_date: o.recognition_end_date,
          periods: o.periods,
          satisfied_at: o.satisfied_at,
        });
        const recognized = recognizedToDate(sched.rows);
        recognizedTotal += recognized;
        return {
          id: o.id,
          obligation_number: o.obligation_number,
          description: o.description,
          standalone_selling_price_cents: Number(o.standalone_selling_price_cents),
          allocated_price_cents: Number(o.allocated_price_cents),
          recognition_method: o.recognition_method,
          recognition_start_date: o.recognition_start_date,
          recognition_end_date: o.recognition_end_date,
          periods: o.periods,
          satisfied_at: o.satisfied_at,
          satisfied_trigger: o.satisfied_trigger,
          status: o.status,
          recognized_to_date_cents: recognized,
          remaining_deferred_cents: Math.max(0, Number(o.allocated_price_cents) - recognized),
          schedule: sched.rows,
          schedule_note: sched.note,
          recognition_je_template: postEnabled && o.revenue_account_id && c.deferred_revenue_account_id ? {
            balanced: true,
            lines: [
              { account_id: c.deferred_revenue_account_id, debit_cents: 0, credit_cents: 0, memo: "Deferred revenue" },
              { account_id: o.revenue_account_id, debit_cents: 0, credit_cents: 0, memo: "Recognized revenue" },
            ],
          } : null,
        };
      });

      const price = Number(c.price_s);
      return {
        id: c.id,
        contract_number: c.contract_number,
        description: c.description,
        source_type: c.source_type,
        source_load_id: c.source_load_id,
        source_invoice_id: c.source_invoice_id,
        customer_uuid: c.customer_uuid_s,
        transaction_price_cents: price,
        currency_code: c.currency_code,
        contract_date: c.contract_date_s,
        start_date: c.start_date_s,
        end_date: c.end_date_s,
        status: c.status,
        created_at: c.created_at_s,
        recognized_to_date_cents: recognizedTotal,
        deferred_balance_cents: Math.max(0, price - recognizedTotal),
        je_preview: { posting_enabled: postEnabled },
        obligations,
      };
    });
  });
}

export default fp(registerRevenueRecognitionRoutes);

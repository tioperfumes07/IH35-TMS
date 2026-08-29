/**
 * UI-1 COMPLETE-BUILD — Prepaid Expenses
 * GET  /api/v1/accounting/prepaid-expenses          list prepaid assets
 * GET  /api/v1/accounting/prepaid-expenses/:id      detail + amortization schedule + JE preview
 * POST /api/v1/accounting/prepaid-expenses          create asset + generate schedule
 *
 * NetSuite/QBO parity: Prepaid expenses module — asset header + monthly amortization schedule.
 * Create-time purchase GL posting GATED behind PREPAID_EXPENSES_POST_ENABLED (default OFF): with the
 * flag OFF the asset is created unposted and the balanced-JE preview is returned; with it ON the
 * purchase entry (Dr prepaid asset / Cr cash-or-A/P) posts through the shared FIN-21 JE spine in the
 * SAME transaction as the asset header — never a partial post, never an ad-hoc poster here.
 * Money = integer cents. Entity-scoped. RLS enforced.
 */
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { postVoidReversal, type VoidReversalResult } from "./void.service.js";
import { requireVoidCancelExecutor } from "../lib/authz/void-cancel-authz.js";
import { isEnabled } from "../lib/feature-flags/service.js";
import { AmortizationPostingError } from "./amortization-posting/amortization-posting.math.js";
import { postPrepaidPurchase, type PrepaidPurchasePostingResult } from "./amortization-posting/amortization-posting.service.js";

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

/** Row shape returned by the prepaid-expenses LIST query (money columns cast ::text). */
interface PrepaidListRow {
  id: string;
  asset_number: string | null;
  description: string;
  purchase_date: string;
  start_date: string;
  end_date: string;
  total_amount_cents: string;
  periods: number;
  period_amount_cents: string;
  remainder_cents: string;
  status: string;
  posting_status: string;
  posted_at: string | null;
  created_at: string;
  amortized_cents: string;
  pending_periods: string;
}

/** Row shape returned by the prepaid-asset DETAIL query (pa.* plus ::text aliases). */
interface PrepaidDetailRow {
  id: string;
  asset_number: string | null;
  description: string;
  periods: number;
  status: string;
  posting_status: string;
  asset_account_id: string | null;
  expense_account_id: string | null;
  payment_account_id: string | null;
  purchase_je_id: string | null;
  purchase_je_memo?: string | null;
  purchase_je_date?: string | null;
  asset_account_number?: string | null;
  asset_account_name?: string | null;
  expense_account_number?: string | null;
  expense_account_name?: string | null;
  payment_account_number?: string | null;
  payment_account_name?: string | null;
  purchase_date_s: string;
  start_date_s: string;
  end_date_s: string;
  total_s: string;
  period_s: string;
  remainder_s: string;
  posted_at_s: string | null;
  created_at_s: string;
  amortized_cents: string;
  pending_periods: string;
}

/** Row shape returned by the amortization-schedule query. */
interface PrepaidScheduleRow {
  id: string;
  period_number: number;
  period_date: string;
  amount_cents: string;
  remaining_balance_cents: string;
  posted: boolean;
  posted_at: string | null;
  posted_journal_entry_id: string | null;
  journal_entry_memo?: string | null;
  journal_entry_date?: string | null;
}

/** Row shape returned by the CREATE INSERT ... RETURNING. */
interface PrepaidInsertRow {
  id: string;
  asset_number: string | null;
  description: string;
  purchase_date: string;
  start_date: string;
  end_date: string;
  total_amount_cents: string;
  periods: number;
  period_amount_cents: string;
  remainder_cents: string;
  status: string;
  posting_status: string;
  created_at: string;
}

async function registerPrepaidExpensesRoutes(app: FastifyInstance) {
  // LIST
  app.get("/api/v1/accounting/prepaid-expenses", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!accountingRoles(user.role)) return reply.code(403).send({ error: "forbidden" });

    const parsed = listQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const { operating_company_id, status, date_from, date_to, limit, offset } = parsed.data;

    return withCompanyScope(user.uuid, operating_company_id, async (client) => {
      const conds = ["pa.operating_company_id = $1::uuid", "pa.is_active = true"];
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
        items: listRes.rows.map((r: PrepaidListRow) => ({
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
  app.get("/api/v1/accounting/prepaid-expenses/:id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
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
          COUNT(r.id) FILTER (WHERE r.posted = false AND r.is_active)::text AS pending_periods,
          pje.memo AS purchase_je_memo,
          pje.entry_date::text AS purchase_je_date,
          aa.account_number AS asset_account_number,
          aa.account_name AS asset_account_name,
          ea.account_number AS expense_account_number,
          ea.account_name AS expense_account_name,
          paya.account_number AS payment_account_number,
          paya.account_name AS payment_account_name
        FROM accounting.prepaid_assets pa
        LEFT JOIN accounting.prepaid_amortization_rows r ON r.asset_id = pa.id AND r.is_active = true
        LEFT JOIN accounting.journal_entries pje
          ON pje.id = pa.purchase_je_id
         AND pje.operating_company_id = pa.operating_company_id
        LEFT JOIN catalogs.accounts aa
          ON aa.id = pa.asset_account_id
         AND aa.operating_company_id = pa.operating_company_id
        LEFT JOIN catalogs.accounts ea
          ON ea.id = pa.expense_account_id
         AND ea.operating_company_id = pa.operating_company_id
        LEFT JOIN catalogs.accounts paya
          ON paya.id = pa.payment_account_id
         AND paya.operating_company_id = pa.operating_company_id
        WHERE pa.id = $1 AND pa.operating_company_id = $2::uuid AND pa.is_active = true
        GROUP BY pa.id, pje.memo, pje.entry_date,
          aa.account_number, aa.account_name, ea.account_number, ea.account_name,
          paya.account_number, paya.account_name`,
        [pp.data.id, qp.data.operating_company_id]
      );
      if (!assetRes.rows[0]) return reply.code(404).send({ error: "not_found" });
      const a = assetRes.rows[0] as PrepaidDetailRow;

      const schedRes = await client.query(
        `SELECT r.id, r.period_number, r.period_date::text AS period_date,
                r.amount_cents::text AS amount_cents,
                r.remaining_balance_cents::text AS remaining_balance_cents,
                r.posted, r.posted_at::text AS posted_at,
                r.posted_journal_entry_id::text AS posted_journal_entry_id,
                je.memo AS journal_entry_memo,
                je.entry_date::text AS journal_entry_date
         FROM accounting.prepaid_amortization_rows r
         LEFT JOIN accounting.journal_entries je
           ON je.id = r.posted_journal_entry_id
          AND je.operating_company_id = $2::uuid
         WHERE r.asset_id = $1 AND r.is_active = true
         ORDER BY r.period_number`,
        [pp.data.id, qp.data.operating_company_id]
      );

      // Entity-scoped: PREPAID_EXPENSES_POST_ENABLED is a per-entity override (ACCT-F43 arms TRK and
      // USMCA). Resolving it without the company would report posting_enabled=false on an entity
      // where the create path posts for real — a preview that contradicts what the button does.
      const postEnabled = await isEnabled(client, PREPAID_POST_FLAG, {
        operating_company_id: qp.data.operating_company_id,
        user_uuid: String(user.uuid),
      });
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
        purchase_je_memo: a.purchase_je_memo ?? null,
        purchase_je_date: a.purchase_je_date ?? null,
        asset_account_number: a.asset_account_number ?? null,
        asset_account_name: a.asset_account_name ?? null,
        expense_account_number: a.expense_account_number ?? null,
        expense_account_name: a.expense_account_name ?? null,
        payment_account_number: a.payment_account_number ?? null,
        payment_account_name: a.payment_account_name ?? null,
        created_at: a.created_at_s,
        amortized_cents: Number(a.amortized_cents),
        pending_periods: Number(a.pending_periods),
        schedule: schedRes.rows.map((r: PrepaidScheduleRow) => ({
          id: r.id as string,
          period_number: r.period_number as number,
          period_date: r.period_date as string,
          amount_cents: Number(r.amount_cents),
          remaining_balance_cents: Number(r.remaining_balance_cents),
          posted: r.posted as boolean,
          posted_at: r.posted_at as string | null,
          posted_journal_entry_id: r.posted_journal_entry_id as string | null,
          journal_entry_memo: r.journal_entry_memo ?? null,
          journal_entry_date: r.journal_entry_date ?? null,
        })),
        je_preview,
      };
    });
  });

  // CREATE asset + generate schedule
  // Pre-existing gap surfaced by verify-new-auth-routes-rate-limited when this file changed: the
  // prepaid CREATE route authorized but carried no rateLimit (CodeQL js/missing-rate-limiting).
  // Matched to the mutating-route budget used by the void route below.
  app.post("/api/v1/accounting/prepaid-expenses", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!accountingRoles(user.role)) return reply.code(403).send({ error: "forbidden" });

    const parsed = createBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const input = parsed.data;

    try {
      return await withCompanyScope(user.uuid, input.operating_company_id, async (client) => {
        const postEnabled = await isEnabled(client, PREPAID_POST_FLAG, {
          operating_company_id: input.operating_company_id,
          user_uuid: String(user.uuid),
        });
        // Fail CLOSED *before* any write: with posting ON, an asset whose purchase entry cannot
        // resolve both legs would be capitalized off-ledger. Refuse the whole create instead.
        if (postEnabled && (!input.asset_account_id || !input.payment_account_id)) {
          return reply.code(422).send({
            error: "gl_accounts_required",
            message:
              `${PREPAID_POST_FLAG} is ON: asset_account_id and payment_account_id are both required so the ` +
              "purchase entry (Dr prepaid asset / Cr cash-or-A/P) can post. Nothing was created.",
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
        const asset = assetRes.rows[0] as PrepaidInsertRow;

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

        // Create-time capitalization through the shared FIN-21 spine, on THIS transaction. A throw
        // here (closed period, unbalanced, accounts vanished) rolls back the asset + schedule with it
        // and is mapped to a 4xx below — the asset is never left capitalized without its entry.
        const purchasePosting: PrepaidPurchasePostingResult = await postPrepaidPurchase(
          client,
          {
            operatingCompanyId: input.operating_company_id,
            assetId: asset.id,
            purchaseDate: input.purchase_date,
            description: input.description,
            totalAmountCents: input.total_amount_cents,
            assetAccountId: input.asset_account_id ?? null,
            paymentAccountId: input.payment_account_id ?? null,
          },
          { userId: String(user.uuid) }
        );
        const posted = purchasePosting.result === "posted" || purchasePosting.result === "already_posted";

        await appendCrudAudit(client, user.uuid, "prepaid_asset.created", {
          asset_id: asset.id,
          operating_company_id: input.operating_company_id,
          total_amount_cents: input.total_amount_cents,
          periods: input.periods,
          gl_posting_status: posted ? "posted" : "deferred",
          purchase_je_id: purchasePosting.journal_entry_id,
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
          posting_status: posted ? "posted" : asset.posting_status,
          created_at: asset.created_at,
          schedule_rows_created: schedRows.length,
          purchase_je_id: purchasePosting.journal_entry_id,
          gl_posting_status: posted
            ? `posted — purchase JE ${purchasePosting.journal_entry_id}`
            : `deferred — ${PREPAID_POST_FLAG} is OFF`,
        });
      });
    } catch (error) {
      // The poster's fail-closed refusals surface as 4xx with the whole create rolled back.
      if (error instanceof AmortizationPostingError) {
        const statusByCode: Record<string, number> = {
          ACCOUNT_MISSING: 422,
          PERIOD_LOCKED: 422,
          UNBALANCED_ENTRY: 422,
        };
        return reply.code(statusByCode[error.code] ?? 400).send({
          error: error.code,
          message: error.message,
          details: error.details ?? null,
        });
      }
      throw error;
    }
  });

  /**
   * ACCT-F331 — POST /api/v1/accounting/prepaid-expenses/:id/void
   *
   * accounting.prepaid_assets carried voided_at / voided_by_user_id / void_reason and a 'voided'
   * status value, but NO route ever wrote them: an UNVOIDABLE money document. A USMCA prepaid asset
   * held $300.00 of A/P that the owner's void-all could not reach, because there was no void path to
   * call. Voiding is a reversal, not a status flip — QuickBooks zeroes a voided transaction's ledger
   * impact and NetSuite writes a reversing journal; leaving the credit standing overstates A/P to any
   * lender, auditor or CPA reading the balance sheet.
   *
   * Reuses the canonical postVoidReversal — no new GL math here. It reads the original postings by
   * source_transaction_type='prepaid_purchase' and flips them.
   *
   * FAILS CLOSED: if the asset is posted but the reverser returns a null reversal, this raises 409
   * rather than marking the document void. That exact silent-null is how ACCT-F330 left $1,643.21 of
   * phantom A/P on the books — a void that reverses nothing must never look like success.
   */
  app.post(
    "/api/v1/accounting/prepaid-expenses/:id/void",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      // Voiding a financial record is EXECUTOR-only (Owner|Administrator|Accountant), consistent with
      // the invoice / bill / payment void routes — not merely accountingRoles.
      if (!requireVoidCancelExecutor(reply, String(user.role ?? ""))) return;

      const pp = detailParamsSchema.safeParse(req.params);
      if (!pp.success) return validationError(reply, pp.error);
      const qp = companyQuerySchema.safeParse(req.query ?? {});
      if (!qp.success) return validationError(reply, qp.error);
      const body = z.object({ reason: z.string().trim().min(1).max(500) }).safeParse(req.body ?? {});
      if (!body.success) return validationError(reply, body.error);

      const oci = qp.data.operating_company_id;
      const assetId = pp.data.id;

      return withCompanyScope(user.uuid, oci, async (client) => {
        const cur = await client.query(
          `SELECT status::text AS status, posting_status::text AS posting_status, voided_at,
                  purchase_date::text AS purchase_date, asset_number
             FROM accounting.prepaid_assets
            WHERE id = $1::uuid AND operating_company_id = $2::uuid
            LIMIT 1
              FOR UPDATE`,
          [assetId, oci]
        );
        const asset = cur.rows[0] as
          | { status: string; posting_status: string | null; voided_at: string | null; purchase_date: string; asset_number: string }
          | undefined;
        if (!asset) return reply.code(404).send({ error: "prepaid_asset_not_found" });
        if (asset.voided_at || asset.status === "voided") {
          return reply.code(409).send({ error: "prepaid_asset_already_void" });
        }

        // A posted asset MUST produce a reversal. An unposted one legitimately has nothing to reverse.
        const wasPosted = asset.posting_status === "posted";
        const reversal = await postVoidReversal(
          client,
          {
            operatingCompanyId: oci,
            entityType: "prepaid_purchase",
            entityId: assetId,
            originalDate: String(asset.purchase_date).slice(0, 10),
            memo: `Void reversal of prepaid asset ${asset.asset_number}: ${body.data.reason}`,
          },
          { userId: String(user.uuid) }
        );
        if (wasPosted && !reversal.reversal_journal_entry_id) {
          return reply.code(409).send({
            error: "prepaid_void_reversal_failed",
            message:
              "This prepaid asset is posted but no GL lines could be reversed, so voiding it would leave its balance standing on the control account. Nothing was changed.",
          });
        }

        // ACCT-F5640 — reversing ONLY the original 'prepaid_purchase' capitalization entry left any
        // already-posted amortization periods standing: postPrepaidAmortization posts each period as
        // its OWN source-linked JE tagged 'prepaid_amortization' (a different source type than the
        // purchase), so the reversal above never touched it. Voiding without also reversing
        // amortization-to-date leaves the Prepaid Asset control account at a permanent negative
        // balance equal to whatever was already amortized — void is defined everywhere else in this
        // codebase as "undo the whole financial event", so a voided prepaid asset must net its
        // control account to zero, not to a stranded remainder.
        const hadPostedAmortization = await client.query(
          `SELECT EXISTS(
             SELECT 1 FROM accounting.prepaid_amortization_rows
              WHERE asset_id = $1::uuid AND operating_company_id = $2::uuid AND posted = true
           ) AS exists`,
          [assetId, oci]
        );
        let amortizationReversal: VoidReversalResult = {
          reversal_journal_entry_id: null,
          reversal_date: null,
          closed_period_reversal: false,
          reversed_line_count: 0,
        };
        if ((hadPostedAmortization.rows[0] as { exists: boolean } | undefined)?.exists) {
          amortizationReversal = await postVoidReversal(
            client,
            {
              operatingCompanyId: oci,
              entityType: "prepaid_amortization",
              entityId: assetId,
              originalDate: String(asset.purchase_date).slice(0, 10),
              memo: `Void reversal of amortization-to-date for prepaid asset ${asset.asset_number}: ${body.data.reason}`,
            },
            { userId: String(user.uuid) }
          );
          if (!amortizationReversal.reversal_journal_entry_id) {
            return reply.code(409).send({
              error: "prepaid_void_amortization_reversal_failed",
              message:
                "This prepaid asset has already-posted amortization periods but their GL lines could not be reversed, so voiding it would leave the control account at a stranded negative balance. Nothing was changed.",
            });
          }
        }

        await client.query(
          `UPDATE accounting.prepaid_assets
              SET status = 'voided', voided_at = now(), voided_by_user_id = $3::uuid,
                  void_reason = $4, updated_at = now()
            WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
          [assetId, oci, user.uuid, body.data.reason]
        );
        // Void-not-delete: future unposted schedule rows are deactivated, never removed. POSTED rows
        // are left untouched (they are historical fact — that period WAS posted) — their GL is now
        // reversed via the cumulative 'prepaid_amortization' reversal above, not by rewriting the row.
        await client.query(
          `UPDATE accounting.prepaid_amortization_rows
              SET is_active = false, deleted_at = now(), updated_at = now()
            WHERE asset_id = $1::uuid AND operating_company_id = $2::uuid
              AND posted = false AND is_active`,
          [assetId, oci]
        );

        await appendCrudAudit(
          client,
          String(user.uuid),
          "accounting.prepaid_asset.voided",
          {
            resource_type: "accounting.prepaid_assets",
            resource_id: assetId,
            operating_company_id: oci,
            reason: body.data.reason,
            reversal_journal_entry_id: reversal.reversal_journal_entry_id,
            reversed_line_count: reversal.reversed_line_count,
            amortization_reversal_journal_entry_id: amortizationReversal.reversal_journal_entry_id,
            amortization_reversed_line_count: amortizationReversal.reversed_line_count,
          },
          "warning",
          "ACCT-F331"
        );

        return {
          prepaid_asset_id: assetId,
          status: "voided",
          reversal_journal_entry_id: reversal.reversal_journal_entry_id,
          reversed_line_count: reversal.reversed_line_count,
          amortization_reversal_journal_entry_id: amortizationReversal.reversal_journal_entry_id,
          amortization_reversed_line_count: amortizationReversal.reversed_line_count,
        };
      });
    }
  );
}

export default fp(registerPrepaidExpensesRoutes);

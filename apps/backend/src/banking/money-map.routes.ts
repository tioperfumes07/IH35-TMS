/**
 * 443.246 CC-1 — Banking Money Map endpoint
 * GET /api/v1/banking/money-map?operating_company_id&from&to
 *
 * Per active bank_account: in_cents, out_cents, line_count, pending_review_count.
 * ONE normalizer: CASE WHEN bt.is_credit THEN abs(bt.amount_cents) ELSE 0 END (deposits)
 *   and CASE WHEN NOT bt.is_credit THEN abs(bt.amount_cents) ELSE 0 END (withdrawals).
 * Handles both BofA (signed amount_cents) and Relay (unsigned + is_credit flag) uniformly.
 * Outflow groups from CATEGORIZED lines only. Uncategorized shown as its own group (never guessed).
 * 443.218 rule: all numbers from SQL aggregates.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

export async function registerMoneyMapRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/banking/money-map",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = authed(req, reply);
      if (!user) return;
      const parsed = querySchema.safeParse(req.query ?? {});
      if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
      const q = parsed.data;

      await assertCompanyMembership(user.uuid, q.operating_company_id);

      const data = await withCurrentUser(user.uuid, async (client) => {
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [q.operating_company_id]);

        const dateParams: unknown[] = [q.operating_company_id];
        const dateFilter: string[] = [];
        if (q.from) {
          dateParams.push(q.from);
          dateFilter.push(`bt.transaction_date >= $${dateParams.length}::date`);
        }
        if (q.to) {
          dateParams.push(q.to);
          dateFilter.push(`bt.transaction_date <= $${dateParams.length}::date`);
        }
        const dateWhere = dateFilter.length ? `AND ${dateFilter.join(" AND ")}` : "";

        const res = await client.query(
          `
          WITH co AS (SELECT $1::uuid AS oc_id),
          accounts AS (
            -- LEAD 443.267-A: banking.bank_accounts has no account_nickname / tile_kind / last_feed_at (42703 → 500).
            -- Real columns: display_name (the nickname), last_synced_at (last feed). Every bank_accounts row is a REAL tile.
            SELECT ba.id, ba.account_name, ba.display_name AS account_nickname, ba.institution_name,
                   ba.ledger_account_id, ba.is_active, 'real'::text AS tile_kind,
                   ba.last_synced_at::text AS last_feed_at
            FROM banking.bank_accounts ba, co
            WHERE ba.operating_company_id = co.oc_id
              AND ba.is_active = true
              AND ba.deactivated_at IS NULL
          ),
          tx_stats AS (
            SELECT
              bt.bank_account_id,
              COUNT(*)::int AS line_count,
              /* ONE normalizer: is_credit = money IN; opposite = money OUT */
              SUM(CASE WHEN bt.is_credit     THEN abs(bt.amount_cents)::bigint ELSE 0 END) AS in_cents,
              SUM(CASE WHEN NOT bt.is_credit THEN abs(bt.amount_cents)::bigint ELSE 0 END) AS out_cents,
              COUNT(*) FILTER (
                WHERE (bt.status = 'pending_categorization' OR bt.status = 'uncategorized')
                  AND bt.voided_at IS NULL
              )::int AS pending_review_count
            FROM banking.bank_transactions bt, co
            WHERE bt.operating_company_id = co.oc_id
              AND bt.voided_at IS NULL
              AND bt.is_sample_data IS NOT TRUE
              ${dateWhere}
            GROUP BY bt.bank_account_id
          ),
          outflow_groups AS (
            /* Groups from CATEGORIZED lines only; uncategorized is its own bucket below */
            SELECT
              bt.bank_account_id,
              CASE
                WHEN cat.system_purpose = 'relay_fuel_wallet' THEN 'relay_wallet'
                WHEN bt.categorization_driver_id IS NOT NULL  THEN 'driver_advances'
                WHEN bt.categorization_vendor_id IS NOT NULL  THEN 'vendors'
                WHEN bt.matched_bill_id IS NOT NULL           THEN 'vendors'
                ELSE 'other_categorized'
              END AS outflow_group,
              SUM(abs(bt.amount_cents))::bigint AS group_cents,
              COUNT(*)::int AS group_count
            FROM banking.bank_transactions bt
            LEFT JOIN banking.bank_accounts ba ON ba.id = bt.bank_account_id
            LEFT JOIN catalogs.accounts cat ON cat.id = ba.ledger_account_id, co
            WHERE bt.operating_company_id = co.oc_id
              AND NOT bt.is_credit
              AND bt.voided_at IS NULL
              AND bt.is_sample_data IS NOT TRUE
              AND bt.status NOT IN ('pending_categorization','uncategorized')
              ${dateWhere}
            GROUP BY bt.bank_account_id, outflow_group
          ),
          uncategorized_out AS (
            SELECT
              bt.bank_account_id,
              COUNT(*)::int AS count,
              SUM(abs(bt.amount_cents))::bigint AS cents
            FROM banking.bank_transactions bt, co
            WHERE bt.operating_company_id = co.oc_id
              AND NOT bt.is_credit
              AND bt.voided_at IS NULL
              AND bt.is_sample_data IS NOT TRUE
              AND (bt.status = 'pending_categorization' OR bt.status = 'uncategorized')
              ${dateWhere}
            GROUP BY bt.bank_account_id
          )
          SELECT
            a.id::text AS bank_account_id,
            a.account_name,
            a.account_nickname,
            a.institution_name,
            a.tile_kind,
            a.last_feed_at,
            COALESCE(ts.in_cents, 0)          AS in_cents,
            COALESCE(ts.out_cents, 0)          AS out_cents,
            COALESCE(ts.line_count, 0)         AS line_count,
            COALESCE(ts.pending_review_count, 0) AS pending_review_count,
            (
              SELECT json_agg(json_build_object(
                'group', og.outflow_group, 'cents', og.group_cents, 'count', og.group_count
              ) ORDER BY og.group_cents DESC)
              FROM outflow_groups og WHERE og.bank_account_id = a.id
            ) AS outflow_groups,
            COALESCE(uo.cents, 0) AS uncategorized_out_cents,
            COALESCE(uo.count, 0) AS uncategorized_out_count
          FROM accounts a
          LEFT JOIN tx_stats ts ON ts.bank_account_id = a.id
          LEFT JOIN uncategorized_out uo ON uo.bank_account_id = a.id
          ORDER BY COALESCE(ts.line_count, 0) DESC, a.account_name
          `,
          dateParams
        );

        // Totals
        const totals = res.rows.reduce(
          (acc, r) => {
            acc.in_cents += Number(r.in_cents);
            acc.out_cents += Number(r.out_cents);
            acc.line_count += r.line_count;
            acc.pending_review_count += r.pending_review_count;
            return acc;
          },
          { in_cents: 0, out_cents: 0, line_count: 0, pending_review_count: 0 }
        );

        return { accounts: res.rows, totals };
      });

      return data;
    }
  );
}

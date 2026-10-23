/**
 * 443.246 CC-1 — Factoring Journey endpoint
 * GET /api/v1/factoring/journey?operating_company_id
 *
 * Per purchase (newest first): key money columns + true-cost rate + step statuses.
 * Steps shown per the 443.246 lead spec:
 *   1 = Invoice submitted (purchase_date)
 *   2 = Advance sent (wire_date)
 *   6 = Escrow released (faro_reserve_entries escrow_to_cash, via the purchase's live lines)
 *
 * 443.218 rule: all numbers from SQL aggregates.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

export async function registerFactoringJourneyRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/factoring/journey",
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

        const res = await client.query(
          `
          SELECT
            fp.id::text,
            fp.display_id,
            fp.purchase_date::text,
            fp.wire_date::text,
            fp.status,
            fp.invoice_count,
            fp.gross_cents,
            fp.fee_cents,
            fp.escrow_reserve_cents,
            fp.cash_reserve_cents,
            fp.wire_fee_cents,
            fp.advance_cents,
            fp.net_to_company_cents,
            /* true-cost rate = (fee + wire_fee) / gross (0 when gross = 0) */
            CASE WHEN fp.gross_cents > 0
                 THEN round((fp.fee_cents + fp.wire_fee_cents)::numeric / fp.gross_cents * 10000) / 100
                 ELSE 0
            END AS true_cost_pct,
            /* step 1: invoice submitted — always present when status != draft */
            fp.purchase_date IS NOT NULL AND fp.status != 'draft' AS step1_done,
            fp.purchase_date::text AS step1_at,
            /* step 2: advance sent = wire_date present */
            fp.wire_date IS NOT NULL AS step2_done,
            fp.wire_date::text AS step2_at,
            /* step 6: escrow released — Faro moved this purchase's escrow to cash. The reserve register is
               accounting.faro_reserve_entries (there is no factoring_reserve_entries table — 443.264.1): it
               names the Faro invoice, not the purchase, so it reaches the purchase through the purchase's own live
               lines (the same join factoring-spine-links / purchased-gross use). A release is the escrow
               register's escrow_to_cash leg; reserve entries are never voided (corrections post as new rows). */
            EXISTS (
              SELECT 1 FROM accounting.faro_reserve_entries fre
                JOIN accounting.factoring_purchase_lines fpl
                  ON fpl.operating_company_id = fre.operating_company_id
                 AND fpl.faro_invoice_number = fre.faro_invoice_number AND fpl.voided_at IS NULL
               WHERE fpl.purchase_id = fp.id AND fre.operating_company_id = fp.operating_company_id
                 AND fre.register = 'escrow' AND fre.entry_kind = 'escrow_to_cash'
            ) AS step6_done,
            (
              SELECT max(fre.entry_date)::text
                FROM accounting.faro_reserve_entries fre
                JOIN accounting.factoring_purchase_lines fpl
                  ON fpl.operating_company_id = fre.operating_company_id
                 AND fpl.faro_invoice_number = fre.faro_invoice_number AND fpl.voided_at IS NULL
               WHERE fpl.purchase_id = fp.id AND fre.operating_company_id = fp.operating_company_id
                 AND fre.register = 'escrow' AND fre.entry_kind = 'escrow_to_cash'
            ) AS step6_at
          FROM accounting.factoring_purchases fp
          WHERE fp.operating_company_id = $1::uuid
            AND fp.is_sample_data IS NOT TRUE
            AND fp.voided_at IS NULL
          ORDER BY fp.purchase_date DESC, fp.created_at DESC
          LIMIT $2 OFFSET $3
          `,
          [q.operating_company_id, q.limit, q.offset]
        );

        const total = (
          await client.query<{ n: number }>(
            `SELECT count(*)::int AS n
               FROM accounting.factoring_purchases fp
              WHERE fp.operating_company_id = $1::uuid
                AND fp.is_sample_data IS NOT TRUE
                AND fp.voided_at IS NULL`,
            [q.operating_company_id]
          )
        ).rows[0]?.n ?? 0;

        return { rows: res.rows, total };
      });

      return data;
    }
  );
}

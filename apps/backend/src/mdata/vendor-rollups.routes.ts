import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { resolveOperatingCompanyId } from "../auth/operating-company-scope.js";
import { requireAuth } from "../auth/session-middleware.js";

// CC-3 V.1 / Wave 3 Step 3 — vendor counterparty roll-up endpoint.
//
// Aggregates per-vendor purchase data from accounting.expenses so the Vendors list
// can show real Purchases YTD / Last Purchase / Last Transaction columns instead
// of "—" placeholders. Mirrors the existing mdata route auth/scope pattern
// (currentAuthUser → resolveOperatingCompanyId → withCurrentUser + set_config).
//
// Schema notes (verified against accounting.expenses.routes.ts):
//   - amount column is `total_amount_cents` (NOT `amount_cents`, which lives on
//     accounting.expense_lines)
//   - date column is `transaction_date` (NOT `incurred_date`)
//   - void column is `voided_at` (confirmed at expenses.routes.ts:557/700/903)

const querySchema = z.object({
  operating_company_id: z.string().uuid().optional(),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

export async function registerVendorRollupsRoutes(app: FastifyInstance) {
  // GET /api/v1/mdata/vendor-rollups
  // Returns per-vendor: purchases_ytd_cents, purchases_total_cents, last_purchase_date, expense_count
  app.get(
    "/api/v1/mdata/vendor-rollups",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const authUser = currentAuthUser(req, reply);
      if (!authUser) return reply;

      const parsed = querySchema.safeParse(req.query ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
      }

      const resolvedOperatingCompanyId = await withCurrentUser(authUser.uuid, async (client) =>
        resolveOperatingCompanyId(client, authUser.uuid, parsed.data.operating_company_id)
      );
      if (!resolvedOperatingCompanyId) {
        return reply.code(400).send({ error: "operating_company_id_required" });
      }

      const yearStart = `${new Date().getFullYear()}-01-01`;

      try {
        const result = await withCurrentUser(authUser.uuid, async (client) => {
          await client.query(
            `SELECT set_config('app.operating_company_id', $1::text, true)`,
            [resolvedOperatingCompanyId]
          );

          return client.query(
            `SELECT
               e.vendor_uuid AS vendor_id,
               COALESCE(SUM(e.total_amount_cents) FILTER (WHERE e.transaction_date >= $2::date), 0)::bigint AS purchases_ytd_cents,
               COALESCE(SUM(e.total_amount_cents), 0)::bigint AS purchases_total_cents,
               MAX(e.transaction_date) AS last_purchase_date,
               COUNT(*)::integer AS expense_count
             FROM accounting.expenses e
             WHERE e.operating_company_id = $1::uuid
               AND e.vendor_uuid IS NOT NULL
               AND e.voided_at IS NULL
             GROUP BY e.vendor_uuid`,
            [resolvedOperatingCompanyId, yearStart]
          );
        });

        const rollups = result.rows.map((row: Record<string, unknown>) => ({
          vendor_id: row.vendor_id,
          purchases_ytd_cents: Number(row.purchases_ytd_cents),
          purchases_total_cents: Number(row.purchases_total_cents),
          last_purchase_date: row.last_purchase_date,
          expense_count: row.expense_count,
        }));

        return reply.send(rollups);
      } catch (err) {
        req.log.error({ err }, "vendor-rollups error");
        return reply.code(500).send({ error: "Failed to fetch vendor rollups" });
      }
    }
  );
}

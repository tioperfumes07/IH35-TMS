import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

// LINK-F5171/LINK-F5184: factoring:banking.entry reverse — a load can find its own advance in this
// Banking (Faro) tab's timeline via the invoice it was submitted through.
const timelineQuerySchema = companyQuerySchema.extend({
  load_id: z.string().uuid().optional(),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

async function withCompanyScope<T>(
  userId: string,
  operatingCompanyId: string,
  fn: (client: {
    query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
  }) => Promise<T>
) {
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [operatingCompanyId]);
    return fn(client);
  });
}

export async function registerBankingFactoringVirtualRoutes(app: FastifyInstance) {
  app.get("/api/v1/banking/factoring-virtual", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;

    const summary = await withCompanyScope(user.uuid, companyId, async (client) => {
      const relation = await client.query<{ exists: boolean }>(
        `SELECT to_regclass('views.factoring_balance_invoice_linkage') IS NOT NULL AS exists`
      );
      if (!relation.rows[0]?.exists) return { error: "missing_linkage_view" as const };

      const res = await client.query(
        `
          SELECT
            f.factor_vendor_id::text AS id,
            COALESCE(v.vendor_name, 'Factoring') AS display_name,
            (SUM(f.reserve_receivable_signed_cents)::numeric / 100)::numeric AS reserve_balance,
            (SUM(f.outstanding_liability_signed_cents)::numeric / 100)::numeric AS chargeback_balance,
            -- FACTORING-CHARGEBACK-BALANCE-IS-ACTUALLY-OUTSTANDING-LIABILITY: honest replacement
            -- name for chargeback_balance above (both compute outstanding_liability_signed_cents,
            -- Advance + Reserve still owed to the factor — not a real chargeback/recourse figure;
            -- see views.factoring_chargebacks_fees's own header comment for why that data model
            -- doesn't exist yet). chargeback_balance stays for any reader not yet migrated.
            (SUM(f.outstanding_liability_signed_cents)::numeric / 100)::numeric AS outstanding_liability_balance,
            NULL::timestamptz AS last_advance_at
          FROM views.factoring_balance_invoice_linkage f
          LEFT JOIN mdata.vendors v
            ON v.id = f.factor_vendor_id
           AND v.operating_company_id = f.operating_company_id
          WHERE f.operating_company_id = $1::uuid
          GROUP BY f.factor_vendor_id, v.vendor_name
          ORDER BY COALESCE(v.vendor_name, 'Factoring')
        `,
        [companyId]
      );
      return { rows: res.rows };
    });
    if ("error" in summary) {
      return reply.code(503).send({
        error: "factoring_balance_linkage_unavailable",
        migration: "202607600000_factoring_balance_invoice_linkage.sql",
      });
    }
    return { companies: summary.rows };
  });

  app.get("/api/v1/banking/factoring-virtual/timeline", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = timelineQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;
    const loadId = query.data.load_id;

    const timeline = await withCompanyScope(user.uuid, companyId, async (client) => {
      const values: unknown[] = [companyId];
      let loadFilter = "";
      if (loadId) {
        values.push(loadId);
        loadFilter = `
          AND EXISTS (
            SELECT 1 FROM accounting.invoices i
            WHERE i.factoring_advance_id = fa.id
              AND i.operating_company_id = fa.operating_company_id
              AND i.source_load_id = $${values.length}::uuid
          )`;
      }
      // BANK-FACTORING-TIMELINE-SILENT-QUERY-SWALLOW: this used to .catch(() => ({ rows: [] })) here,
      // turning ANY query failure (schema drift on accounting.factoring_advances, an RLS/permission
      // change, a transient connection error) into a normal 200 with an empty timeline —
      // indistinguishable from "genuinely zero advances". accounting.factoring_advances is a
      // foundational table (migration 0061, not conditionally created — unlike the sibling
      // views.factoring_balance_invoice_linkage check above, which legitimately needs the to_regclass
      // guard), so there is no "table might not exist yet" case here to defend against. The frontend
      // (BankingHome.tsx) already has a real factoringTimelineQuery.isError branch built specifically
      // for this failure — it could just never fire, because the backend never returned an error
      // status. Letting the query reject here (Fastify's default handler turns it into a 500) is what
      // makes that existing error UI reachable.
      const res = await client.query(
        `
            SELECT
              fa.id::text AS id,
              fa.display_id,
              fa.status,
              fa.advance_amount_cents,
              fa.created_at::text AS created_at,
              fa.advanced_at::text AS advanced_at
            FROM accounting.factoring_advances fa
            WHERE fa.operating_company_id = $1::uuid
              AND fa.status IS DISTINCT FROM 'voided'
              ${loadFilter}
            ORDER BY COALESCE(fa.advanced_at, fa.created_at) DESC NULLS LAST
            LIMIT 25
          `,
        values
      );
      return res.rows;
    });
    return { timeline };
  });
}

/**
 * LEAD 10-25 FINAL-4 — the Faro debtor record (READ-ONLY).
 *
 * A Faro debtor is a name on the factor's own daily statements (factor.faro_daily_imports.raw_payload->'lines'),
 * the same source the possible-duplicates panel counts (mdata/canonical/variant-candidates.service.ts). It has no
 * row of its own, so its id is its name. This route lists every statement line carrying that name and totals them
 * with the SAME expression the panel uses (sum of gross_amount_cents, every line, no other filter), so the figure a
 * user clicks and the record it opens agree to the cent. SELECT only — nothing is written.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "../accounting/shared.js";

const debtorQuerySchema = companyQuerySchema.extend({
  name: z.string().trim().min(1).max(300),
});

export type FaroDebtorLine = {
  import_id: string;
  statement_date: string | null;
  statement_reference: string | null;
  invoice_number: string | null;
  load_id: string | null;
  due_on: string | null;
  gross_amount_cents: number;
  advance_amount_cents: number | null;
  net_amount_cents: number | null;
};

export async function registerFaroDebtorRoutes(app: FastifyInstance) {
  app.get("/api/v1/factoring/faro-debtors/record", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const q = debtorQuerySchema.safeParse(req.query ?? {});
    if (!q.success) return validationError(reply, q.error);
    await assertCompanyMembership(String(user.uuid), q.data.operating_company_id);
    const result: FaroDebtorLine[] = await withCompanyScope(String(user.uuid), q.data.operating_company_id, async (client) => {
      const lines = await client.query(
        `SELECT f.id::text AS import_id, f.statement_date::text AS statement_date, f.statement_reference,
                l->>'invoice_number' AS invoice_number, l->>'load_id' AS load_id, l->>'due_on' AS due_on,
                COALESCE((l->>'gross_amount_cents')::bigint, 0) AS gross_amount_cents,
                (l->>'advance_amount_cents')::bigint AS advance_amount_cents,
                (l->>'net_amount_cents')::bigint AS net_amount_cents
           FROM factor.faro_daily_imports f, jsonb_array_elements(COALESCE(f.raw_payload->'lines', '[]'::jsonb)) l
          WHERE f.operating_company_id = $1::uuid AND l->>'customer_name' = $2
          ORDER BY f.statement_date DESC NULLS LAST, l->>'invoice_number'`,
        [q.data.operating_company_id, q.data.name]
      );
      return lines.rows.map((r: Record<string, unknown>): FaroDebtorLine => ({
        import_id: String(r.import_id),
        statement_date: (r.statement_date as string | null) ?? null,
        statement_reference: (r.statement_reference as string | null) ?? null,
        invoice_number: (r.invoice_number as string | null) ?? null,
        load_id: (r.load_id as string | null) ?? null,
        due_on: (r.due_on as string | null) ?? null,
        gross_amount_cents: Number(r.gross_amount_cents ?? 0),
        advance_amount_cents: r.advance_amount_cents == null ? null : Number(r.advance_amount_cents),
        net_amount_cents: r.net_amount_cents == null ? null : Number(r.net_amount_cents),
      }));
    });
    return {
      name: q.data.name,
      lines: result,
      // The same total the possible-duplicates panel shows for this debtor.
      totals: { lines: result.length, gross_amount_cents: result.reduce((s, l) => s + l.gross_amount_cents, 0) },
    };
  });
}

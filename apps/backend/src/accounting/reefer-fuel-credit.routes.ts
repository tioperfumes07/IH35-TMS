// U25 — Reefer fuel credit (IRS Form 4136, nontaxable use of diesel): every reefer fill in a period with its gallons,
// cost, trailer, unit, load and document, the credit estimate, and the fills still missing gallons; plus the action that
// records a fill's gallons (and trailer) from its receipt. Reads and writes go through fuel/reefer-fuel.service.ts.
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { listReeferFuelForCredit, recordReeferGallons, ReeferGallonsError } from "../fuel/reefer-fuel.service.js";

/**
 * Federal excise tax on diesel recoverable for a nontaxable (off-highway) use such as a reefer unit — 24.3 cents per
 * gallon on Form 4136. The rate is set by statute and the form; the CPA confirms it each filing year.
 */
export const FORM_4136_DIESEL_NONTAXABLE_CENTS_PER_GALLON = 24.3;

function canAccessAccounting(role: string) {
  return role === "Owner" || role === "Administrator" || role === "Accountant";
}

const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const reportQuery = companyQuerySchema.extend({ from: z.string().regex(dateRe), to: z.string().regex(dateRe) });
const gallonsBody = z.object({
  operating_company_id: z.string().uuid(),
  gallons: z.number().positive().max(2000),
  trailer_id: z.string().uuid().nullable().optional(),
});

export async function registerReeferFuelCreditRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/reports/reefer-fuel-credit", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessAccounting(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
    const q = reportQuery.safeParse(req.query ?? {});
    if (!q.success) return validationError(reply, q.error);
    await assertCompanyMembership(String(user.uuid), q.data.operating_company_id);
    const rows = await withCompanyScope(String(user.uuid), q.data.operating_company_id, (client) =>
      listReeferFuelForCredit(client as never, q.data.operating_company_id, q.data.from, q.data.to),
    );
    const withGallons = rows.filter((r) => r.gallons != null && r.gallons > 0);
    const gallons = withGallons.reduce((s, r) => s + (r.gallons ?? 0), 0);
    return {
      rows,
      totals: {
        fills: rows.length,
        fills_missing_gallons: rows.length - withGallons.length,
        fills_missing_trailer: rows.filter((r) => !r.trailer_id).length,
        gallons: Math.round(gallons * 1000) / 1000,
        cost_cents: rows.reduce((s, r) => s + r.cost_cents, 0),
        cost_cents_with_gallons: withGallons.reduce((s, r) => s + r.cost_cents, 0),
        credit_rate_cents_per_gallon: FORM_4136_DIESEL_NONTAXABLE_CENTS_PER_GALLON,
        estimated_credit_cents: Math.round(gallons * FORM_4136_DIESEL_NONTAXABLE_CENTS_PER_GALLON),
      },
    };
  });

  app.post(
    "/api/v1/accounting/reports/reefer-fuel-credit/lines/:id/gallons",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      if (!canAccessAccounting(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });
      const params = z.object({ id: z.string().uuid() }).safeParse(req.params ?? {});
      if (!params.success) return validationError(reply, params.error);
      const body = gallonsBody.safeParse(req.body ?? {});
      if (!body.success) return validationError(reply, body.error);
      await assertCompanyMembership(String(user.uuid), body.data.operating_company_id);
      try {
        const result = await withCompanyScope(String(user.uuid), body.data.operating_company_id, (client) =>
          recordReeferGallons(client as never, body.data.operating_company_id, params.data.id, {
            gallons: body.data.gallons,
            trailer_id: body.data.trailer_id ?? null,
          }),
        );
        return reply.code(200).send(result);
      } catch (err) {
        if (err instanceof ReeferGallonsError) {
          const status = err.code === "LINE_NOT_FOUND" || err.code === "TRAILER_NOT_FOUND" ? 404 : err.code === "EXPENSE_VOIDED" ? 409 : 400;
          return reply.code(status).send({ error: err.code, message: err.message });
        }
        throw err;
      }
    },
  );
}

export default fp(
  async (app) => {
    await registerReeferFuelCreditRoutes(app);
  },
  { name: "accounting.registerReeferFuelCreditRoutes" },
);

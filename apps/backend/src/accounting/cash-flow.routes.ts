import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError } from "./shared.js";
import { getCashFlowReport } from "./cash-flow.service.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const cashFlowQuerySchema = companyQuerySchema.extend({
  from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  basis: z.enum(["accrual", "cash"]).optional(),
});

function canAccessCashFlow(role: string) {
  return role === "Owner" || role === "Administrator" || role === "Manager" || role === "Accountant";
}

export async function registerCashFlowRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/cash-flow", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessCashFlow(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const query = cashFlowQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    // GO-0037-CASH-FLOW-STATEMENT-DATE-RANGE-ORDER-UNVALIDATED (same class as GO-0036, this file was
    // not among the report routes fixed there): a reversed from_date/to_date range was not just a
    // false-empty result -- getCashFlowReport() computes cash_at_start (entry_date < from_date) and
    // cash_at_end (entry_date <= to_date) as two INDEPENDENT queries, so a reversed range produces a
    // chronologically-inverted, self-contradictory Cash-at-start/Cash-at-end pair with all activity
    // sections empty ($0) -- surfaced only as an unexplained "Needs review" reconciliation badge, not
    // an actual error about the invalid input.
    if (query.data.from_date && query.data.to_date && query.data.from_date > query.data.to_date) {
      return reply.code(400).send({ error: "validation_error", details: { period: ["from_date must be on or before to_date"] } });
    }
    await assertCompanyMembership(user.uuid, query.data.operating_company_id);

    const report = await getCashFlowReport({
      userId: user.uuid,
      operating_company_id: query.data.operating_company_id,
      from_date: query.data.from_date,
      to_date: query.data.to_date,
    });

    return reply.code(200).send({ ...report, basis: "accrual" });
  });
}

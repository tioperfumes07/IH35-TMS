/**
 * FH-3 Amortization routes — create loans + view schedules. Gated behind FINANCE_HUB_AMORTIZATION_ENABLED.
 * Writes ONLY to finance.* (loans + amortization rows). NO GL posting (that is a later gated step
 * behind FINANCE_HUB_AMORTIZATION_POST_ENABLED, not built here).
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { currentAuthUser, withCompanyScope } from "../../accounting/shared.js";
import { isEnabled } from "../../lib/feature-flags/service.js";
import { createLoanInputSchema, createLoanWithSchedule, getLoanSchedule, listLoans } from "./amortization.service.js";

export const FINANCE_HUB_AMORTIZATION_FLAG_KEY = "FINANCE_HUB_AMORTIZATION_ENABLED";

function accountingRoles(role: string) {
  return ["Owner", "Administrator", "Accountant"].includes(role);
}

export async function registerFinanceAmortizationRoutes(app: FastifyInstance) {
  // Create a loan + generate/store its amortization schedule (no posting).
  app.post("/api/v1/finance/loans", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const parsed = createLoanInputSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    const input = parsed.data;

    return withCompanyScope(user.uuid, input.operating_company_id, async (client) => {
      if (!(await isEnabled(client, FINANCE_HUB_AMORTIZATION_FLAG_KEY, { operating_company_id: input.operating_company_id, user_uuid: String(user.uuid) }))) {
        return reply.code(404).send({ error: "feature_disabled", flag: FINANCE_HUB_AMORTIZATION_FLAG_KEY });
      }
      if (!accountingRoles(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden_owner_or_accountant_only" });
      const result = await createLoanWithSchedule(client, String(user.uuid), input);
      return reply.code(201).send(result);
    });
  });

  // List loans for the company.
  app.get("/api/v1/finance/loans", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const q = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "validation_error" });
    return withCompanyScope(user.uuid, q.data.operating_company_id, async (client) => {
      if (!(await isEnabled(client, FINANCE_HUB_AMORTIZATION_FLAG_KEY, { operating_company_id: q.data.operating_company_id, user_uuid: String(user.uuid) }))) {
        return reply.code(404).send({ error: "feature_disabled", flag: FINANCE_HUB_AMORTIZATION_FLAG_KEY });
      }
      return { loans: await listLoans(client, q.data.operating_company_id) };
    });
  });

  // A loan's amortization schedule.
  app.get("/api/v1/finance/loans/:loanId/schedule", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = z.object({ loanId: z.string().uuid() }).safeParse(req.params ?? {});
    const q = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
    if (!params.success || !q.success) return reply.code(400).send({ error: "validation_error" });
    return withCompanyScope(user.uuid, q.data.operating_company_id, async (client) => {
      if (!(await isEnabled(client, FINANCE_HUB_AMORTIZATION_FLAG_KEY, { operating_company_id: q.data.operating_company_id, user_uuid: String(user.uuid) }))) {
        return reply.code(404).send({ error: "feature_disabled", flag: FINANCE_HUB_AMORTIZATION_FLAG_KEY });
      }
      return { schedule: await getLoanSchedule(client, q.data.operating_company_id, params.data.loanId) };
    });
  });
}

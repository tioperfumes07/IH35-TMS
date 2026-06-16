/**
 * FH-4 Finance Calculator route — pure compute, gated behind FINANCE_HUB_CALCULATOR_ENABLED.
 * Zero writes, never posts: validate → flag-check → return the computed scenarios.
 */
import type { FastifyInstance } from "fastify";
import { currentAuthUser, withCompanyScope } from "../../accounting/shared.js";
import { isEnabled } from "../../lib/feature-flags/service.js";
import { calculatorInputSchema, computeCalculator, CalculatorValidationError } from "./calculator.service.js";

export const FINANCE_HUB_CALCULATOR_FLAG_KEY = "FINANCE_HUB_CALCULATOR_ENABLED";

export async function registerFinanceCalculatorRoutes(app: FastifyInstance) {
  app.post("/api/v1/finance/calculator/compute", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const parsed = calculatorInputSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    const input = parsed.data;

    return withCompanyScope(user.uuid, input.operating_company_id, async (client) => {
      const enabled = await isEnabled(client, FINANCE_HUB_CALCULATOR_FLAG_KEY, {
        operating_company_id: input.operating_company_id,
        user_uuid: String(user.uuid),
      });
      if (!enabled) return reply.code(404).send({ error: "feature_disabled", flag: FINANCE_HUB_CALCULATOR_FLAG_KEY });
      try {
        return computeCalculator(input);
      } catch (e) {
        if (e instanceof CalculatorValidationError) return reply.code(422).send({ error: "invalid_inputs", message: e.message });
        throw e;
      }
    });
  });
}

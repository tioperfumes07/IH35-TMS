/**
 * LV-FINANCE-PLANNING-PLACEHOLDER-ROUTES — Finance Scenario Planning routes. Gated behind
 * FINANCE_HUB_SCENARIOS_ENABLED. Writes ONLY to finance.forecast_* (no GL posting).
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { currentAuthUser, withCompanyScope } from "../../accounting/shared.js";
import { isEnabled } from "../../lib/feature-flags/service.js";
import {
  activateScenario,
  createScenario,
  createScenarioInputSchema,
  getActiveScenarioSummary,
  getScenarioDetail,
  listScenarios,
  recordActualInputSchema,
  recordLineActual,
} from "./scenarios.service.js";

export const FINANCE_HUB_SCENARIOS_FLAG_KEY = "FINANCE_HUB_SCENARIOS_ENABLED";

function accountingRoles(role: string) {
  return ["Owner", "Administrator", "Accountant"].includes(role);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function requireFlag(client: any, operatingCompanyId: string, userId: string) {
  return isEnabled(client, FINANCE_HUB_SCENARIOS_FLAG_KEY, {
    operating_company_id: operatingCompanyId,
    user_uuid: userId,
  });
}

export async function registerFinanceScenariosRoutes(app: FastifyInstance) {
  // Create a scenario + its line items (starts as 'draft').
  app.post("/api/v1/finance/scenarios", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const parsed = createScenarioInputSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    const input = parsed.data;

    return withCompanyScope(user.uuid, input.operating_company_id, async (client) => {
      if (!(await requireFlag(client, input.operating_company_id, String(user.uuid)))) {
        return reply.code(404).send({ error: "feature_disabled", flag: FINANCE_HUB_SCENARIOS_FLAG_KEY });
      }
      if (!accountingRoles(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden_owner_or_accountant_only" });
      const result = await createScenario(client, String(user.uuid), input);
      return reply.code(201).send(result);
    });
  });

  // List scenarios for the company.
  app.get("/api/v1/finance/scenarios", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const q = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "validation_error" });
    return withCompanyScope(user.uuid, q.data.operating_company_id, async (client) => {
      if (!(await requireFlag(client, q.data.operating_company_id, String(user.uuid)))) {
        return reply.code(404).send({ error: "feature_disabled", flag: FINANCE_HUB_SCENARIOS_FLAG_KEY });
      }
      return { scenarios: await listScenarios(client, q.data.operating_company_id) };
    });
  });

  // The company's currently active scenario, rolled up — powers the Overview tab.
  app.get("/api/v1/finance/scenarios/active-summary", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const q = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "validation_error" });
    return withCompanyScope(user.uuid, q.data.operating_company_id, async (client) => {
      if (!(await requireFlag(client, q.data.operating_company_id, String(user.uuid)))) {
        return reply.code(404).send({ error: "feature_disabled", flag: FINANCE_HUB_SCENARIOS_FLAG_KEY });
      }
      return { summary: await getActiveScenarioSummary(client, q.data.operating_company_id) };
    });
  });

  // A scenario's full detail (header + lines) — powers Projections + the Scenarios detail view.
  app.get("/api/v1/finance/scenarios/:scenarioId", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = z.object({ scenarioId: z.string().uuid() }).safeParse(req.params ?? {});
    const q = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
    if (!params.success || !q.success) return reply.code(400).send({ error: "validation_error" });
    return withCompanyScope(user.uuid, q.data.operating_company_id, async (client) => {
      if (!(await requireFlag(client, q.data.operating_company_id, String(user.uuid)))) {
        return reply.code(404).send({ error: "feature_disabled", flag: FINANCE_HUB_SCENARIOS_FLAG_KEY });
      }
      const detail = await getScenarioDetail(client, q.data.operating_company_id, params.data.scenarioId);
      if (!detail) return reply.code(404).send({ error: "scenario_not_found" });
      return detail;
    });
  });

  // Activate a scenario — supersedes the company's current active scenario, if any (void/supersede, not delete).
  app.post("/api/v1/finance/scenarios/:scenarioId/activate", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = z.object({ scenarioId: z.string().uuid() }).safeParse(req.params ?? {});
    const body = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.body ?? {});
    if (!params.success || !body.success) return reply.code(400).send({ error: "validation_error" });
    return withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
      if (!(await requireFlag(client, body.data.operating_company_id, String(user.uuid)))) {
        return reply.code(404).send({ error: "feature_disabled", flag: FINANCE_HUB_SCENARIOS_FLAG_KEY });
      }
      if (!accountingRoles(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden_owner_or_accountant_only" });
      try {
        const scenario = await activateScenario(client, String(user.uuid), body.data.operating_company_id, params.data.scenarioId);
        return { scenario };
      } catch (e) {
        const message = e instanceof Error ? e.message : "activate_failed";
        if (message === "scenario_not_found") return reply.code(404).send({ error: message });
        if (message === "scenario_already_superseded") return reply.code(409).send({ error: message });
        throw e;
      }
    });
  });

  // Record (or correct) a line's actual amount — manual entry, no GL rollup.
  app.patch("/api/v1/finance/scenarios/lines/:lineId/actual", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = z.object({ lineId: z.string().uuid() }).safeParse(req.params ?? {});
    const parsed = recordActualInputSchema.safeParse(req.body ?? {});
    if (!params.success || !parsed.success) return reply.code(400).send({ error: "validation_error" });
    const input = parsed.data;
    return withCompanyScope(user.uuid, input.operating_company_id, async (client) => {
      if (!(await requireFlag(client, input.operating_company_id, String(user.uuid)))) {
        return reply.code(404).send({ error: "feature_disabled", flag: FINANCE_HUB_SCENARIOS_FLAG_KEY });
      }
      if (!accountingRoles(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden_owner_or_accountant_only" });
      try {
        const line = await recordLineActual(client, String(user.uuid), input.operating_company_id, params.data.lineId, input.actual_amount_cents);
        return { line };
      } catch (e) {
        const message = e instanceof Error ? e.message : "record_actual_failed";
        if (message === "forecast_line_not_found") return reply.code(404).send({ error: message });
        throw e;
      }
    });
  });
}

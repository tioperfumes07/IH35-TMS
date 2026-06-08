import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";
import { checkGates, DISPATCH_MUTATION_ACTIONS, type GateContext } from "./gate-registry.service.js";
import "./wf-044-advisory.gate.js";
import "./wf-050-dvir-major.gate.js";
import "./wf-038-active-driver.gate.js";

const checkQuery = z.object({
  action: z.enum(DISPATCH_MUTATION_ACTIONS),
  operating_company_id: z.string().uuid(),
  load_uuid: z.string().uuid().optional(),
  unit_uuid: z.string().uuid().optional(),
  driver_uuid: z.string().uuid().optional(),
  trailer_uuid: z.string().uuid().optional(),
});

const MUTATION_ROUTE_PATTERNS: Array<{ method: "POST"|"PATCH"; pattern: RegExp; action: GateContext["action_slug"] }> = [
  { method: "POST", pattern: /\/api\/v1\/dispatch\/loads\/book/i, action: "book_load" },
  { method: "POST", pattern: /\/api\/v1\/dispatch\/loads\/[^/]+\/quick-assign/i, action: "quick_assign" },
  { method: "PATCH", pattern: /\/api\/v1\/dispatch\/loads\/[^/]+\/assignment/i, action: "assign_driver" },
];

function extractBodyContext(body: Record<string, unknown>, action: string, operatingCompanyId: string): GateContext {
  return {
    operating_company_id: operatingCompanyId,
    action_slug: action,
    load_uuid: (body.load_uuid ?? body.load_id ?? body.id) as string | undefined,
    unit_uuid: (body.unit_uuid ?? body.unit_id ?? body.assigned_unit_id) as string | undefined,
    driver_uuid: (body.driver_uuid ?? body.driver_id ?? body.assigned_primary_driver_id) as string | undefined,
    trailer_uuid: (body.trailer_uuid ?? body.trailer_id ?? body.assigned_secondary_driver_id) as string | undefined,
  };
}

export async function registerDispatchAuthGateRoutes(app: FastifyInstance) {
  app.get("/api/dispatch/auth-gates/check", async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const parsed = checkQuery.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    const d = parsed.data;
    const result = await withCurrentUser(req.user!.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [d.operating_company_id]);
      return checkGates({
        operating_company_id: d.operating_company_id,
        action_slug: d.action,
        load_uuid: d.load_uuid ?? null,
        unit_uuid: d.unit_uuid ?? null,
        driver_uuid: d.driver_uuid ?? null,
        trailer_uuid: d.trailer_uuid ?? null,
      }, client);
    });
    return result;
  });

  app.addHook("preHandler", async (req, reply) => {
    const method = req.method as "POST"|"PATCH";
    const url = req.url.split("?")[0] ?? "";
    const match = MUTATION_ROUTE_PATTERNS.find((m) => m.method === method && m.pattern.test(url));
    if (!match || !req.user) return;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const oci = String(body.operating_company_id ?? req.headers["x-operating-company-id"] ?? "");
    if (!oci) return;
    const gateResult = await withCurrentUser(req.user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [oci]);
      return checkGates(extractBodyContext(body, match.action, oci), client);
    });
    if (!gateResult.pass) {
      return reply.code(422).send({ error: "dispatch_auth_gate_blocked", blockers: gateResult.blockers, warnings: gateResult.warnings });
    }
    (req as FastifyRequest & { dispatchGateWarnings?: unknown }).dispatchGateWarnings = gateResult.warnings;
  });
}

/**
 * GAP-56 / CAP-4 — Auto status switch routes.
 * Base path: /api/integrations/samsara/auto-status-switch
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../../../auth/db.js";
import { requireAuth } from "../../../auth/session-middleware.js";
import {
  applyAutoSwitch,
  detectStatusDrift,
  listRecentAutoStatusSwitches,
  processDriftForLoad,
  type DriftAction,
} from "./detector.service.js";

const companyQuery = z.object({
  operating_company_id: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const loadParams = z.object({
  load_uuid: z.string().uuid(),
});

const applyBody = z.object({
  operating_company_id: z.string().uuid(),
  load_uuid: z.string().uuid(),
  new_status: z.enum(["in_transit", "at_delivery"]),
  reason: z.string().min(1).max(2000),
  case_id: z.enum(["A", "C"]),
  evidence: z.record(z.string(), z.unknown()).optional(),
});

function getAuth(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function canManageDispatch(role: string): boolean {
  return ["Owner", "Administrator", "Manager", "Dispatcher", "Safety"].includes(role);
}

export async function registerAutoStatusSwitchRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/integrations/samsara/auto-status-switch/detect/:load_uuid", async (req, reply) => {
    const user = getAuth(req, reply);
    if (!user) return;
    if (!canManageDispatch(user.role)) return reply.code(403).send({ error: "forbidden" });

    const params = loadParams.safeParse(req.params ?? {});
    const query = companyQuery.safeParse(req.query ?? {});
    if (!params.success || !query.success) {
      return reply.code(400).send({ error: "validation_error" });
    }

    const result = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [query.data.operating_company_id]);
      const detected = await detectStatusDrift(client, query.data.operating_company_id, params.data.load_uuid);
      if (!detected.drift) return { drift: null as DriftAction, context: detected.context };
      const processed = await processDriftForLoad(client, query.data.operating_company_id, params.data.load_uuid);
      return { drift: processed.drift, result: processed.result, context: detected.context };
    });

    return reply.send(result);
  });

  app.post("/api/integrations/samsara/auto-status-switch/apply", async (req, reply) => {
    const user = getAuth(req, reply);
    if (!user) return;
    if (!canManageDispatch(user.role)) return reply.code(403).send({ error: "forbidden" });

    const body = applyBody.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    const applied = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [body.data.operating_company_id]);
      const drift = {
        case_id: body.data.case_id,
        action: "auto_apply" as const,
        proposed_status: body.data.new_status,
        reason: body.data.reason,
        evidence: body.data.evidence ?? {},
      };
      return applyAutoSwitch(
        client,
        body.data.operating_company_id,
        body.data.load_uuid,
        body.data.new_status,
        body.data.reason,
        drift
      );
    });

    return reply.send(applied);
  });

  app.get("/api/integrations/samsara/auto-status-switch/recent", async (req, reply) => {
    const user = getAuth(req, reply);
    if (!user) return;
    if (!canManageDispatch(user.role)) return reply.code(403).send({ error: "forbidden" });

    const query = companyQuery.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error" });

    const events = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [query.data.operating_company_id]);
      return listRecentAutoStatusSwitches(client, query.data.operating_company_id, query.data.limit ?? 50);
    });

    return reply.send({ events });
  });
}

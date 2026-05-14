import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { validationError, withCompanyScope } from "../accounting/shared.js";
import { recordLoadAbandonmentChargeback } from "../driver-finance/abandonment.service.js";

const loadIdParamsSchema = z.object({ loadId: z.string().uuid() });

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const bodySchema = z.object({
  driver_id: z.string().uuid(),
  abandonment_event_at: z.string().trim().min(1),
  abandonment_location: z.string().trim().max(2000).optional().nullable(),
  towing_cost_cents: z.number().int().min(0).optional().nullable(),
  deadhead_miles: z.union([z.number(), z.string()]).optional().nullable(),
  deadhead_cost_cents: z.number().int().min(0).optional().nullable(),
  replacement_driver_premium_cents: z.number().int().min(0).optional().nullable(),
  other_recovery_cost_cents: z.number().int().min(0).optional().nullable(),
  notes: z.string().trim().max(4000).optional().nullable(),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function officeDispatchRoles(role: string) {
  return ["Owner", "Administrator", "Manager", "Dispatcher", "Safety"].includes(role);
}

export async function registerLoadAbandonmentRoutes(app: FastifyInstance) {
  app.post("/api/v1/loads/:loadId/abandonment", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!officeDispatchRoles(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const params = loadIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = bodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    try {
      const payload = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
        return recordLoadAbandonmentChargeback(client, {
          operatingCompanyId: query.data.operating_company_id,
          loadId: params.data.loadId,
          driverId: body.data.driver_id,
          abandonmentEventAt: body.data.abandonment_event_at,
          abandonmentLocation: body.data.abandonment_location ?? null,
          notes: body.data.notes ?? null,
          createdByUserId: user.uuid,
          towing_cost_cents: body.data.towing_cost_cents ?? null,
          deadhead_miles: body.data.deadhead_miles === undefined || body.data.deadhead_miles === null ? null : Number(body.data.deadhead_miles),
          deadhead_cost_cents: body.data.deadhead_cost_cents ?? null,
          replacement_driver_premium_cents: body.data.replacement_driver_premium_cents ?? null,
          other_recovery_cost_cents: body.data.other_recovery_cost_cents ?? null,
        });
      });

      return reply.send({
        abandonment_chargeback: payload.chargeback,
        computed: payload.computed,
      });
    } catch (error) {
      const msg = String((error as Error)?.message ?? "unknown_error");
      if (msg.includes("load_not_found")) return reply.code(404).send({ error: "load_not_found" });
      if (msg.includes("driver_not_assigned_to_load")) return reply.code(400).send({ error: "driver_not_assigned_to_load" });
      throw error;
    }
  });
}

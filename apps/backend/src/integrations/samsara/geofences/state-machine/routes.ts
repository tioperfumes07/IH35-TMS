import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../../../../auth/db.js";
import { requireAuth } from "../../../../auth/session-middleware.js";
import { assertTenantContext } from "../../../../cron/_helpers/tenant-context-guard.js";
import { getGeofenceState, listTransitions, manualTransition } from "./transitions.service.js";
import { GEOFENCE_STATES } from "./states.js";
import { assertCompanyMembership } from "../../../../_helpers/company-membership-guard.js";

const stateParamsSchema = z.object({ uuid: z.string().uuid() });
const stateQuerySchema = z.object({ operating_company_id: z.string().uuid() });
const transitionsQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
const manualBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  vehicle_id: z.string().uuid(),
  to_state: z.enum(GEOFENCE_STATES),
  lat: z.number(),
  lng: z.number(),
  load_id: z.string().uuid().optional(),
  stop_id: z.string().uuid().optional(),
});

type QueryClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

function currentUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function validationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

async function withCompanyScope<T>(
  userId: string,
  operatingCompanyId: string,
  source: string,
  fn: (client: QueryClient) => Promise<T>
) {
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    assertTenantContext(operatingCompanyId, source);
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    return fn(client as QueryClient);
  });
}

export async function registerGeofenceStateMachineRoutes(app: FastifyInstance) {
  app.get("/api/v1/integrations/samsara/geofences/:uuid/state", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const params = stateParamsSchema.safeParse(req.params ?? {});
    const query = stateQuerySchema.safeParse(req.query ?? {});
    if (!params.success) return validationError(reply, params.error);
    if (!query.success) return validationError(reply, query.error);

    const state = await withCompanyScope(user.uuid, query.data.operating_company_id, "geofence-state-get", (client) =>
      getGeofenceState(client, query.data.operating_company_id, params.data.uuid)
    );
    if (!state) return reply.code(404).send({ error: "geofence_not_found" });
    return reply.send({ geofence_id: params.data.uuid, ...state });
  });

  app.get("/api/v1/integrations/samsara/geofences/:uuid/transitions", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const params = stateParamsSchema.safeParse(req.params ?? {});
    const query = transitionsQuerySchema.safeParse(req.query ?? {});
    if (!params.success) return validationError(reply, params.error);
    if (!query.success) return validationError(reply, query.error);

    const rows = await withCompanyScope(user.uuid, query.data.operating_company_id, "geofence-transitions-list", (client) =>
      listTransitions(client, query.data.operating_company_id, params.data.uuid, query.data.limit)
    );
    return reply.send({ geofence_id: params.data.uuid, transitions: rows });
  });

  app.post("/api/v1/integrations/samsara/geofences/:uuid/manual-transition", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    // Roles are capitalized app-wide ("Owner"); the prior lowercase check made this always-403.
    if (user.role !== "Owner") {
      return reply.code(403).send({ error: "owner_only" });
    }
    const params = stateParamsSchema.safeParse(req.params ?? {});
    const body = manualBodySchema.safeParse(req.body ?? {});
    if (!params.success) return validationError(reply, params.error);
    if (!body.success) return validationError(reply, body.error);

    try {
      const result = await withCompanyScope(
        user.uuid,
        body.data.operating_company_id,
        "geofence-manual-transition",
        (client) =>
          manualTransition(client, {
            operatingCompanyId: body.data.operating_company_id,
            geofenceId: params.data.uuid,
            vehicleId: body.data.vehicle_id,
            toState: body.data.to_state,
            actorUserId: user.uuid,
            gpsPosition: { lat: body.data.lat, lng: body.data.lng },
            loadId: body.data.load_id ?? null,
            stopId: body.data.stop_id ?? null,
          })
      );
      return reply.send(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "transition_failed";
      if (message.startsWith("E_ILLEGAL_GEOFENCE_TRANSITION")) {
        return reply.code(409).send({ error: "illegal_geofence_transition", detail: message });
      }
      if (message === "E_GEOFENCE_NOT_FOUND") return reply.code(404).send({ error: message });
      return reply.code(400).send({ error: message });
    }
  });
}

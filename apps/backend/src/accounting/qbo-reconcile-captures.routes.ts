// FIN-23 — QBO reconcile / modify captures (READ-ONLY surfacing).
//
// Surfaces (does NOT resolve) QBO reconcile state for Finance Hub:
//   - sync health summary (views.qbo_sync_health)
//   - modify captures (integrations.qbo_inbound_events — changes made directly in QBO)
//   - sync conflicts (integrations.qbo_sync_conflicts) + recon alerts (qbo.reconciliation_alerts)
//
// HARD CONSTRAINTS:
//   - READ-ONLY: every handler is GET and runs SELECT-only service functions. No writes to
//     the local DB or to QBO. No QBO write-client is imported.
//   - Behind OFF flag QBO_RECONCILE_UI_ENABLED (default OFF). When OFF every endpoint 404s,
//     i.e. the surface is unreachable and the app is unchanged.
//   - Per-entity: scoped via withCompanyScope -> RLS on operating_company_id. QBO is
//     TRANSP-connected today; we never surface another entity's QBO data.
//   - Resolution/apply is OUT OF SCOPE.
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import {
  getQboConnectionSummary,
  getQboSyncHealth,
  getLastRemoteCountAt,
  listQboModifyCaptures,
  listQboReconAlerts,
  listQboSyncConflicts,
} from "../integrations/qbo/qbo-reconcile-read.service.js";

const RECONCILE_UI_ENABLED = process.env.QBO_RECONCILE_UI_ENABLED === "true";

function canAccess(role: string): boolean {
  return role === "Owner" || role === "Administrator" || role === "Manager" || role === "Accountant";
}

/** When the flag is OFF the surface is unreachable: 404, app unchanged. */
function flagGate(reply: import("fastify").FastifyReply): boolean {
  if (!RECONCILE_UI_ENABLED) {
    reply.code(404).send({ error: "not_found" });
    return false;
  }
  return true;
}

const capturesQuerySchema = companyQuerySchema.extend({
  status: z.enum(["received", "fetched", "applied", "conflict", "error", "duplicate"]).optional(),
  entity_type: z.string().trim().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const conflictsQuerySchema = companyQuerySchema.extend({
  open_only: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((v) => v === "true"),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  alert_limit: z.coerce.number().int().min(1).max(100).default(50),
});

export async function registerQboReconcileCapturesRoutes(app: FastifyInstance) {
  // Overview: connection summary + sync-health table + last-poll timestamp.
  app.get("/api/v1/accounting/qbo-reconcile/overview", async (req, reply) => {
    if (!flagGate(reply)) return;
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccess(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const [connection, health, lastPolledAt] = await Promise.all([
        getQboConnectionSummary(client, query.data.operating_company_id),
        getQboSyncHealth(client),
        getLastRemoteCountAt(client),
      ]);
      const queueDepth = health.reduce((sum, h) => sum + (h.pending_count ?? 0), 0);
      const driftCount = health.filter((h) => h.drift === "drift").length;
      return { connection, health, last_polled_at: lastPolledAt, queue_depth: queueDepth, drift_count: driftCount };
    });

    return reply.code(200).send(result);
  });

  // Modify captures: inbound QBO changes and whether TMS has reflected them.
  app.get("/api/v1/accounting/qbo-reconcile/modify-captures", async (req, reply) => {
    if (!flagGate(reply)) return;
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccess(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const query = capturesQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, (client) =>
      listQboModifyCaptures(client, {
        status: query.data.status,
        entityType: query.data.entity_type,
        limit: query.data.limit,
        offset: query.data.offset,
      }),
    );

    return reply.code(200).send(result);
  });

  // Conflicts (local vs QBO side by side) + recon alert history.
  app.get("/api/v1/accounting/qbo-reconcile/conflicts", async (req, reply) => {
    if (!flagGate(reply)) return;
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccess(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const query = conflictsQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const [conflicts, alerts] = await Promise.all([
        listQboSyncConflicts(client, {
          openOnly: query.data.open_only,
          limit: query.data.limit,
          offset: query.data.offset,
        }),
        listQboReconAlerts(client, {
          operatingCompanyId: query.data.operating_company_id,
          limit: query.data.alert_limit,
        }),
      ]);
      return { conflicts: conflicts.items, conflicts_total: conflicts.total, alerts };
    });

    return reply.code(200).send(result);
  });
}

export default fp(async (app) => {
  await registerQboReconcileCapturesRoutes(app);
}, { name: "accounting.registerQboReconcileCapturesRoutes" });

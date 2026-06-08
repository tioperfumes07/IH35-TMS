import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../../auth/session-middleware.js";
import { getReconciliationReport } from "./reconciliation.service.js";
import { withCurrentUser } from "../../../auth/db.js";

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

export async function registerGeofenceReconciliationRoutes(app: FastifyInstance) {
  app.get("/api/v1/integrations/samsara/geofences/reconciliation", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const q = z.object({
      operating_company_id: z.string().uuid(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }).safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "validation_error", details: q.error.flatten() });
    const findings = await getReconciliationReport(user.uuid, q.data.operating_company_id, q.data.date);
    return reply.send({ data: findings });
  });

  app.get("/api/v1/integrations/samsara/geofences/reconciliation/anomaly/:uuid", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const { uuid } = req.params as { uuid: string };
    const q = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "validation_error" });
    const row = await withCurrentUser(user.uuid, async (client) => {
      const res = await client.query(
        `SELECT * FROM safety.integrity_findings WHERE uuid = $1 AND operating_company_id = $2`,
        [uuid, q.data.operating_company_id]
      );
      return res.rows[0] ?? null;
    });
    if (!row) return reply.code(404).send({ error: "not_found" });
    return reply.send({ data: row });
  });

  app.patch("/api/v1/integrations/samsara/geofences/reconciliation/anomaly/:uuid/resolve", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const { uuid } = req.params as { uuid: string };
    const body = z.object({ note: z.string().max(1000).default("") }).safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error" });
    await withCurrentUser(user.uuid, async (client) => {
      await client.query(
        `UPDATE safety.integrity_findings
         SET resolved = true, resolved_by_user_uuid = $2, resolved_at = now(), resolution_note = $3
         WHERE uuid = $1`,
        [uuid, user.uuid, body.data.note]
      );
    });
    return reply.send({ ok: true });
  });
}

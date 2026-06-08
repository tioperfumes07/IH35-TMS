import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { withCurrentUser } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";
import { evaluateRulesForTenant } from "./rule-engine.service.js";
import { seedDefaultAnomalyRules } from "./seed-default-rules.js";

const companyQuery = z.object({ operating_company_id: z.string().uuid() });
const uuidParams = z.object({ uuid: z.string().uuid() });

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user!;
}

export async function registerAnomalyDetectionRoutes(app: FastifyInstance) {
  app.get("/api/safety/anomaly/rules", async (req, reply) => {
    const user = authed(req, reply); if (!user) return;
    const q = companyQuery.safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "validation_error" });
    const rows = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [q.data.operating_company_id]);
      const res = await client.query(`SELECT * FROM safety.anomaly_alert_rules WHERE operating_company_id = $1 ORDER BY rule_name`, [q.data.operating_company_id]);
      return res.rows;
    });
    return { rules: rows };
  });

  app.post("/api/safety/anomaly/rules", async (req, reply) => {
    const user = authed(req, reply); if (!user) return;
    if ((user as { role?: string }).role?.toLowerCase() !== "owner") return reply.code(403).send({ error: "forbidden" });
    const body = z.object({
      operating_company_id: z.string().uuid(),
      rule_slug: z.string(), rule_name: z.string(), category: z.string(),
      detector_function: z.string(), threshold_config: z.record(z.string(), z.unknown()).optional(),
      severity: z.string(), notify_roles: z.array(z.string()).optional(), cadence_minutes: z.number().optional(),
    }).safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error" });
    const row = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [body.data.operating_company_id]);
      const res = await client.query(
        `INSERT INTO safety.anomaly_alert_rules (operating_company_id,rule_slug,rule_name,category,detector_function,threshold_config,severity,notify_roles,cadence_minutes)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8::text[],$9) RETURNING *`,
        [body.data.operating_company_id, body.data.rule_slug, body.data.rule_name, body.data.category,
         body.data.detector_function, JSON.stringify(body.data.threshold_config ?? {}), body.data.severity,
         body.data.notify_roles ?? ["Owner"], body.data.cadence_minutes ?? 360]
      );
      await appendCrudAudit(client, user.uuid, "safety.anomaly_rule.create", { entity_id: String(res.rows[0]?.uuid ?? "") });
      return res.rows[0];
    });
    return reply.code(201).send(row);
  });

  app.patch("/api/safety/anomaly/rules/:uuid", async (req, reply) => {
    const user = authed(req, reply); if (!user) return;
    const p = uuidParams.safeParse(req.params ?? {});
    const body = z.object({ is_active: z.boolean().optional(), threshold_config: z.record(z.string(), z.unknown()).optional(), severity: z.string().optional() }).safeParse(req.body ?? {});
    if (!p.success || !body.success) return reply.code(400).send({ error: "validation_error" });
    const row = await withCurrentUser(user.uuid, async (client) => {
      const res = await client.query(
        `UPDATE safety.anomaly_alert_rules SET
          is_active = COALESCE($2, is_active),
          threshold_config = COALESCE($3::jsonb, threshold_config),
          severity = COALESCE($4, severity), updated_at = now()
         WHERE uuid = $1::uuid RETURNING *`,
        [p.data.uuid, body.data.is_active ?? null, body.data.threshold_config ? JSON.stringify(body.data.threshold_config) : null, body.data.severity ?? null]
      );
      return res.rows[0] ?? null;
    });
    if (!row) return reply.code(404).send({ error: "not_found" });
    return row;
  });

  app.get("/api/safety/anomaly/alerts", async (req, reply) => {
    const user = authed(req, reply); if (!user) return;
    const q = companyQuery.extend({
      status: z.string().optional(), severity: z.string().optional(),
      from: z.string().optional(), to: z.string().optional(),
    }).safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "validation_error" });
    const rows = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [q.data.operating_company_id]);
      const filters = ["operating_company_id = $1"]; const vals: unknown[] = [q.data.operating_company_id]; let i = 2;
      if (q.data.status) { filters.push(`resolution_status = $${i++}`); vals.push(q.data.status); }
      if (q.data.severity) { filters.push(`severity = $${i++}`); vals.push(q.data.severity); }
      if (q.data.from) { filters.push(`detected_at >= $${i++}::timestamptz`); vals.push(q.data.from); }
      if (q.data.to) { filters.push(`detected_at <= $${i++}::timestamptz`); vals.push(q.data.to); }
      const res = await client.query(`SELECT * FROM safety.anomaly_alerts WHERE ${filters.join(" AND ")} ORDER BY detected_at DESC LIMIT 200`, vals);
      return res.rows;
    });
    return { alerts: rows };
  });

  app.patch("/api/safety/anomaly/alerts/:uuid/acknowledge", async (req, reply) => {
    const user = authed(req, reply); if (!user) return;
    const p = uuidParams.safeParse(req.params ?? {});
    if (!p.success) return reply.code(400).send({ error: "validation_error" });
    const row = await withCurrentUser(user.uuid, async (client) => {
      const res = await client.query(
        `UPDATE safety.anomaly_alerts SET acknowledged_at = now(), acknowledged_by_user_uuid = $2::uuid,
          resolution_status = CASE WHEN resolution_status = 'open' THEN 'investigating' ELSE resolution_status END
         WHERE uuid = $1::uuid RETURNING *`,
        [p.data.uuid, user.uuid]
      );
      await appendCrudAudit(client, user.uuid, "safety.anomaly_alert.acknowledge", { entity_id: p.data.uuid });
      return res.rows[0] ?? null;
    });
    if (!row) return reply.code(404).send({ error: "not_found" });
    return row;
  });

  app.patch("/api/safety/anomaly/alerts/:uuid/resolve", async (req, reply) => {
    const user = authed(req, reply); if (!user) return;
    const p = uuidParams.safeParse(req.params ?? {});
    const body = z.object({ status: z.enum(["resolved","false_positive","investigating","open"]), notes: z.string().optional() }).safeParse(req.body ?? {});
    if (!p.success || !body.success) return reply.code(400).send({ error: "validation_error" });
    const row = await withCurrentUser(user.uuid, async (client) => {
      const res = await client.query(
        `UPDATE safety.anomaly_alerts SET resolution_status = $2, resolution_notes = COALESCE($3, resolution_notes)
         WHERE uuid = $1::uuid RETURNING *`,
        [p.data.uuid, body.data.status, body.data.notes ?? null]
      );
      await appendCrudAudit(client, user.uuid, "safety.anomaly_alert.resolve", { entity_id: p.data.uuid, status: body.data.status });
      return res.rows[0] ?? null;
    });
    if (!row) return reply.code(404).send({ error: "not_found" });
    return row;
  });

  app.post("/api/safety/anomaly/seed-defaults", async (req, reply) => {
    const user = authed(req, reply); if (!user) return;
    const q = companyQuery.safeParse(req.body ?? {});
    if (!q.success) return reply.code(400).send({ error: "validation_error" });
    await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [q.data.operating_company_id]);
      await seedDefaultAnomalyRules(client, q.data.operating_company_id);
    });
    return { ok: true };
  });

  app.post("/api/safety/anomaly/evaluate", async (req, reply) => {
    const user = authed(req, reply); if (!user) return;
    const q = companyQuery.safeParse(req.body ?? {});
    if (!q.success) return reply.code(400).send({ error: "validation_error" });
    const result = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [q.data.operating_company_id]);
      return evaluateRulesForTenant(client, q.data.operating_company_id);
    });
    return result;
  });
}

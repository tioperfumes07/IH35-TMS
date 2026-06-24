/**
 * GAP-61 / CAP-11 — Fuel fraud alert routes.
 * Base path: /api/v1/fuel/fraud-alerts
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../../../audit/crud-audit.js";
import { withCurrentUser } from "../../../auth/db.js";
import { requireAuth } from "../../../auth/session-middleware.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

const companyQuery = z.object({
  operating_company_id: z.string().uuid(),
  status: z.enum(["open", "investigating", "dismissed", "confirmed_fraud", "recovered"]).optional(),
  severity: z.enum(["info", "warn", "critical"]).optional(),
});

const uuidParams = z.object({ uuid: z.string().uuid() });

const dismissBody = z.object({
  operating_company_id: z.string().uuid(),
  reason: z.string().min(1).max(2000),
});

const mutateBody = z.object({
  operating_company_id: z.string().uuid(),
  resolution_notes: z.string().max(2000).optional(),
});

function getAuth(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function canInvestigate(role: string): boolean {
  return ["Owner", "Administrator", "Manager", "Safety"].includes(role);
}

async function fetchAlert(client: DbClient, operatingCompanyId: string, alertUuid: string) {
  const res = await client.query(
    `
      SELECT
        fa.uuid::text,
        fa.operating_company_id::text,
        fa.fuel_transaction_uuid::text,
        fa.rule_id,
        fa.severity,
        fa.detected_at::text,
        fa.evidence,
        fa.status,
        fa.investigated_by_user_uuid::text,
        fa.investigated_at::text,
        fa.resolution_notes,
        fa.resolved_at::text,
        ft.transaction_at::text AS transaction_at,
        ft.gallons::float8 AS gallons,
        ft.location_city,
        ft.location_state,
        ft.driver_id::text AS driver_id
      FROM fuel.fraud_alerts fa
      JOIN fuel.fuel_transactions ft ON ft.id = fa.fuel_transaction_uuid
      WHERE fa.operating_company_id = $1::uuid
        AND fa.uuid = $2::uuid
      LIMIT 1
    `,
    [operatingCompanyId, alertUuid]
  );
  return res.rows[0] ?? null;
}

export async function registerFuelFraudAlertRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/fuel/fraud-alerts", async (req, reply) => {
    const user = getAuth(req, reply);
    if (!user) return;
    const parsed = companyQuery.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });

    const alerts = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [parsed.data.operating_company_id]);
      const filters = ["fa.operating_company_id = $1::uuid"];
      const params: unknown[] = [parsed.data.operating_company_id];
      if (parsed.data.status) {
        params.push(parsed.data.status);
        filters.push(`fa.status = $${params.length}`);
      }
      if (parsed.data.severity) {
        params.push(parsed.data.severity);
        filters.push(`fa.severity = $${params.length}`);
      }
      const res = await client.query(
        `
          SELECT
            fa.uuid::text,
            fa.fuel_transaction_uuid::text,
            fa.rule_id,
            fa.severity,
            fa.detected_at::text,
            fa.evidence,
            fa.status,
            fa.investigated_at::text,
            fa.resolution_notes,
            ft.transaction_at::text,
            ft.gallons::float8 AS gallons,
            ft.location_city,
            ft.location_state
          FROM fuel.fraud_alerts fa
          JOIN fuel.fuel_transactions ft ON ft.id = fa.fuel_transaction_uuid
          WHERE ${filters.join(" AND ")}
          ORDER BY
            CASE fa.severity WHEN 'critical' THEN 0 WHEN 'warn' THEN 1 ELSE 2 END,
            fa.detected_at DESC
        `,
        params
      );
      return res.rows;
    });

    return reply.send({ alerts });
  });

  app.get("/api/v1/fuel/fraud-alerts/summary", async (req, reply) => {
    const user = getAuth(req, reply);
    if (!user) return;
    const parsed = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error" });

    const summary = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [parsed.data.operating_company_id]);
      const res = await client.query<{ open_critical: string; open_total: string }>(
        `
          SELECT
            COUNT(*) FILTER (WHERE severity = 'critical' AND resolved_at IS NULL)::text AS open_critical,
            COUNT(*) FILTER (WHERE resolved_at IS NULL)::text AS open_total
          FROM fuel.fraud_alerts
          WHERE operating_company_id = $1::uuid
        `,
        [parsed.data.operating_company_id]
      );
      return {
        open_critical: Number(res.rows[0]?.open_critical ?? 0),
        open_total: Number(res.rows[0]?.open_total ?? 0),
      };
    });
    return reply.send(summary);
  });

  app.patch("/api/v1/fuel/fraud-alerts/:uuid/investigate", async (req, reply) => {
    const user = getAuth(req, reply);
    if (!user) return;
    if (!canInvestigate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = uuidParams.safeParse(req.params ?? {});
    const body = mutateBody.safeParse(req.body ?? {});
    if (!params.success || !body.success) return reply.code(400).send({ error: "validation_error" });

    const alert = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [body.data.operating_company_id]);
      const res = await client.query(
        `
          UPDATE fuel.fraud_alerts
          SET status = 'investigating',
              investigated_by_user_uuid = $3::uuid,
              investigated_at = now(),
              resolution_notes = COALESCE($4, resolution_notes)
          WHERE operating_company_id = $1::uuid
            AND uuid = $2::uuid
            AND resolved_at IS NULL
          RETURNING uuid::text
        `,
        [body.data.operating_company_id, params.data.uuid, user.uuid, body.data.resolution_notes ?? null]
      );
      if (!res.rows[0]) return null;
      await appendCrudAudit(client, user.uuid, "fuel.fraud_alert.investigating", {
        resource_type: "fuel.fraud_alerts",
        resource_id: params.data.uuid,
      });
      return fetchAlert(client, body.data.operating_company_id, params.data.uuid);
    });

    if (!alert) return reply.code(404).send({ error: "not_found" });
    return reply.send({ alert });
  });

  app.patch("/api/v1/fuel/fraud-alerts/:uuid/confirm-fraud", async (req, reply) => {
    const user = getAuth(req, reply);
    if (!user) return;
    if (!canInvestigate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = uuidParams.safeParse(req.params ?? {});
    const body = mutateBody.safeParse(req.body ?? {});
    if (!params.success || !body.success) return reply.code(400).send({ error: "validation_error" });

    const alert = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [body.data.operating_company_id]);
      const res = await client.query(
        `
          UPDATE fuel.fraud_alerts
          SET status = 'confirmed_fraud',
              investigated_by_user_uuid = $3::uuid,
              investigated_at = now(),
              resolved_at = now(),
              resolution_notes = COALESCE($4, resolution_notes)
          WHERE operating_company_id = $1::uuid
            AND uuid = $2::uuid
          RETURNING uuid::text
        `,
        [body.data.operating_company_id, params.data.uuid, user.uuid, body.data.resolution_notes ?? null]
      );
      if (!res.rows[0]) return null;
      await appendCrudAudit(
        client,
        user.uuid,
        "fuel.fraud_alert.confirmed_fraud",
        { resource_type: "fuel.fraud_alerts", resource_id: params.data.uuid },
        "warning"
      );
      return fetchAlert(client, body.data.operating_company_id, params.data.uuid);
    });

    if (!alert) return reply.code(404).send({ error: "not_found" });
    return reply.send({ alert });
  });

  app.patch("/api/v1/fuel/fraud-alerts/:uuid/dismiss", async (req, reply) => {
    const user = getAuth(req, reply);
    if (!user) return;
    if (!canInvestigate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = uuidParams.safeParse(req.params ?? {});
    const body = dismissBody.safeParse(req.body ?? {});
    if (!params.success || !body.success) return reply.code(400).send({ error: "validation_error" });

    const alert = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [body.data.operating_company_id]);
      const res = await client.query(
        `
          UPDATE fuel.fraud_alerts
          SET status = 'dismissed',
              investigated_by_user_uuid = $3::uuid,
              investigated_at = now(),
              resolved_at = now(),
              resolution_notes = $4
          WHERE operating_company_id = $1::uuid
            AND uuid = $2::uuid
          RETURNING uuid::text
        `,
        [body.data.operating_company_id, params.data.uuid, user.uuid, body.data.reason]
      );
      if (!res.rows[0]) return null;
      await appendCrudAudit(client, user.uuid, "fuel.fraud_alert.dismissed", {
        resource_type: "fuel.fraud_alerts",
        resource_id: params.data.uuid,
        reason: body.data.reason,
      });
      return fetchAlert(client, body.data.operating_company_id, params.data.uuid);
    });

    if (!alert) return reply.code(404).send({ error: "not_found" });
    return reply.send({ alert });
  });
}

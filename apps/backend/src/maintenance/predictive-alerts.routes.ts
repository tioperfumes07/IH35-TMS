/**
 * GO-20 slice B — Predictive Maintenance Alerts (docs/lockdown/GO-20-EIGHT-FEATURES.txt).
 * maintenance.predictive_alerts is the alert layer over maintenance.brake_projections /
 * maintenance.tire_projections, populated nightly by apps/backend/src/jobs/predictive-alerts-worker.ts.
 *
 * relationExists-guarded throughout — safe to deploy ahead of the migration landing on any given
 * environment (matches this file's siblings, e.g. pm-alerts.routes.ts).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const listQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  state: z.enum(["open", "resolved"]).optional().default("open"),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

const alertParamsSchema = z.object({ id: z.string().uuid() });

const createWorkOrderBodySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const resolveBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  resolution_note: z.string().trim().min(1).max(4000),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function validationError(reply: FastifyReply, err: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: err.flatten() });
}

async function withCompany<T>(userId: string, companyId: string, fn: (client: any) => Promise<T>) {
  await assertCompanyMembership(userId, companyId);
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [companyId]);
    return fn(client);
  });
}

async function relationExists(client: any, relation: string): Promise<boolean> {
  const res = await client.query(`SELECT to_regclass($1) IS NOT NULL AS ok`, [relation]);
  return Boolean(res.rows[0]?.ok);
}

export async function registerMaintenancePredictiveAlertsRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/maintenance/predictive-alerts",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = authed(req, reply);
      if (!user) return;
      const query = listQuerySchema.safeParse(req.query ?? {});
      if (!query.success) return validationError(reply, query.error);

      const result = await withCompany(user.uuid, query.data.operating_company_id, async (client) => {
        if (!(await relationExists(client, "maintenance.predictive_alerts"))) return { alerts: [], total_count: 0 };

        const values: unknown[] = [query.data.operating_company_id];
        const filters = [`a.operating_company_id = $1::uuid`, `a.voided_at IS NULL`];
        if (query.data.state === "open") {
          filters.push(`a.resolved_at IS NULL`);
        } else {
          filters.push(`a.resolved_at IS NOT NULL`);
        }

        const count = await client.query(
          `SELECT COUNT(*)::int AS total_count FROM maintenance.predictive_alerts a WHERE ${filters.join(" AND ")}`,
          values
        );
        const rangeValues = [...values, query.data.limit, query.data.offset];
        const limitParameter = rangeValues.length - 1;
        const offsetParameter = rangeValues.length;
        const res = await client.query(
          `
            SELECT
              a.id::text,
              a.unit_id::text,
              NULLIF(TRIM(u.unit_number), '') AS unit_number,
              a.alert_type,
              a.position_code,
              a.current_measure,
              a.threshold_measure,
              a.measure_unit,
              a.projected_failure_date::text,
              a.days_remaining,
              a.severity,
              a.work_order_id::text,
              wo.display_id AS work_order_display_id,
              a.resolved_at::text,
              a.resolution_note,
              a.created_at::text,
              a.updated_at::text
            FROM maintenance.predictive_alerts a
            LEFT JOIN mdata.units u ON u.id = a.unit_id AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = a.operating_company_id
            LEFT JOIN maintenance.work_orders wo ON wo.id = a.work_order_id AND wo.operating_company_id = a.operating_company_id
            WHERE ${filters.join(" AND ")}
            ORDER BY a.severity = 'critical' DESC, a.projected_failure_date ASC
            LIMIT $${limitParameter}
            OFFSET $${offsetParameter}
          `,
          rangeValues
        );
        return { alerts: res.rows, total_count: Number(count.rows[0]?.total_count ?? 0) };
      });

      return result;
    }
  );

  app.post(
    "/api/v1/maintenance/predictive-alerts/:id/create-work-order",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = authed(req, reply);
      if (!user) return;
      const params = alertParamsSchema.safeParse(req.params ?? {});
      if (!params.success) return validationError(reply, params.error);
      const body = createWorkOrderBodySchema.safeParse(req.body ?? {});
      if (!body.success) return validationError(reply, body.error);

      const result = await withCompany(user.uuid, body.data.operating_company_id, async (client) => {
        if (!(await relationExists(client, "maintenance.predictive_alerts"))) return { notFound: true as const };

        const lockedRes = await client.query(
          `
            SELECT id::text, unit_id::text, alert_type, position_code, work_order_id::text, severity, days_remaining
            FROM maintenance.predictive_alerts
            WHERE id = $1::uuid AND operating_company_id = $2::uuid AND resolved_at IS NULL AND voided_at IS NULL
            FOR UPDATE
          `,
          [params.data.id, body.data.operating_company_id]
        );
        const alert = lockedRes.rows[0];
        if (!alert) return { notFound: true as const };
        if (alert.work_order_id) return { alreadyConverted: true as const, work_order_id: alert.work_order_id };

        // Predictive brake/tire work is proactive shop work — mirrors defects.routes.ts's DVIR
        // triage convert-to-wo, which also uses 'IS' (In-house Shop) for this shape of repair.
        // origin='fault_auto' (0310_predictive_auto_wo.sql) is the closest existing meaning:
        // "system automatically flagged this from a detected condition" — no new CHECK value needed.
        const woSourceType = "IS";
        const displayIdRes = await client.query(
          `SELECT display_id, sequence FROM maintenance.next_wo_display_id($1, $2, CURRENT_DATE, $3)`,
          [alert.unit_id, woSourceType, body.data.operating_company_id]
        );
        const display = displayIdRes.rows[0];
        const label = alert.alert_type === "brake_wear" ? "Brake wear" : "Tire tread";
        const description = `Predictive maintenance alert — ${label} (${alert.position_code}), ${alert.severity} — ${alert.days_remaining} day(s) to projected replacement.`;

        const woRes = await client.query(
          `
            INSERT INTO maintenance.work_orders (
              operating_company_id, wo_type, source_type, status, unit_id,
              opened_at, repair_location, description, display_id, unit_sequence, origin, wo_title
            )
            VALUES ($1, 'repair', $2, 'open', $3, now(), 'in_house', $4, $5, $6, 'fault_auto', $7)
            RETURNING id, display_id
          `,
          [
            body.data.operating_company_id,
            woSourceType,
            alert.unit_id,
            description,
            display?.display_id ?? null,
            Number(display?.sequence ?? 0) || null,
            `Predictive — ${label} ${alert.position_code}`,
          ]
        );
        const workOrderId = woRes.rows[0]?.id;
        if (!workOrderId) return { failed: true as const };

        const linked = await client.query(
          `
            UPDATE maintenance.predictive_alerts
            SET work_order_id = $2, updated_at = now()
            WHERE id = $1::uuid AND operating_company_id = $3::uuid AND work_order_id IS NULL
            RETURNING id::text
          `,
          [alert.id, workOrderId, body.data.operating_company_id]
        );
        if (!linked.rows[0]) throw new Error("predictive_alert_work_order_link_lost");

        await appendCrudAudit(client, user.uuid, "maintenance.predictive_alert.converted_to_wo", {
          resource_type: "maintenance.predictive_alerts",
          resource_id: alert.id,
          operating_company_id: body.data.operating_company_id,
          work_order_id: workOrderId,
        });

        return { ok: true as const, work_order_id: workOrderId, display_id: woRes.rows[0]?.display_id ?? null };
      });

      if ("notFound" in result && result.notFound) return reply.code(404).send({ error: "predictive_alert_not_found" });
      if ("failed" in result && result.failed) return reply.code(500).send({ error: "work_order_create_failed" });
      return result;
    }
  );

  app.post(
    "/api/v1/maintenance/predictive-alerts/:id/resolve",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = authed(req, reply);
      if (!user) return;
      const params = alertParamsSchema.safeParse(req.params ?? {});
      if (!params.success) return validationError(reply, params.error);
      const body = resolveBodySchema.safeParse(req.body ?? {});
      if (!body.success) return validationError(reply, body.error);

      const updated = await withCompany(user.uuid, body.data.operating_company_id, async (client) => {
        if (!(await relationExists(client, "maintenance.predictive_alerts"))) return null;
        const res = await client.query(
          `
            UPDATE maintenance.predictive_alerts
            SET resolved_at = now(), resolved_by_user_id = $3::uuid, resolution_note = $4, updated_at = now()
            WHERE id = $1::uuid AND operating_company_id = $2::uuid AND resolved_at IS NULL AND voided_at IS NULL
            RETURNING id::text
          `,
          [params.data.id, body.data.operating_company_id, user.uuid, body.data.resolution_note]
        );
        if (res.rows.length === 0) return null;

        await appendCrudAudit(
          client,
          user.uuid,
          "maintenance.predictive_alert.resolved",
          {
            resource_type: "maintenance.predictive_alerts",
            resource_id: params.data.id,
            operating_company_id: body.data.operating_company_id,
            resolution_note: body.data.resolution_note,
          },
          "info"
        );
        return { ok: true };
      });

      if (!updated) return reply.code(404).send({ error: "predictive_alert_not_found" });
      return updated;
    }
  );
}

// PM auto-engine HTTP routes, split out of pm-auto-engine.service.ts (CC-2 2026-10-04) so the service — and the cron that
// imports it — stays free of the auth middleware and session provider.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser, withLuciaBypass } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { isEnabled } from "../lib/feature-flags/service.js";
import { DEFAULT_PM_LOOKAHEAD_MILES, resolvePmLookaheadMiles } from "../telematics/maintenance-predictor.service.js";
import { relationExists, runPmAutoEngineForTenant, type DbClient } from "./pm-auto-engine.service.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

const settingsBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  is_paused: z.boolean(),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function validationError(reply: FastifyReply, err: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: err.flatten() });
}

async function withCompany<T>(userId: string, companyId: string, fn: (client: DbClient) => Promise<T>) {
  return withCurrentUser(userId, async (client) => {
    await assertCompanyMembership(client, userId, companyId);
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [companyId]);
    return fn(client as DbClient);
  });
}

export async function registerMaintenancePmAutoEngineRoutes(app: FastifyInstance) {
  app.get("/api/v1/maintenance/pm-auto-engine/runs", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const payload = await withCompany(user.uuid, parsed.data.operating_company_id, async (client) => {
      if (!(await relationExists(client, "maintenance.pm_schedule_runs"))) {
        return { runs: [], settings: { is_paused: false }, lookahead_miles: DEFAULT_PM_LOOKAHEAD_MILES };
      }

      const runsRes = await client.query(
        `
          SELECT
            id::text,
            started_at::text,
            finished_at::text,
            status,
            schedules_evaluated,
            work_orders_created,
            alerts_created,
            trigger_source,
            error_message
          FROM maintenance.pm_schedule_runs
          WHERE operating_company_id = $1::uuid
          ORDER BY started_at DESC
          LIMIT $2
        `,
        [parsed.data.operating_company_id, parsed.data.limit]
      );

      const logsRes = await client.query(
        `
          SELECT
            l.id::text,
            l.run_id::text,
            l.pm_schedule_id::text,
            l.unit_id::text,
            l.action,
            l.work_order_id::text,
            wo.display_id AS work_order_display_id,
            l.created_at::text,
            s.label AS schedule_label,
            u.unit_number
          FROM maintenance.pm_auto_wo_log l
          LEFT JOIN maintenance.pm_schedules s ON s.id = l.pm_schedule_id
          LEFT JOIN mdata.units u ON u.id = l.unit_id
                                  AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = $1::uuid
          LEFT JOIN maintenance.work_orders wo ON wo.id = l.work_order_id
                                               AND wo.operating_company_id = l.operating_company_id
          WHERE l.operating_company_id = $1::uuid
          ORDER BY l.created_at DESC
          LIMIT $2
        `,
        [parsed.data.operating_company_id, parsed.data.limit]
      );

      const settingsRes = await client.query(
        `
          SELECT is_paused, paused_at::text, updated_at::text
          FROM maintenance.pm_auto_engine_settings
          WHERE operating_company_id = $1::uuid
          LIMIT 1
        `,
        [parsed.data.operating_company_id]
      );

      return {
        runs: runsRes.rows,
        recent_log: logsRes.rows,
        settings: settingsRes.rows[0] ?? { is_paused: false },
        lookahead_miles: resolvePmLookaheadMiles(),
      };
    });

    return payload;
  });

  app.post("/api/v1/maintenance/pm-auto-engine/settings", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = settingsBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const result = await withCompany(user.uuid, parsed.data.operating_company_id, async (client) => {
      await client.query(
        `
          INSERT INTO maintenance.pm_auto_engine_settings (
            operating_company_id, is_paused, paused_at, paused_by_user_uuid, updated_at
          )
          VALUES ($1::uuid, $2, CASE WHEN $2 THEN now() ELSE NULL END, CASE WHEN $2 THEN $3::uuid ELSE NULL END, now())
          ON CONFLICT (operating_company_id) DO UPDATE
          SET
            is_paused = EXCLUDED.is_paused,
            paused_at = EXCLUDED.paused_at,
            paused_by_user_uuid = EXCLUDED.paused_by_user_uuid,
            updated_at = now()
        `,
        [parsed.data.operating_company_id, parsed.data.is_paused, user.uuid]
      );
      await appendCrudAudit(client, user.uuid, "maintenance.pm_auto_engine.settings_updated", {
        operating_company_id: parsed.data.operating_company_id,
        is_paused: parsed.data.is_paused,
      });
      return { is_paused: parsed.data.is_paused };
    });

    return result;
  });

  app.post("/api/v1/maintenance/pm-auto-engine/run-now", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const result = await withCompany(user.uuid, parsed.data.operating_company_id, async (client) => {
      const run = await runPmAutoEngineForTenant(client, parsed.data.operating_company_id, {
        trigger_source: "manual",
      });
      await appendCrudAudit(client, user.uuid, "maintenance.pm_auto_engine.manual_run", {
        operating_company_id: parsed.data.operating_company_id,
        ...run,
      });
      return run;
    });

    return result;
  });
}

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const patchBodySchema = z.object({
  pm_interval_days_default: z.number().int().min(1).max(365).optional(),
  notification_email_enabled: z.boolean().optional(),
  default_shop_location: z.string().trim().min(1).max(200).optional(),
  bay_assignment_policy: z.string().trim().min(1).max(200).optional(),
});

type SettingsRow = {
  id: string;
  operating_company_id: string;
  pm_interval_days_default: number;
  notification_email_enabled: boolean;
  default_shop_location: string;
  bay_assignment_policy: string;
};

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return reply;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

async function withCompanyScope<T>(
  userId: string,
  operatingCompanyId: string,
  fn: (client: {
    query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
  }) => Promise<T>
) {
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [operatingCompanyId]);
    return fn(client);
  });
}

async function relationExists(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<{ ok?: boolean }> }> },
  rel: string
) {
  const res = await client.query(`SELECT to_regclass($1) IS NOT NULL AS ok`, [rel]);
  return Boolean(res.rows[0]?.ok);
}

async function loadCounts(client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }, companyId: string) {
  const pmRes = await client.query(
    `
      SELECT COUNT(*)::int AS pm_schedules
      FROM maintenance.pm_schedules
      WHERE operating_company_id = $1::uuid
    `,
    [companyId]
  );
  const vendorRes = await client.query(
    `
      SELECT COUNT(*)::int AS maintenance_vendors
      FROM mdata.vendors
      WHERE operating_company_id = $1::uuid
        AND vendor_type = 'Repair'
    `,
    [companyId]
  );
  return {
    pm_schedules: Number(pmRes.rows[0]?.pm_schedules ?? 0),
    maintenance_vendors: Number(vendorRes.rows[0]?.maintenance_vendors ?? 0),
  };
}

function canMutate(role: string) {
  return ["Owner", "Administrator"].includes(role);
}

function defaultSettingsPayload(companyId: string, counts: { pm_schedules: number; maintenance_vendors: number }) {
  return {
    operating_company_id: companyId,
    pm_interval_days_default: 30,
    notification_email_enabled: true,
    default_shop_location: "Main yard",
    bay_assignment_policy: "Auto-assign by first available bay",
    pm_schedules: counts.pm_schedules,
    maintenance_vendors: counts.maintenance_vendors,
  };
}

export async function registerMaintenanceSettingsRoutes(app: FastifyInstance) {
  app.get("/api/v1/maintenance/settings", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const companyId = query.data.operating_company_id;

    const payload = await withCompanyScope(user.uuid, companyId, async (client) => {
      const counts = await loadCounts(client, companyId);
      if (!(await relationExists(client, "maintenance.maintenance_settings"))) {
        return defaultSettingsPayload(companyId, counts);
      }

      const res = await client.query<SettingsRow>(
        `
          SELECT
            operating_company_id,
            pm_interval_days_default,
            notification_email_enabled,
            default_shop_location,
            bay_assignment_policy
          FROM maintenance.maintenance_settings
          WHERE operating_company_id = $1::uuid
          LIMIT 1
        `,
        [companyId]
      );
      const row = res.rows[0];
      if (!row) return defaultSettingsPayload(companyId, counts);
      return {
        operating_company_id: row.operating_company_id,
        pm_interval_days_default: row.pm_interval_days_default,
        notification_email_enabled: row.notification_email_enabled,
        default_shop_location: row.default_shop_location,
        bay_assignment_policy: row.bay_assignment_policy,
        pm_schedules: counts.pm_schedules,
        maintenance_vendors: counts.maintenance_vendors,
      };
    });

    return payload;
  });

  app.patch("/api/v1/maintenance/settings", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const body = patchBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const entries = Object.entries(body.data).filter(([, value]) => value !== undefined);
    if (entries.length === 0) return reply.code(400).send({ error: "no_changes" });

    const companyId = query.data.operating_company_id;

    const updated = await withCompanyScope(user.uuid, companyId, async (client) => {
      if (!(await relationExists(client, "maintenance.maintenance_settings"))) {
        return null;
      }

      const values: unknown[] = [];
      const sets: string[] = [];
      for (const [key, value] of entries) {
        values.push(value);
        sets.push(`${key} = $${values.length}`);
      }
      values.push(user.uuid, companyId);
      sets.push(`updated_by_user_id = $${values.length - 1}`);

      const res = await client.query<SettingsRow & { id: string }>(
        `
          UPDATE maintenance.maintenance_settings
          SET ${sets.join(", ")}
          WHERE operating_company_id = $${values.length}::uuid
          RETURNING *
        `,
        values
      );
      const row = res.rows[0] ?? null;
      if (row) {
        await appendCrudAudit(
          client,
          user.uuid,
          "maintenance.maintenance_settings.updated",
          {
            resource_type: "maintenance.maintenance_settings",
            resource_id: row.id,
            operating_company_id: companyId,
            changes: body.data,
          },
          "info",
          "0441-mod2-settings-view-only"
        );
      }
      return row;
    });

    if (!updated) return reply.code(503).send({ error: "maintenance_settings_unavailable" });

    const counts = await withCompanyScope(user.uuid, companyId, async (client) => loadCounts(client, companyId));

    return {
      operating_company_id: updated.operating_company_id,
      pm_interval_days_default: updated.pm_interval_days_default,
      notification_email_enabled: updated.notification_email_enabled,
      default_shop_location: updated.default_shop_location,
      bay_assignment_policy: updated.bay_assignment_policy,
      pm_schedules: counts.pm_schedules,
      maintenance_vendors: counts.maintenance_vendors,
    };
  });
}

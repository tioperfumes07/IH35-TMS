// GO-20 slice A (docs/lockdown/GO-20-EIGHT-FEATURES.txt) — INTERFACE:
//   GET  /api/v1/banking/drift-alerts          list, filterable by resolved
//   POST /api/v1/banking/drift-alerts/:id/resolve   requires a note
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { DriftAlertError, resolveDriftAlert, runDriftDetectors, type DbClient } from "./drift-alerts.service.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const idParamsSchema = z.object({
  id: z.string().uuid(),
});

const listQuerySchema = companyQuerySchema.extend({
  resolved: z.coerce.boolean().default(false),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const resolveBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  note: z.string().trim().min(1, "A written reason is required to resolve a drift alert."),
  resolving_journal_entry_id: z.string().uuid().nullable().optional(),
});

const detectBodySchema = z.object({
  operating_company_id: z.string().uuid(),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

async function withCompanyScope<T>(userId: string, operatingCompanyId: string, fn: (client: DbClient) => Promise<T>) {
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [operatingCompanyId]);
    return fn(client);
  });
}

function mapDriftAlertHttpError(error: unknown) {
  if (error instanceof DriftAlertError) {
    if (error.code === "drift_alert_not_found") return { statusCode: 404 as const, body: { error: error.code } };
    return { statusCode: 409 as const, body: { error: error.code, message: error.message } };
  }
  return null;
}

export async function registerBankingDriftAlertsRoutes(app: FastifyInstance) {
  app.get("/api/v1/banking/drift-alerts", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = listQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const payload = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const filters = ["da.operating_company_id = $1::uuid", "da.voided_at IS NULL"];
      const values: unknown[] = [query.data.operating_company_id];
      filters.push(query.data.resolved ? "da.resolved_at IS NOT NULL" : "da.resolved_at IS NULL");
      const countRes = await client.query<{ total_count: string }>(
        `SELECT COUNT(*)::text AS total_count FROM banking.reconciliation_drift_alerts da WHERE ${filters.join(" AND ")}`,
        values
      );
      const rangeValues = [...values, query.data.limit, query.data.offset];
      const limitParam = rangeValues.length - 1;
      const offsetParam = rangeValues.length;
      const rowsRes = await client.query(
        `
          SELECT da.*, ba.account_name, ba.account_mask, ba.institution_name
            FROM banking.reconciliation_drift_alerts da
            LEFT JOIN banking.bank_accounts ba ON ba.id = da.bank_account_id
           WHERE ${filters.join(" AND ")}
           ORDER BY da.detected_at DESC
           LIMIT $${limitParam} OFFSET $${offsetParam}
        `,
        rangeValues
      );
      return { rows: rowsRes.rows, total_count: Number(countRes.rows[0]?.total_count ?? 0) };
    });
    return payload;
  });

  app.post(
    "/api/v1/banking/drift-alerts/:id/resolve",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      const params = idParamsSchema.safeParse(req.params ?? {});
      if (!params.success) return sendValidationError(reply, params.error);
      const body = resolveBodySchema.safeParse(req.body ?? {});
      if (!body.success) return sendValidationError(reply, body.error);

      try {
        const result = await withCompanyScope(user.uuid, body.data.operating_company_id, (client) =>
          resolveDriftAlert(client, {
            operating_company_id: body.data.operating_company_id,
            alert_id: params.data.id,
            resolved_by_user_id: user.uuid,
            note: body.data.note,
            resolving_journal_entry_id: body.data.resolving_journal_entry_id,
          })
        );
        return result;
      } catch (error) {
        const mapped = mapDriftAlertHttpError(error);
        if (mapped) return reply.code(mapped.statusCode).send(mapped.body);
        throw error;
      }
    }
  );

  // Manual trigger (owner/ops convenience — the real schedule is post-finalize + nightly cron).
  app.post(
    "/api/v1/banking/drift-alerts/detect",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      const body = detectBodySchema.safeParse(req.body ?? {});
      if (!body.success) return sendValidationError(reply, body.error);

      const result = await withCompanyScope(user.uuid, body.data.operating_company_id, (client) =>
        runDriftDetectors(client, body.data.operating_company_id)
      );
      return result;
    }
  );
}

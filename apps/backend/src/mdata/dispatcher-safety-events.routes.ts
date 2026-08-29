import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { resolveOperatingCompanyId, OperatingCompanyMembershipError } from "../auth/operating-company-scope.js";
import { requireAuth } from "../auth/session-middleware.js";
import { companyBusinessDate } from "../lib/company-business-date.js";

type ScopeClient = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };
const RL_READ = { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } } as const;
const RL_WRITE = { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } } as const;

// LST-CAT-06 — catalogs.dispatcher_error_reasons is per-entity + FORCE RLS company_scope.
// Prefer related LOAD's operating_company_id (owner ruling); else driver/customer; else caller.
async function setOperatingCompanyGuc(client: ScopeClient, operatingCompanyId: string): Promise<void> {
  // This is a shared SETTER, not a scope decision. Every caller authorises first: scopeToCallerCompany
  // goes through resolveOperatingCompanyId (validates against org.user_accessible_company_ids() and
  // throws forbidden_company_membership), and scopeToRelatedEntity now calls assertCompanyMembership on
  // the derived company before reaching here (MDATA-F03). An assert inside this one-line helper would
  // re-check what the caller just established.
  // membership-scope-exempt: shared setter; callers authorise before invoking it (see above)
  await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [operatingCompanyId]);
}

async function scopeToCallerCompany(client: ScopeClient, userId: string, requested?: string | null): Promise<string | null> {
  const operatingCompanyId = await resolveOperatingCompanyId(client, userId, requested ?? null);
  if (!operatingCompanyId) return null;
  // resolveOperatingCompanyId IS the membership check for this path: a caller-supplied company is
  // validated against org.user_accessible_company_ids() and throws the same forbidden_company_membership
  // error as assertCompanyMembership; when omitted it resolves from that same accessible set. Calling
  // assertCompanyMembership after it would re-query the identical source. The caller-supplied-id path
  // that genuinely lacked a check is scopeToRelatedEntity below, which now asserts explicitly (MDATA-F03).
  // membership-scope-exempt: validated inside resolveOperatingCompanyId (same accessible-company source)
  await setOperatingCompanyGuc(client, operatingCompanyId);
  return operatingCompanyId;
}

// The three lookups below read operating_company_id by raw id BEFORE app.operating_company_id is
// set — that's the point, they're how we learn which company to scope into. This is safe because
// mdata.loads/drivers/customers SELECT RLS gates on identity.current_user_id() -> org company
// membership (loads_select_office/loads_select_driver, drivers_select, customers_select), not on
// the operating_company_id GUC — a related id outside the caller's companies returns zero rows.
async function scopeToRelatedEntity(
  client: ScopeClient,
  userId: string,
  related: { loadId?: string | null; driverId?: string | null; customerId?: string | null }
): Promise<string | null> {
  if (related.loadId) {
    const res = await client.query<{ operating_company_id: string }>(
      `SELECT operating_company_id FROM mdata.loads WHERE id = $1 LIMIT 1`,
      [related.loadId]
    );
    const opco = res.rows[0]?.operating_company_id;
    if (!opco) return null;
    // CROSS-ENTITY WRITE GATE. The company here is derived from a CALLER-SUPPLIED id, so without this a
    // user in company A could pass company B's load/driver/customer id and have the GUC — and the
    // subsequent INSERT — land in company B. Asserted INSIDE the resolver so no call path can skip it.
    // Throws 403 forbidden_company_membership.
    await assertCompanyMembership(client, userId, opco);
    await setOperatingCompanyGuc(client, opco);
    return opco;
  }
  if (related.driverId) {
    const res = await client.query<{ operating_company_id: string }>(
      `SELECT operating_company_id FROM mdata.drivers WHERE id = $1 LIMIT 1`,
      [related.driverId]
    );
    const opco = res.rows[0]?.operating_company_id;
    if (!opco) return null;
    // CROSS-ENTITY WRITE GATE. The company here is derived from a CALLER-SUPPLIED id, so without this a
    // user in company A could pass company B's load/driver/customer id and have the GUC — and the
    // subsequent INSERT — land in company B. Asserted INSIDE the resolver so no call path can skip it.
    // Throws 403 forbidden_company_membership.
    await assertCompanyMembership(client, userId, opco);
    await setOperatingCompanyGuc(client, opco);
    return opco;
  }
  if (related.customerId) {
    const res = await client.query<{ operating_company_id: string }>(
      `SELECT operating_company_id FROM mdata.customers WHERE id = $1 LIMIT 1`,
      [related.customerId]
    );
    const opco = res.rows[0]?.operating_company_id;
    if (!opco) return null;
    // CROSS-ENTITY WRITE GATE. The company here is derived from a CALLER-SUPPLIED id, so without this a
    // user in company A could pass company B's load/driver/customer id and have the GUC — and the
    // subsequent INSERT — land in company B. Asserted INSIDE the resolver so no call path can skip it.
    // Throws 403 forbidden_company_membership.
    await assertCompanyMembership(client, userId, opco);
    await setOperatingCompanyGuc(client, opco);
    return opco;
  }
  return scopeToCallerCompany(client, userId, null);
}

const ownerAdminRoles = new Set(["Owner", "Administrator"]);
const eventTypeSchema = z.enum([
  "customer_complaint",
  "missed_appointment",
  "unpaid_invoice_responsibility",
  "abandoned_load_dispatcher_fault",
  "rate_below_threshold_unjustified",
  "driver_complaint_validated",
  "commendation",
  "training_required",
  "policy_violation",
  "other",
]);
const severitySchema = z.enum(["info", "warning", "severe"]);
const costRecoveryStatusSchema = z.enum(["pending", "partial", "recovered", "waived", "absorbed"]);
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const uuidSchema = z.string().uuid();

const userParamsSchema = z.object({ user_id: uuidSchema });
const eventParamsSchema = z.object({ user_id: uuidSchema, event_id: uuidSchema });
const reasonsQuerySchema = z.object({
  event_type: eventTypeSchema.optional(),
  operating_company_id: uuidSchema.optional(),
  include_inactive: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((value) => value === true || value === "true"),
});
const listQuerySchema = z.object({
  include_voided: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((value) => value === true || value === "true"),
  operating_company_id: uuidSchema.optional(),
});
const reverseListQuerySchema = z
  .object({
    operating_company_id: uuidSchema,
    related_load_id: uuidSchema.optional(),
    related_customer_id: uuidSchema.optional(),
    related_driver_id: uuidSchema.optional(),
    limit: z.coerce.number().int().min(1).max(200).default(25),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .refine(
    (value) => [value.related_load_id, value.related_customer_id, value.related_driver_id].filter(Boolean).length === 1,
    { message: "exactly one related entity filter is required" }
  );

const createDispatcherSafetyEventBodySchema = z
  .object({
    event_type: eventTypeSchema,
    event_date: isoDateSchema,
    severity: severitySchema,
    summary: z.string().trim().min(1).max(500),
    details: z.string().trim().max(5000).optional(),
    error_reason_id: uuidSchema.optional(),
    cost_amount: z.number().min(0).optional(),
    cost_currency: z.string().trim().min(3).max(3).optional(),
    cost_recovered_amount: z.number().min(0).optional(),
    cost_recovery_status: costRecoveryStatusSchema.optional(),
    related_load_id: uuidSchema.optional(),
    related_customer_id: uuidSchema.optional(),
    related_driver_id: uuidSchema.optional(),
    document_ids: z.array(uuidSchema).max(100).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.event_type !== "commendation" && value.event_type !== "other" && !value.error_reason_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "error_reason_id is required for this event_type",
        path: ["error_reason_id"],
      });
    }
  });

const updateDispatcherSafetyEventBodySchema = z
  .object({
    details: z.string().trim().max(5000).nullable().optional(),
    document_ids: z.array(uuidSchema).max(100).nullable().optional(),
    cost_recovery_status: costRecoveryStatusSchema.nullable().optional(),
    cost_recovered_amount: z.number().min(0).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "at least one field is required" });

const voidDispatcherSafetyEventBodySchema = z.object({
  void_reason: z.string().trim().min(10).max(1000),
});

const returningDispatcherBodySchema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function canReadDispatcherSafety(role: string): boolean {
  return ownerAdminRoles.has(role);
}

function isOwner(role: string): boolean {
  return role === "Owner";
}

function todayIsoDate() {
  return companyBusinessDate();
}

async function ensureTrackableDispatcherUser(client: { query: (sql: string, params: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> }, userId: string) {
  const res = await client.query(
    `
      SELECT
        u.id,
        u.email,
        u.role,
        EXISTS (SELECT 1 FROM mdata.drivers d WHERE d.identity_user_id = u.id) AS has_driver_record
      FROM identity.users u
      WHERE u.id = $1
      LIMIT 1
    `,
    [userId]
  );
  const user = res.rows[0] ?? null;
  if (!user) return { error: "identity_user_not_found" as const };
  if (String(user.role) === "Owner") return { error: "cannot_track_owner" as const };
  if (Boolean(user.has_driver_record)) return { error: "user_is_driver_use_driver_safety" as const };
  return {
    id: String(user.id),
    email: (user.email as string | null) ?? null,
    role: String(user.role),
  };
}

async function findReturningDispatcherMatches(
  client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> },
  email: string
) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) {
    return {
      returning_dispatcher: false,
      total_count: 0,
      matched_events: [],
      severity_summary: { severe_count: 0, warning_count: 0, info_count: 0 },
    };
  }

  const res = await client.query(
    `
      SELECT
        e.id AS event_id,
        e.dispatcher_user_id,
        e.event_type,
        e.event_date,
        e.severity,
        e.summary,
        e.cost_amount,
        e.cost_currency,
        e.cost_recovery_status,
        e.voided_at IS NOT NULL AS voided,
        e.dispatcher_email_snapshot,
        COUNT(*) OVER()::int AS total_count,
        COUNT(*) FILTER (WHERE e.severity = 'severe') OVER()::int AS severe_count,
        COUNT(*) FILTER (WHERE e.severity = 'warning') OVER()::int AS warning_count,
        COUNT(*) FILTER (WHERE e.severity = 'info') OVER()::int AS info_count,
        er.code AS error_reason_code,
        er.label AS error_reason_label
      FROM mdata.dispatcher_safety_events e
      LEFT JOIN catalogs.dispatcher_error_reasons er ON er.id = e.error_reason_id
      WHERE lower(e.dispatcher_email_snapshot) = $1
      ORDER BY e.event_date DESC, e.created_at DESC
      LIMIT 50
    `,
    [normalizedEmail]
  );

  const matchedEvents = res.rows.map((row) => ({
    event_id: String(row.event_id),
    dispatcher_user_id: String(row.dispatcher_user_id),
    event_type: String(row.event_type),
    event_date: String(row.event_date),
    severity: row.severity as "info" | "warning" | "severe",
    summary: String(row.summary),
    cost_amount: row.cost_amount === null ? null : Number(row.cost_amount),
    cost_currency: row.cost_currency ?? "USD",
    cost_recovery_status: row.cost_recovery_status,
    error_reason: row.error_reason_code
      ? {
          code: String(row.error_reason_code),
          label: String(row.error_reason_label ?? row.error_reason_code),
        }
      : null,
    voided: Boolean(row.voided),
  }));

  const countRow = res.rows[0];
  const totalCount = Number(countRow?.total_count ?? 0);
  const severitySummary = {
    severe_count: Number(countRow?.severe_count ?? 0),
    warning_count: Number(countRow?.warning_count ?? 0),
    info_count: Number(countRow?.info_count ?? 0),
  };

  return {
    returning_dispatcher: matchedEvents.length > 0,
    total_count: totalCount,
    matched_events: matchedEvents,
    severity_summary: severitySummary,
  };
}

export async function registerDispatcherSafetyEventsRoutes(app: FastifyInstance) {
  app.get("/api/v1/catalogs/dispatcher-error-reasons", RL_READ, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!canReadDispatcherSafety(authUser.role)) return reply.code(403).send({ error: "forbidden" });

    const parsedQuery = reasonsQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

    const reasons = await withCurrentUser(authUser.uuid, async (client) => {
      const opco = await scopeToCallerCompany(client, authUser.uuid, parsedQuery.data.operating_company_id ?? null);
      if (!opco) return [];

      const values: unknown[] = [];
      const filters: string[] = [];
      if (!parsedQuery.data.include_inactive) {
        filters.push("r.is_active = true", "r.deactivated_at IS NULL");
      }
      if (parsedQuery.data.event_type) {
        values.push(parsedQuery.data.event_type);
        filters.push(`r.event_type = $${values.length}`);
      }
      const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
      const res = await client.query(
        `
          SELECT r.id, r.operating_company_id, r.code, r.label, r.description, r.event_type, r.severity, r.is_active, r.deactivated_at
          FROM catalogs.dispatcher_error_reasons r
          ${whereClause}
          ORDER BY
            r.event_type ASC,
            CASE r.severity WHEN 'severe' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
            r.label ASC
        `,
        values
      );
      return res.rows;
    });
    return { reasons };
  });

  app.get("/api/v1/identity/users/:user_id/safety-events", RL_READ, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!canReadDispatcherSafety(authUser.role)) return reply.code(403).send({ error: "forbidden" });

    const parsedParams = userParamsSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedQuery = listQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

    const rows = await withCurrentUser(authUser.uuid, async (client) => {
      const trackable = await ensureTrackableDispatcherUser(client, parsedParams.data.user_id);
      if ("error" in trackable) return trackable;
      // Reason JOIN is FORCE RLS — set GUC so labels resolve for the active entity context.
      const opco = await scopeToCallerCompany(client, authUser.uuid, parsedQuery.data.operating_company_id ?? null);
      const filters = ["e.dispatcher_user_id = $1"];
      if (!parsedQuery.data.include_voided) {
        filters.push("e.voided_at IS NULL");
      }
      const res = await client.query(
        `
          SELECT
            e.id,
            e.dispatcher_user_id,
            e.event_type,
            e.event_date,
            e.severity,
            e.summary,
            e.details,
            e.error_reason_id,
            r.code AS error_reason_code,
            r.label AS error_reason_label,
            e.cost_amount,
            e.cost_currency,
            e.cost_recovered_amount,
            e.cost_recovery_status,
            e.related_load_id,
            rl.load_number AS related_load_number,
            e.related_customer_id,
            rc.customer_name AS related_customer_name,
            e.related_driver_id,
            concat_ws(' ', rd.first_name, rd.last_name) AS related_driver_name,
            e.document_ids,
            e.dispatcher_email_snapshot,
            e.voided_at,
            e.voided_by_user_id,
            vu.email AS voided_by_user_email,
            e.void_reason,
            e.created_at,
            e.updated_at
          FROM mdata.dispatcher_safety_events e
          LEFT JOIN catalogs.dispatcher_error_reasons r ON r.id = e.error_reason_id
          LEFT JOIN identity.users vu ON vu.id = e.voided_by_user_id
          LEFT JOIN mdata.loads rl ON rl.id = e.related_load_id AND rl.operating_company_id = $2::uuid
          LEFT JOIN mdata.customers rc ON rc.id = e.related_customer_id AND rc.operating_company_id = $2::uuid
          LEFT JOIN mdata.drivers rd ON rd.id = e.related_driver_id AND (rd.operating_company_id = $2::uuid OR EXISTS (
            SELECT 1 FROM mdata.driver_company_authorizations dispatcher_user_dca
            WHERE dispatcher_user_dca.driver_id = rd.id
              AND dispatcher_user_dca.company_id = $2::uuid
              AND dispatcher_user_dca.is_authorized = true
              AND dispatcher_user_dca.deactivated_at IS NULL
          ))
          WHERE ${filters.join(" AND ")}
          ORDER BY e.event_date DESC, e.created_at DESC
        `,
        [parsedParams.data.user_id, opco]
      );
      return { events: res.rows };
    });

    if ("error" in rows) {
      if (rows.error === "identity_user_not_found") return reply.code(404).send({ error: rows.error });
      if (rows.error === "cannot_track_owner" || rows.error === "user_is_driver_use_driver_safety") {
        return reply.code(400).send({ error: rows.error });
      }
    }
    return rows;
  });

  app.get("/api/v1/mdata/dispatcher-safety-events", RL_READ, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!canReadDispatcherSafety(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedQuery = reverseListQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

    try {
      const events = await withCurrentUser(authUser.uuid, async (client) => {
        const query = parsedQuery.data;
        const opco = await scopeToCallerCompany(client, authUser.uuid, query.operating_company_id);
        if (!opco) return { events: [], total_count: 0, limit: query.limit, offset: query.offset };
        const filter = query.related_load_id
          ? { sql: "e.related_load_id = $2 AND rl.id IS NOT NULL", value: query.related_load_id }
          : query.related_customer_id
            ? { sql: "e.related_customer_id = $2 AND rc.id IS NOT NULL", value: query.related_customer_id }
            : { sql: "e.related_driver_id = $2 AND rd.id IS NOT NULL", value: query.related_driver_id! };
        const res = await client.query(
          `
          WITH filtered AS (
          SELECT
            e.id, e.dispatcher_user_id, du.email AS dispatcher_email, e.event_type, e.event_date,
            e.severity, e.summary, e.details, e.cost_amount, e.cost_currency,
            e.cost_recovered_amount, e.cost_recovery_status,
            e.related_load_id, rl.load_number AS related_load_number,
            e.related_customer_id, rc.customer_name AS related_customer_name,
            e.related_driver_id, concat_ws(' ', rd.first_name, rd.last_name) AS related_driver_name,
            e.created_at, e.updated_at
          FROM mdata.dispatcher_safety_events e
          JOIN identity.users du ON du.id = e.dispatcher_user_id
          LEFT JOIN mdata.loads rl ON rl.id = e.related_load_id AND rl.operating_company_id = $1::uuid
          LEFT JOIN mdata.customers rc ON rc.id = e.related_customer_id AND rc.operating_company_id = $1::uuid
          LEFT JOIN mdata.drivers rd ON rd.id = e.related_driver_id AND (rd.operating_company_id = $1::uuid OR EXISTS (
            SELECT 1 FROM mdata.driver_company_authorizations dispatcher_reverse_dca
            WHERE dispatcher_reverse_dca.driver_id = rd.id
              AND dispatcher_reverse_dca.company_id = $1::uuid
              AND dispatcher_reverse_dca.is_authorized = true
              AND dispatcher_reverse_dca.deactivated_at IS NULL
          ))
          WHERE e.voided_at IS NULL AND ${filter.sql}
          ), totals AS (SELECT COUNT(*)::int AS total_count FROM filtered),
          page AS (SELECT * FROM filtered ORDER BY event_date DESC, created_at DESC, id LIMIT $3 OFFSET $4)
          SELECT page.*, totals.total_count FROM totals LEFT JOIN page ON true
        `,
          [opco, filter.value, query.limit, query.offset]
        );
        return {
          events: res.rows.filter((row) => row.id),
          total_count: Number(res.rows[0]?.total_count ?? 0),
          limit: query.limit,
          offset: query.offset,
        };
      });
      return events;
    } catch (error) {
      if (error instanceof OperatingCompanyMembershipError) {
        return reply.code(403).send({ error: "forbidden" });
      }
      throw error;
    }
  });

  app.post("/api/v1/identity/users/:user_id/safety-events", RL_WRITE, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isOwner(authUser.role)) return reply.code(403).send({ error: "forbidden" });

    const parsedParams = userParamsSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = createDispatcherSafetyEventBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const body = parsedBody.data;

    if (body.event_date > todayIsoDate()) return reply.code(400).send({ error: "event_date_in_future" });

    const created = await withCurrentUser(authUser.uuid, async (client) => {
      const trackable = await ensureTrackableDispatcherUser(client, parsedParams.data.user_id);
      if ("error" in trackable) return trackable;

      // Owner ruling LST-CAT-06: entity from related load/dispatch first — never dispatcher default alone.
      const opco = await scopeToRelatedEntity(client, authUser.uuid, {
        loadId: body.related_load_id,
        driverId: body.related_driver_id,
        customerId: body.related_customer_id,
      });
      if (!opco) {
        if (body.related_load_id) return { error: "related_load_not_found" as const };
        if (body.related_driver_id) return { error: "related_driver_not_found" as const };
        if (body.related_customer_id) return { error: "related_customer_not_found" as const };
        return { error: "operating_company_required" as const };
      }

      let normalizedSeverity = body.severity;
      if (body.error_reason_id) {
        const reasonRes = await client.query<{ id: string; event_type: string; severity: "info" | "warning" | "severe" }>(
          `
            SELECT id, event_type, severity
            FROM catalogs.dispatcher_error_reasons
            WHERE id = $1
              AND deactivated_at IS NULL
            LIMIT 1
          `,
          [body.error_reason_id]
        );
        const reason = reasonRes.rows[0];
        if (!reason) return { error: "invalid_error_reason" as const };
        if (reason.event_type !== body.event_type) return { error: "error_reason_event_type_mismatch" as const };
        if (reason.severity !== body.severity) return { error: "error_reason_severity_mismatch" as const };
        normalizedSeverity = reason.severity;
      }

      const insertRes = await client.query(
        `
          INSERT INTO mdata.dispatcher_safety_events (
            dispatcher_user_id, event_type, event_date, severity, summary, details, error_reason_id,
            cost_amount, cost_currency, cost_recovered_amount, cost_recovery_status,
            related_load_id, related_customer_id, related_driver_id,
            document_ids, dispatcher_email_snapshot, created_by_user_id, updated_by_user_id
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$17
          )
          RETURNING *
        `,
        [
          trackable.id,
          body.event_type,
          body.event_date,
          normalizedSeverity,
          body.summary,
          body.details ?? null,
          body.error_reason_id ?? null,
          body.cost_amount ?? null,
          (body.cost_currency ?? "USD").toUpperCase(),
          body.cost_recovered_amount ?? null,
          body.cost_recovery_status ?? null,
          body.related_load_id ?? null,
          body.related_customer_id ?? null,
          body.related_driver_id ?? null,
          body.document_ids ?? [],
          trackable.email ? trackable.email.toLowerCase() : null,
          authUser.uuid,
        ]
      );
      const row = insertRes.rows[0];

      await appendCrudAudit(
        client,
        authUser.uuid,
        "mdata.dispatcher_safety_events.created",
        {
          resource_id: row.id,
          resource_type: "mdata.dispatcher_safety_events",
          dispatcher_user_id: row.dispatcher_user_id,
          event_type: row.event_type,
          severity: row.severity,
          cost_amount: row.cost_amount,
          related_load_id: row.related_load_id,
          related_customer_id: row.related_customer_id,
          related_driver_id: row.related_driver_id,
        },
        row.severity === "severe" ? "critical" : row.severity,
        "BT-1-DISPATCHER-SAFETY-FILE"
      );

      return row;
    });

    if ("error" in created) {
      if (created.error === "identity_user_not_found") return reply.code(404).send({ error: created.error });
      if (created.error === "cannot_track_owner" || created.error === "user_is_driver_use_driver_safety") {
        return reply.code(400).send({ error: created.error });
      }
      if (created.error === "invalid_error_reason") return reply.code(400).send({ error: created.error });
      if (created.error === "error_reason_event_type_mismatch") return reply.code(400).send({ error: created.error });
      if (created.error === "error_reason_severity_mismatch") return reply.code(400).send({ error: created.error });
      if (
        created.error === "related_load_not_found" ||
        created.error === "related_driver_not_found" ||
        created.error === "related_customer_not_found" ||
        created.error === "operating_company_required"
      ) {
        return reply.code(400).send({ error: created.error });
      }
    }

    return reply.code(201).send({ event: created });
  });

  app.patch("/api/v1/identity/users/:user_id/safety-events/:event_id/void", RL_WRITE, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isOwner(authUser.role)) return reply.code(403).send({ error: "forbidden" });

    const parsedParams = eventParamsSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = voidDispatcherSafetyEventBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

    const result = await withCurrentUser(authUser.uuid, async (client) => {
      // CLS-JOIN-ENTITY-UNSCOPED fix (mirrors MDATA-F12 on the sibling driver-safety-events.routes.ts
      // void route): this route only checked isOwner() (a global role, not company membership) then
      // mutated by id+dispatcher_user_id with zero entity scope. Resolve scope from the row's own
      // related entity (same load/driver/customer priority scopeToRelatedEntity uses at creation) and
      // assert real company membership before voiding, matching the file's own GET/POST convention.
      const currentRes = await client.query<{
        id: string;
        voided_at: string | null;
        related_load_id: string | null;
        related_driver_id: string | null;
        related_customer_id: string | null;
      }>(
        `
          SELECT id, voided_at, related_load_id, related_driver_id, related_customer_id
          FROM mdata.dispatcher_safety_events
          WHERE id = $1 AND dispatcher_user_id = $2
          LIMIT 1
        `,
        [parsedParams.data.event_id, parsedParams.data.user_id]
      );
      const current = currentRes.rows[0];
      if (!current) return { error: "dispatcher_safety_event_not_found" as const };

      const voidScopedCompanyId = await scopeToRelatedEntity(client, authUser.uuid, {
        loadId: current.related_load_id,
        driverId: current.related_driver_id,
        customerId: current.related_customer_id,
      });
      if (!voidScopedCompanyId) return { error: "dispatcher_safety_event_scope_unresolved" as const };

      if (current.voided_at) return { error: "already_voided" as const };

      const updateRes = await client.query(
        `
          UPDATE mdata.dispatcher_safety_events
          SET voided_at = now(), voided_by_user_id = $3, void_reason = $4,
              updated_by_user_id = $3, updated_at = now()
          WHERE id = $1 AND dispatcher_user_id = $2 AND voided_at IS NULL
          RETURNING *
        `,
        [parsedParams.data.event_id, parsedParams.data.user_id, authUser.uuid, parsedBody.data.void_reason]
      );
      const row = updateRes.rows[0] ?? null;
      if (!row) return { error: "already_voided" as const };

      await appendCrudAudit(
        client,
        authUser.uuid,
        "mdata.dispatcher_safety_events.voided",
        {
          resource_id: row.id,
          resource_type: "mdata.dispatcher_safety_events",
          dispatcher_user_id: row.dispatcher_user_id,
          void_reason: row.void_reason,
        },
        "warning",
        "BT-1-DISPATCHER-SAFETY-FILE"
      );

      return row;
    });

    if ("error" in result) {
      if (result.error === "already_voided") return reply.code(400).send({ error: "already_voided" });
      if (result.error === "dispatcher_safety_event_scope_unresolved") return reply.code(409).send({ error: result.error });
      return reply.code(404).send({ error: result.error });
    }
    return { event: result };
  });

  app.patch("/api/v1/identity/users/:user_id/safety-events/:event_id", RL_WRITE, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isOwner(authUser.role)) return reply.code(403).send({ error: "forbidden" });

    const parsedParams = eventParamsSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = updateDispatcherSafetyEventBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

    const values: unknown[] = [parsedParams.data.event_id, parsedParams.data.user_id, authUser.uuid];
    const sets: string[] = [];
    if ("details" in parsedBody.data) {
      values.push(parsedBody.data.details ?? null);
      sets.push(`details = $${values.length}`);
    }
    if ("document_ids" in parsedBody.data) {
      values.push(parsedBody.data.document_ids ?? []);
      sets.push(`document_ids = $${values.length}`);
    }
    if ("cost_recovery_status" in parsedBody.data) {
      values.push(parsedBody.data.cost_recovery_status ?? null);
      sets.push(`cost_recovery_status = $${values.length}`);
    }
    if ("cost_recovered_amount" in parsedBody.data) {
      values.push(parsedBody.data.cost_recovered_amount ?? null);
      sets.push(`cost_recovered_amount = $${values.length}`);
    }
    sets.push("updated_by_user_id = $3");
    sets.push("updated_at = now()");

    const updated = await withCurrentUser(authUser.uuid, async (client) => {
      // CLS-JOIN-ENTITY-UNSCOPED fix (mirrors MDATA-F12 on the sibling driver-safety-events.routes.ts
      // PATCH-edit route, and the void route above): resolve scope from the row's own related entity
      // and assert real company membership before editing, matching the file's own GET/POST convention.
      const currentRes = await client.query<{
        id: string;
        related_load_id: string | null;
        related_driver_id: string | null;
        related_customer_id: string | null;
      }>(
        `
          SELECT id, related_load_id, related_driver_id, related_customer_id
          FROM mdata.dispatcher_safety_events
          WHERE id = $1 AND dispatcher_user_id = $2 AND voided_at IS NULL
          LIMIT 1
        `,
        [parsedParams.data.event_id, parsedParams.data.user_id]
      );
      const current = currentRes.rows[0];
      if (!current) return null;

      const editScopedCompanyId = await scopeToRelatedEntity(client, authUser.uuid, {
        loadId: current.related_load_id,
        driverId: current.related_driver_id,
        customerId: current.related_customer_id,
      });
      if (!editScopedCompanyId) return { error: "dispatcher_safety_event_scope_unresolved" as const };

      const updateRes = await client.query(
        `
          UPDATE mdata.dispatcher_safety_events
          SET ${sets.join(", ")}
          WHERE id = $1 AND dispatcher_user_id = $2 AND voided_at IS NULL
          RETURNING *
        `,
        values
      );
      const row = updateRes.rows[0] ?? null;
      if (!row) return null;

      await appendCrudAudit(
        client,
        authUser.uuid,
        "mdata.dispatcher_safety_events.updated",
        {
          resource_id: row.id,
          resource_type: "mdata.dispatcher_safety_events",
          dispatcher_user_id: row.dispatcher_user_id,
          fields: Object.keys(parsedBody.data),
        },
        "info",
        "BT-1-DISPATCHER-SAFETY-FILE"
      );

      return row;
    });
    if (!updated) return reply.code(404).send({ error: "dispatcher_safety_event_not_found" });
    if ("error" in updated) return reply.code(409).send({ error: updated.error });
    return { event: updated };
  });

  app.post("/api/v1/identity/users/check-returning-dispatcher", RL_WRITE, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!canReadDispatcherSafety(authUser.role)) return reply.code(403).send({ error: "forbidden" });

    const parsedBody = returningDispatcherBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

    const result = await withCurrentUser(authUser.uuid, async (client) => {
      return findReturningDispatcherMatches(client, parsedBody.data.email);
    });

    return result;
  });
}

export { findReturningDispatcherMatches, ensureTrackableDispatcherUser };

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { resolveOperatingCompanyId, OperatingCompanyMembershipError } from "../auth/operating-company-scope.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { companyBusinessDate } from "../lib/company-business-date.js";

type ScopeClient = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

// catalogs.driver_termination_reasons is per-entity (migration 202607890000). Two scope entry points:
//  - scopeToCallerCompany: for the catalog CRUD (admin manages THEIR entity's list) — resolves the
//    caller's DEFAULT company (or an explicit param) and sets the app.operating_company_id GUC.
//  - scopeToDriverCompany: for the referencing safety-event handlers — the reason must resolve in the
//    DRIVER's entity, so set the GUC from mdata.drivers.operating_company_id.
async function scopeToCallerCompany(client: ScopeClient, userId: string, requested?: string | null): Promise<string | null> {
  const operatingCompanyId = await resolveOperatingCompanyId(client, userId, requested ?? null);
  if (!operatingCompanyId) return null;
  await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [operatingCompanyId]);
  return operatingCompanyId;
}

// CLS-JOIN-ENTITY-UNSCOPED fix: this read is deliberately unscoped BEFORE the GUC is set (it's how the
// driver's company gets learned in the first place — same shape as mdata/dispatcher-safety-events.routes.ts's
// scopeToRelatedEntity), but unlike that sibling this one never asserted the CALLER actually belongs to
// the resolved company. Every caller in this file only checks a global role (isOwner/canReadSafetyFile),
// never company membership, so any Owner/Admin/Manager/Safety user of Company A could read or mutate
// Company B's driver safety file (CURP/CDL snapshots, incident/termination records) by naming Company
// B's driver_id — the same class as MDATA-F10/F11, just on this file's own routes. assertCompanyMembership
// throws 403 forbidden_company_membership when the caller has no real org.user_company_access row for
// the resolved company.
async function scopeToDriverCompany(client: ScopeClient, userId: string, driverId: string): Promise<string | null> {
  const res = await client.query(`SELECT operating_company_id FROM mdata.drivers WHERE id = $1 LIMIT 1`, [driverId]);
  const opco = res.rows[0]?.operating_company_id as string | undefined;
  if (!opco) return null;
  await assertCompanyMembership(client, userId, opco);
  await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [opco]);
  return opco;
}

const safetyReadableRoles = new Set(["Owner", "Administrator", "Manager", "Safety"]);
const eventTypeSchema = z.enum(["termination", "incident", "complaint", "commendation", "dispute"]);
const severitySchema = z.enum(["info", "warning", "severe"]);
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const uuidSchema = z.string().uuid();

const routeParamsSchema = z.object({
  driver_id: uuidSchema,
});

const eventParamsSchema = z.object({
  driver_id: uuidSchema,
  event_id: uuidSchema,
});

const listQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  include_voided: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((value) => value === true || value === "true"),
});

const createSafetyEventBodySchema = z
  .object({
    event_type: eventTypeSchema,
    event_date: isoDateSchema,
    severity: severitySchema,
    summary: z.string().trim().min(1).max(500),
    details: z.string().trim().max(5000).optional(),
    termination_reason_id: uuidSchema.optional(),
    related_load_id: uuidSchema.optional(),
    document_ids: z.array(uuidSchema).max(100).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.event_type === "termination" && !value.termination_reason_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "termination_reason_id is required for termination events",
        path: ["termination_reason_id"],
      });
    }
  });

const updateSafetyEventBodySchema = z
  .object({
    details: z.string().trim().max(5000).nullable().optional(),
    document_ids: z.array(uuidSchema).max(100).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "at least one field is required" });

const voidSafetyEventBodySchema = z.object({
  void_reason: z.string().trim().min(10).max(1000),
});

const suspendDriverBodySchema = z.object({
  reason: z.string().trim().min(1).max(5000),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function isOwner(role: string): boolean {
  return role === "Owner";
}

function canReadSafetyFile(role: string): boolean {
  return safetyReadableRoles.has(role);
}

function todayIsoDate(): string {
  return companyBusinessDate();
}

export async function registerDriverSafetyEventsRoutes(app: FastifyInstance) {
  // CodeQL: authorized mutation routes must be rate-limited (match peer mdata handlers).
  const RL_SUSPEND = { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } };

  app.get("/api/v1/catalogs/driver-termination-reasons", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return reply;
    if (!canReadSafetyFile(authUser.role)) return reply.code(403).send({ error: "forbidden" });

    const querySchema = z.object({
      include_inactive: z
        .union([z.boolean(), z.string()])
        .optional()
        .transform((value) => value === true || value === "true"),
      operating_company_id: z.string().uuid(),
    });
    const parsedQuery = querySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

    const reasons = await withCurrentUser(authUser.uuid, async (client) => {
      const opco = await scopeToCallerCompany(client, authUser.uuid, parsedQuery.data.operating_company_id).catch((e) => {
        if (e instanceof OperatingCompanyMembershipError) return null;
        throw e;
      });
      if (!opco) return null;
      const activeClause = parsedQuery.data.include_inactive ? "" : "AND is_active = true AND deactivated_at IS NULL";
      const result = await client.query(
        `
          SELECT id, operating_company_id, code, label, description, severity, is_active, deactivated_at
          FROM catalogs.driver_termination_reasons
          WHERE operating_company_id = $1::uuid
          ${activeClause}
          ORDER BY
            CASE severity
              WHEN 'severe' THEN 1
              WHEN 'warning' THEN 2
              ELSE 3
            END,
            label ASC
        `,
        [opco]
      );
      return result.rows;
    });

    if (reasons === null) return reply.code(403).send({ error: "forbidden" });
    return { reasons };
  });

  app.post("/api/v1/catalogs/driver-termination-reasons", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return reply;
    if (!isOwner(authUser.role)) return reply.code(403).send({ error: "forbidden" });

    const bodySchema = z.object({
      code: z
        .string()
        .trim()
        .regex(/^[a-z][a-z0-9_]+$/, "code must be lowercase letters, digits, and underscores")
        .min(2)
        .max(80),
      label: z.string().trim().min(1).max(160),
      description: z.string().trim().max(1000).nullable().optional(),
      severity: severitySchema,
    });
    const parsedQuery = z.object({ operating_company_id: z.string().uuid().optional() }).safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);
    const parsedBody = bodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const b = parsedBody.data;

    try {
      const created = await withCurrentUser(authUser.uuid, async (client) => {
        const opco = await scopeToCallerCompany(client, authUser.uuid, parsedQuery.data.operating_company_id).catch((e) => {
          if (e instanceof OperatingCompanyMembershipError) return null;
          throw e;
        });
        if (!opco) return null;
        const res = await client.query(
          `
            INSERT INTO catalogs.driver_termination_reasons (operating_company_id, code, label, description, severity, created_by_user_id, updated_by_user_id)
            VALUES ($1, $2, $3, $4, $5, $6, $6)
            RETURNING id, operating_company_id, code, label, description, severity, is_active, deactivated_at
          `,
          [opco, b.code, b.label, b.description ?? null, b.severity, authUser.uuid]
        );
        const row = res.rows[0];
        await appendCrudAudit(client, authUser.uuid, "catalogs.driver_termination_reasons_created", {
          resource_id: row.id,
          resource_type: "catalogs.driver_termination_reasons",
          code: row.code,
        });
        return row;
      });
      if (created === null) return reply.code(403).send({ error: "forbidden" });
      return reply.code(201).send({ reason: created });
    } catch (error) {
      if ((error as { code?: string }).code === "23505") return reply.code(409).send({ error: "termination_reason_code_conflict" });
      throw error;
    }
  });

  app.patch("/api/v1/catalogs/driver-termination-reasons/:id", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return reply;
    if (!isOwner(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = z.object({ id: uuidSchema }).safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const bodySchema = z
      .object({
        code: z
          .string()
          .trim()
          .regex(/^[a-z][a-z0-9_]+$/, "code must be lowercase letters, digits, and underscores")
          .min(2)
          .max(80)
          .optional(),
        label: z.string().trim().min(1).max(160).optional(),
        description: z.string().trim().max(1000).nullable().optional(),
        severity: severitySchema.optional(),
      })
      .refine((value) => Object.keys(value).length > 0, { message: "at least one field is required" });
    const parsedBody = bodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const b = parsedBody.data;

    const fields: string[] = [];
    const values: unknown[] = [];
    const add = (name: string, value: unknown) => {
      values.push(value);
      fields.push(`${name} = $${values.length}`);
    };
    if ("code" in b) add("code", b.code);
    if ("label" in b) add("label", b.label);
    if ("description" in b) add("description", b.description ?? null);
    if ("severity" in b) add("severity", b.severity);
    values.push(authUser.uuid);
    fields.push(`updated_by_user_id = $${values.length}`);
    fields.push("updated_at = now()");
    values.push(parsedParams.data.id);

    try {
      const updated = await withCurrentUser(authUser.uuid, async (client) => {
        const opco = await scopeToCallerCompany(client, authUser.uuid, null).catch((e) => {
          if (e instanceof OperatingCompanyMembershipError) return null;
          throw e;
        });
        if (!opco) return null;
        // WHERE id is entity-scoped by FORCE RLS via the GUC set above.
        const res = await client.query(
          `
            UPDATE catalogs.driver_termination_reasons
            SET ${fields.join(", ")}
            WHERE id = $${values.length}
            RETURNING id, code, label, description, severity, is_active, deactivated_at
          `,
          values
        );
        const row = res.rows[0] ?? null;
        if (!row) return null;
        await appendCrudAudit(client, authUser.uuid, "catalogs.driver_termination_reasons_updated", {
          resource_id: row.id,
          resource_type: "catalogs.driver_termination_reasons",
        });
        return row;
      });
      if (!updated) return reply.code(404).send({ error: "not_found" });
      return { reason: updated };
    } catch (error) {
      if ((error as { code?: string }).code === "23505") return reply.code(409).send({ error: "termination_reason_code_conflict" });
      throw error;
    }
  });

  app.post("/api/v1/catalogs/driver-termination-reasons/:id/deactivate", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return reply;
    if (!isOwner(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = z.object({ id: uuidSchema }).safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const updated = await withCurrentUser(authUser.uuid, async (client) => {
      const opco = await scopeToCallerCompany(client, authUser.uuid, null).catch((e) => {
        if (e instanceof OperatingCompanyMembershipError) return null;
        throw e;
      });
      if (!opco) return null;
      // WHERE id is entity-scoped by FORCE RLS via the GUC.
      const res = await client.query(
        `
          UPDATE catalogs.driver_termination_reasons
          SET is_active = false, deactivated_at = now(), updated_by_user_id = $2, updated_at = now()
          WHERE id = $1
          RETURNING id, code, label, description, severity, is_active, deactivated_at
        `,
        [parsedParams.data.id, authUser.uuid]
      );
      const row = res.rows[0] ?? null;
      if (!row) return null;
      await appendCrudAudit(client, authUser.uuid, "catalogs.driver_termination_reasons_deactivated", {
        resource_id: row.id,
        resource_type: "catalogs.driver_termination_reasons",
        code: row.code,
      });
      return row;
    });
    if (!updated) return reply.code(404).send({ error: "not_found" });
    return { reason: updated };
  });

  app.post("/api/v1/catalogs/driver-termination-reasons/:id/reactivate", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return reply;
    if (!isOwner(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = z.object({ id: uuidSchema }).safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const updated = await withCurrentUser(authUser.uuid, async (client) => {
      const res = await client.query(
        `
          UPDATE catalogs.driver_termination_reasons
          SET is_active = true, deactivated_at = NULL, updated_by_user_id = $2, updated_at = now()
          WHERE id = $1
          RETURNING id, code, label, description, severity, is_active, deactivated_at
        `,
        [parsedParams.data.id, authUser.uuid]
      );
      const row = res.rows[0] ?? null;
      if (!row) return null;
      await appendCrudAudit(client, authUser.uuid, "catalogs.driver_termination_reasons_updated", {
        resource_id: row.id,
        resource_type: "catalogs.driver_termination_reasons",
        changes: { is_active: true },
      });
      return row;
    });
    if (!updated) return reply.code(404).send({ error: "not_found" });
    return { reason: updated };
  });

  app.post("/api/v1/mdata/drivers/:driver_id/suspend", RL_SUSPEND, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return reply;
    if (!isOwner(authUser.role)) return reply.code(403).send({ error: "forbidden" });

    const parsedParams = routeParamsSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = suspendDriverBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const reason = parsedBody.data.reason.trim();
    const eventDate = todayIsoDate();
    const summary = `Driver suspended: ${reason}`;

    const result = await withCurrentUser(authUser.uuid, async (client) => {
      const driverRes = await client.query<{
        id: string;
        status: string;
        curp: string | null;
        cdl_number: string | null;
        cdl_state: string | null;
      }>(
        `
          SELECT id, status, curp, cdl_number, cdl_state
          FROM mdata.drivers
          WHERE id = $1
            AND operating_company_id IN (SELECT org.user_accessible_company_ids())
          LIMIT 1
        `,
        [parsedParams.data.driver_id]
      );
      const driver = driverRes.rows[0];
      if (!driver) return { error: "mdata_driver_not_found" as const };
      if (driver.status === "Terminated") return { error: "driver_already_terminated" as const };

      const updateRes = await client.query(
        `
          UPDATE mdata.drivers
          SET status = 'Inactive', updated_by_user_id = $2
          WHERE id = $1
            AND operating_company_id IN (SELECT org.user_accessible_company_ids())
          RETURNING id, status
        `,
        [parsedParams.data.driver_id, authUser.uuid]
      );
      const updatedDriver = updateRes.rows[0];
      if (!updatedDriver) return { error: "mdata_driver_not_found" as const };

      const insertRes = await client.query(
        `
          INSERT INTO mdata.driver_safety_events (
            driver_id,
            event_type,
            event_date,
            severity,
            summary,
            details,
            curp_snapshot,
            cdl_number_snapshot,
            cdl_state_snapshot,
            created_by_user_id,
            updated_by_user_id
          ) VALUES (
            $1, 'incident', $2, 'warning', $3, $4, $5, $6, $7, $8, $8
          )
          RETURNING *
        `,
        [
          parsedParams.data.driver_id,
          eventDate,
          summary,
          reason,
          driver.curp ?? null,
          driver.cdl_number ?? null,
          driver.cdl_state ?? null,
          authUser.uuid,
        ]
      );
      const event = insertRes.rows[0];

      await appendCrudAudit(client, authUser.uuid, "mdata.drivers.suspended", {
        resource_id: updatedDriver.id,
        resource_type: "mdata.drivers",
        driver_id: updatedDriver.id,
        status: updatedDriver.status,
        safety_event_id: event.id,
      });

      await appendCrudAudit(
        client,
        authUser.uuid,
        "mdata.driver_safety_events.created",
        {
          resource_id: event.id,
          resource_type: "mdata.driver_safety_events",
          driver_id: event.driver_id,
          event_type: event.event_type,
          severity: event.severity,
          suspend_flow: true,
        },
        "warning",
        "BT-1-DRIVER-SAFETY-FILE"
      );

      return { driver: updatedDriver, event };
    });

    if ("error" in result) {
      if (result.error === "driver_already_terminated") return reply.code(400).send({ error: result.error });
      return reply.code(404).send({ error: result.error });
    }

    return reply.code(200).send({ driver: result.driver, event: result.event });
  });

  app.get("/api/v1/mdata/drivers/:driver_id/safety-events", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return reply;
    if (!canReadSafetyFile(authUser.role)) return reply.code(403).send({ error: "forbidden" });

    const parsedParams = routeParamsSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedQuery = listQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

    const result = await withCurrentUser(authUser.uuid, async (client) => {
      // This mounted Driver Detail reverse read must honor the company selected in the UI. Resolving
      // company from driver_id alone makes a non-default-company page read whichever entity owns the
      // supplied UUID, rather than the USMCA context the operator is actually viewing.
      const companyId = await scopeToCallerCompany(
        client,
        authUser.uuid,
        parsedQuery.data.operating_company_id
      );
      if (!companyId) return { found: false as const, events: [] };
      const parent = await client.query(
        `
          SELECT 1
          FROM mdata.drivers d
          WHERE d.id = $1::uuid
            AND d.archived_at IS NULL
            AND (
              d.operating_company_id = $2::uuid
              OR EXISTS (
                SELECT 1
                FROM mdata.driver_company_authorizations dca
                WHERE dca.driver_id = d.id
                  AND dca.company_id = $2::uuid
                  AND dca.is_authorized = true
                  AND dca.deactivated_at IS NULL
              )
            )
          LIMIT 1
        `,
        [parsedParams.data.driver_id, companyId]
      );
      if (parent.rowCount === 0) return { found: false as const, events: [] };
      const filters = ["e.driver_id = $1"];
      if (!parsedQuery.data.include_voided) {
        filters.push("e.voided_at IS NULL");
      }
      const eventsResult = await client.query(
        `
          SELECT
            e.id,
            e.driver_id,
            e.event_type,
            e.event_date,
            e.severity,
            e.summary,
            e.details,
            e.termination_reason_id,
            tr.code AS termination_reason_code,
            tr.label AS termination_reason_label,
            tr.severity AS termination_reason_severity,
            e.related_load_id,
            e.document_ids,
            e.curp_snapshot,
            e.cdl_number_snapshot,
            e.cdl_state_snapshot,
            e.voided_at,
            e.voided_by_user_id,
            vu.email AS voided_by_user_email,
            e.void_reason,
            e.created_at,
            e.updated_at,
            e.created_by_user_id,
            e.updated_by_user_id
          FROM mdata.driver_safety_events e
          JOIN mdata.drivers d
            ON d.id = e.driver_id
           AND (
             d.operating_company_id = $2::uuid
             OR EXISTS (
               SELECT 1
               FROM mdata.driver_company_authorizations safety_event_dca
               WHERE safety_event_dca.driver_id = d.id
                 AND safety_event_dca.company_id = $2::uuid
                 AND safety_event_dca.is_authorized = true
                 AND safety_event_dca.deactivated_at IS NULL
             )
           )
          LEFT JOIN catalogs.driver_termination_reasons tr ON tr.id = e.termination_reason_id
          LEFT JOIN identity.users vu ON vu.id = e.voided_by_user_id
          WHERE ${filters.join(" AND ")}
          ORDER BY e.event_date DESC, e.created_at DESC
        `,
        [parsedParams.data.driver_id, companyId]
      );
      return { found: true as const, events: eventsResult.rows };
    });

    if (!result.found) return reply.code(404).send({ error: "mdata_driver_not_found" });
    return { events: result.events };
  });

  app.post("/api/v1/mdata/drivers/:driver_id/safety-events", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return reply;
    if (!isOwner(authUser.role)) return reply.code(403).send({ error: "forbidden" });

    const parsedParams = routeParamsSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = createSafetyEventBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const body = parsedBody.data;

    if (body.event_date > todayIsoDate()) {
      return reply.code(400).send({ error: "event_date_in_future" });
    }

    const created = await withCurrentUser(authUser.uuid, async (client) => {
      // Membership check FIRST (CLS-JOIN-ENTITY-UNSCOPED fix): also sets the GUC from the driver's
      // company so the per-entity termination-reason lookup below resolves (driver_termination_reasons
      // is FORCE RLS). Previously the CURP/CDL fetch below ran before this check.
      const opco = await scopeToDriverCompany(client, authUser.uuid, parsedParams.data.driver_id);
      if (!opco) return null;

      const driverRes = await client.query<{
        id: string;
        curp: string | null;
        cdl_number: string | null;
        cdl_state: string | null;
      }>(
        `
          SELECT id, curp, cdl_number, cdl_state
          FROM mdata.drivers
          WHERE id = $1
          LIMIT 1
        `,
        [parsedParams.data.driver_id]
      );
      const driver = driverRes.rows[0];
      if (!driver) return null;

      let normalizedSeverity = body.severity;
      if (body.event_type === "termination") {
        const reasonRes = await client.query<{ id: string; severity: "info" | "warning" | "severe" }>(
          `
            SELECT id, severity
            FROM catalogs.driver_termination_reasons
            WHERE id = $1
              AND deactivated_at IS NULL
            LIMIT 1
          `,
          [body.termination_reason_id]
        );
        const reason = reasonRes.rows[0];
        if (!reason) return { error: "invalid_termination_reason" as const };
        if (reason.severity !== body.severity) {
          return { error: "termination_severity_mismatch" as const };
        }
        normalizedSeverity = reason.severity;
      }

      const insertRes = await client.query(
        `
          INSERT INTO mdata.driver_safety_events (
            driver_id,
            event_type,
            event_date,
            severity,
            summary,
            details,
            termination_reason_id,
            related_load_id,
            document_ids,
            curp_snapshot,
            cdl_number_snapshot,
            cdl_state_snapshot,
            created_by_user_id,
            updated_by_user_id
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13
          )
          RETURNING *
        `,
        [
          parsedParams.data.driver_id,
          body.event_type,
          body.event_date,
          normalizedSeverity,
          body.summary,
          body.details ?? null,
          body.termination_reason_id ?? null,
          body.related_load_id ?? null,
          body.document_ids ?? [],
          driver.curp ?? null,
          driver.cdl_number ?? null,
          driver.cdl_state ?? null,
          authUser.uuid,
        ]
      );
      const row = insertRes.rows[0];

      if (body.event_type === "termination") {
        const driverUpdateRes = await client.query<{ id: string }>(
          `
            UPDATE mdata.drivers
            SET status = 'Terminated', termination_date = $2, updated_by_user_id = $3
            WHERE id = $1
              AND operating_company_id = $4::uuid
            RETURNING id::text
          `,
          [parsedParams.data.driver_id, body.event_date, authUser.uuid, opco]
        );
        if (driverUpdateRes.rows[0]?.id !== parsedParams.data.driver_id) {
          throw new Error("driver_termination_status_write_failed");
        }
      }

      await appendCrudAudit(
        client,
        authUser.uuid,
        "mdata.driver_safety_events.created",
        {
          resource_id: row.id,
          resource_type: "mdata.driver_safety_events",
          driver_id: row.driver_id,
          event_type: row.event_type,
          severity: row.severity,
        },
        row.severity === "severe" ? "critical" : row.severity,
        "BT-1-DRIVER-SAFETY-FILE"
      );

      return row;
    });

    if (!created) return reply.code(404).send({ error: "mdata_driver_not_found" });
    if ("error" in created) {
      if (created.error === "invalid_termination_reason") return reply.code(400).send({ error: "invalid_termination_reason" });
      return reply.code(400).send({ error: "termination_severity_mismatch" });
    }
    return reply.code(201).send({ event: created });
  });

  app.patch("/api/v1/mdata/drivers/:driver_id/safety-events/:event_id/void", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return reply;
    if (!isOwner(authUser.role)) return reply.code(403).send({ error: "forbidden" });

    const parsedParams = eventParamsSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = voidSafetyEventBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

    const result = await withCurrentUser(authUser.uuid, async (client) => {
      // CLS-JOIN-ENTITY-UNSCOPED fix: this route only checked isOwner() (a global role, not company
      // membership) then mutated by id+driver_id with zero entity scope — an Owner of Company A could
      // void Company B's driver safety event. Resolve the driver's company and assert real membership
      // (same cross-entity write gate as the GET/POST routes above) before touching the row.
      const opco = await scopeToDriverCompany(client, authUser.uuid, parsedParams.data.driver_id);
      if (!opco) return { error: "mdata_driver_safety_event_not_found" as const };

      const currentRes = await client.query<{ id: string; voided_at: string | null }>(
        `
          SELECT id, voided_at
          FROM mdata.driver_safety_events
          WHERE id = $1 AND driver_id = $2
          LIMIT 1
        `,
        [parsedParams.data.event_id, parsedParams.data.driver_id]
      );
      const existing = currentRes.rows[0];
      if (!existing) return { error: "mdata_driver_safety_event_not_found" as const };
      if (existing.voided_at) return { error: "already_voided" as const };

      const updateRes = await client.query(
        `
          UPDATE mdata.driver_safety_events
          SET
            voided_at = now(),
            voided_by_user_id = $3,
            void_reason = $4,
            updated_by_user_id = $3
          WHERE id = $1 AND driver_id = $2 AND voided_at IS NULL
          RETURNING *
        `,
        [parsedParams.data.event_id, parsedParams.data.driver_id, authUser.uuid, parsedBody.data.void_reason]
      );
      const row = updateRes.rows[0];
      if (!row) return { error: "already_voided" as const };

      await appendCrudAudit(
        client,
        authUser.uuid,
        "mdata.driver_safety_events.voided",
        {
          resource_id: row.id,
          resource_type: "mdata.driver_safety_events",
          driver_id: row.driver_id,
          operating_company_id: opco,
          void_reason: row.void_reason,
        },
        "warning",
        "BT-1-DRIVER-SAFETY-FILE"
      );

      return row;
    });

    if ("error" in result) {
      if (result.error === "already_voided") return reply.code(400).send({ error: "already_voided" });
      return reply.code(404).send({ error: result.error });
    }

    return { event: result };
  });

  app.patch("/api/v1/mdata/drivers/:driver_id/safety-events/:event_id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return reply;
    if (!isOwner(authUser.role)) return reply.code(403).send({ error: "forbidden" });

    const parsedParams = eventParamsSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = updateSafetyEventBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

    const values: unknown[] = [parsedParams.data.event_id, parsedParams.data.driver_id, authUser.uuid];
    const sets: string[] = [];
    if ("details" in parsedBody.data) {
      values.push(parsedBody.data.details ?? null);
      sets.push(`details = $${values.length}`);
    }
    if ("document_ids" in parsedBody.data) {
      values.push(parsedBody.data.document_ids ?? []);
      sets.push(`document_ids = $${values.length}`);
    }
    sets.push("updated_by_user_id = $3");

    const result = await withCurrentUser(authUser.uuid, async (client) => {
      // CLS-JOIN-ENTITY-UNSCOPED fix: same cross-entity write gate as the void route above — isOwner()
      // alone is a global role check, not company membership.
      const opco = await scopeToDriverCompany(client, authUser.uuid, parsedParams.data.driver_id);
      if (!opco) return null;

      const currentRes = await client.query<{
        id: string;
        event_type: string;
        event_date: string;
        severity: string;
        termination_reason_id: string | null;
      }>(
        `
          SELECT id, event_type, event_date, severity, termination_reason_id
          FROM mdata.driver_safety_events
          WHERE id = $1 AND driver_id = $2 AND voided_at IS NULL
          LIMIT 1
        `,
        [parsedParams.data.event_id, parsedParams.data.driver_id]
      );
      const current = currentRes.rows[0];
      if (!current) return null;

      const updateRes = await client.query(
        `
          UPDATE mdata.driver_safety_events
          SET ${sets.join(", ")}
          WHERE id = $1 AND driver_id = $2 AND voided_at IS NULL
          RETURNING *
        `,
        values
      );
      const row = updateRes.rows[0] ?? null;
      if (!row) return null;

      await appendCrudAudit(
        client,
        authUser.uuid,
        "mdata.driver_safety_events.updated",
        {
          resource_id: row.id,
          resource_type: "mdata.driver_safety_events",
          driver_id: row.driver_id,
          operating_company_id: opco,
          fields: Object.keys(parsedBody.data),
        },
        "info",
        "BT-1-DRIVER-SAFETY-FILE"
      );
      return row;
    });

    if (!result) return reply.code(404).send({ error: "mdata_driver_safety_event_not_found" });
    return { event: result };
  });
}

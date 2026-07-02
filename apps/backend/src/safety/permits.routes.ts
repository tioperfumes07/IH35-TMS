import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

export const PERMIT_TYPES = [
  "state_operating_authority",
  "ifta_sticker",
  "oversize_overweight",
  "hazmat",
  "other",
] as const;

const permitTypeSchema = z.enum(PERMIT_TYPES);

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const listQuerySchema = companyQuerySchema.extend({
  include_archived: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
  permit_type: permitTypeSchema.optional(),
});

const idParamsSchema = z.object({
  id: z.string().uuid(),
});

const createBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  permit_type: permitTypeSchema,
  permit_number: z.string().max(120).default(""),
  issuing_state: z.string().max(2).nullable().optional(),
  holder_name: z.string().max(200).default(""),
  issued_date: z.string().nullable().optional(),
  expiry_date: z.string().min(1),
  unit_id: z.string().uuid().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

const patchBodySchema = z.object({
  permit_type: permitTypeSchema.optional(),
  permit_number: z.string().max(120).optional(),
  issuing_state: z.string().max(2).nullable().optional(),
  holder_name: z.string().max(200).optional(),
  issued_date: z.string().nullable().optional(),
  expiry_date: z.string().optional(),
  unit_id: z.string().uuid().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

const renewalReminderPatchSchema = z.object({
  days_before_expiry: z.number().int().min(1).max(365).optional(),
  enabled: z.boolean().optional(),
});

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
};

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

async function withCompanyScope<T>(
  userId: string,
  operatingCompanyId: string,
  fn: (client: Queryable) => Promise<T>
) {
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [operatingCompanyId]);
    return fn(client as Queryable);
  });
}

function canMutate(role: string) {
  return ["Owner", "Administrator", "Manager", "Safety"].includes(role);
}

function renewalSeverity(daysToExpiry: number | null) {
  if (daysToExpiry == null) return "unknown";
  if (daysToExpiry < 0) return "expired";
  if (daysToExpiry <= 30) return "warning";
  return "ok";
}

function mapPermitRow(row: Record<string, unknown>) {
  const days = Number((row as { days_to_expiry?: number | null }).days_to_expiry);
  return {
    ...row,
    renewal_severity: renewalSeverity(Number.isFinite(days) ? days : null),
  };
}

async function getOrCreateRenewalReminder(client: Queryable, companyId: string) {
  const existing = await client.query(
    `
      SELECT *
      FROM safety.permit_renewal_reminders
      WHERE operating_company_id = $1
      LIMIT 1
    `,
    [companyId]
  );
  if (existing.rows[0]) return existing.rows[0];

  const inserted = await client.query(
    `
      INSERT INTO safety.permit_renewal_reminders (operating_company_id, days_before_expiry, enabled)
      VALUES ($1, 30, true)
      ON CONFLICT (operating_company_id) DO UPDATE SET updated_at = now()
      RETURNING *
    `,
    [companyId]
  );
  return inserted.rows[0];
}

export async function registerSafetyPermitsRoutes(app: FastifyInstance) {
  app.get("/api/v1/safety/permits", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const query = listQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const payload = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const reminder = await getOrCreateRenewalReminder(client, query.data.operating_company_id);
      const daysBefore = Number((reminder as { days_before_expiry?: number }).days_before_expiry ?? 30);
      const reminderEnabled = Boolean((reminder as { enabled?: boolean }).enabled);

      const filters = ["p.operating_company_id = $1"];
      const values: unknown[] = [query.data.operating_company_id];
      if (!query.data.include_archived) {
        filters.push("p.archived_at IS NULL");
      }
      if (query.data.permit_type) {
        values.push(query.data.permit_type);
        filters.push(`p.permit_type = $${values.length}`);
      }

      const res = await client.query(
        `
          SELECT
            p.*,
            (p.expiry_date - CURRENT_DATE) AS days_to_expiry
          FROM safety.permits p
          WHERE ${filters.join(" AND ")}
          ORDER BY p.expiry_date ASC, p.created_at DESC
        `,
        values
      );
      const permits = res.rows.map((row) => mapPermitRow(row as Record<string, unknown>));

      let renewal_alerts: Record<string, unknown>[] = [];
      if (reminderEnabled) {
        const alertRes = await client.query(
          `
            SELECT
              p.*,
              (p.expiry_date - CURRENT_DATE) AS days_to_expiry
            FROM safety.permits p
            WHERE p.operating_company_id = $1
              AND p.archived_at IS NULL
              AND (p.expiry_date - CURRENT_DATE) <= $2
            ORDER BY p.expiry_date ASC
          `,
          [query.data.operating_company_id, daysBefore]
        );
        renewal_alerts = alertRes.rows.map((row) => mapPermitRow(row as Record<string, unknown>));
      }

      return {
        permits,
        renewal_alerts,
        renewal_reminder: reminder,
      };
    });

    return payload;
  });

  app.get("/api/v1/safety/permits/renewal-reminder", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const reminder = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) =>
      getOrCreateRenewalReminder(client, query.data.operating_company_id)
    );
    return { renewal_reminder: reminder };
  });

  app.patch("/api/v1/safety/permits/renewal-reminder", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const body = renewalReminderPatchSchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const updated = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      await getOrCreateRenewalReminder(client, query.data.operating_company_id);
      const res = await client.query(
        `
          UPDATE safety.permit_renewal_reminders
          SET days_before_expiry = COALESCE($2, days_before_expiry),
              enabled = COALESCE($3, enabled),
              updated_at = now()
          WHERE operating_company_id = $1
          RETURNING *
        `,
        [query.data.operating_company_id, body.data.days_before_expiry ?? null, body.data.enabled ?? null]
      );
      const row = res.rows[0];
      if (!row) return null;
      await appendCrudAudit(
        client,
        user.uuid,
        "safety.permit_renewal_reminder.updated",
        {
          resource_type: "safety.permit_renewal_reminders",
          resource_id: (row as { id?: string }).id ?? null,
          operating_company_id: query.data.operating_company_id,
          days_before_expiry: (row as { days_before_expiry?: number }).days_before_expiry ?? null,
        },
        "info",
        "A23-13"
      );
      return row;
    });

    if (!updated) return reply.code(500).send({ error: "update_failed" });
    return { renewal_reminder: updated };
  });

  app.post("/api/v1/safety/permits", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const body = createBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const created = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          INSERT INTO safety.permits (
            operating_company_id,
            permit_type,
            permit_number,
            issuing_state,
            holder_name,
            issued_date,
            expiry_date,
            unit_id,
            notes,
            created_by_user_id,
            updated_by_user_id
          )
          VALUES ($1, $2, $3, $4, $5, $6::date, $7::date, $8, $9, $10, $10)
          RETURNING *, (expiry_date - CURRENT_DATE) AS days_to_expiry
        `,
        [
          body.data.operating_company_id,
          body.data.permit_type,
          body.data.permit_number,
          body.data.issuing_state ?? null,
          body.data.holder_name,
          body.data.issued_date ?? null,
          body.data.expiry_date,
          body.data.unit_id ?? null,
          body.data.notes ?? null,
          user.uuid,
        ]
      );
      const row = res.rows[0];
      if (!row) return null;
      await appendCrudAudit(
        client,
        user.uuid,
        "safety.permit.created",
        {
          resource_type: "safety.permits",
          resource_id: (row as { id?: string }).id ?? null,
          operating_company_id: body.data.operating_company_id,
          permit_type: body.data.permit_type,
        },
        "info",
        "A23-13"
      );
      return mapPermitRow(row as Record<string, unknown>);
    });

    if (!created) return reply.code(500).send({ error: "create_failed" });
    return reply.code(201).send({ permit: created });
  });

  app.patch("/api/v1/safety/permits/:id", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const body = patchBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const updated = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          UPDATE safety.permits
          SET permit_type = COALESCE($3, permit_type),
              permit_number = COALESCE($4, permit_number),
              issuing_state = COALESCE($5, issuing_state),
              holder_name = COALESCE($6, holder_name),
              issued_date = COALESCE($7::date, issued_date),
              expiry_date = COALESCE($8::date, expiry_date),
              unit_id = COALESCE($9, unit_id),
              notes = COALESCE($10, notes),
              updated_by_user_id = $11,
              updated_at = now()
          WHERE id = $1
            AND operating_company_id = $2
            AND archived_at IS NULL
          RETURNING *, (expiry_date - CURRENT_DATE) AS days_to_expiry
        `,
        [
          params.data.id,
          query.data.operating_company_id,
          body.data.permit_type ?? null,
          body.data.permit_number ?? null,
          body.data.issuing_state ?? null,
          body.data.holder_name ?? null,
          body.data.issued_date ?? null,
          body.data.expiry_date ?? null,
          body.data.unit_id ?? null,
          body.data.notes ?? null,
          user.uuid,
        ]
      );
      const row = res.rows[0];
      if (!row) return null;
      await appendCrudAudit(
        client,
        user.uuid,
        "safety.permit.updated",
        {
          resource_type: "safety.permits",
          resource_id: params.data.id,
          operating_company_id: query.data.operating_company_id,
        },
        "info",
        "A23-13"
      );
      return mapPermitRow(row as Record<string, unknown>);
    });

    if (!updated) return reply.code(404).send({ error: "permit_not_found" });
    return { permit: updated };
  });

  app.post("/api/v1/safety/permits/:id/archive", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const archived = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          UPDATE safety.permits
          SET archived_at = now(),
              updated_by_user_id = $3,
              updated_at = now()
          WHERE id = $1
            AND operating_company_id = $2
            AND archived_at IS NULL
          RETURNING *
        `,
        [params.data.id, query.data.operating_company_id, user.uuid]
      );
      const row = res.rows[0];
      if (!row) return null;
      await appendCrudAudit(
        client,
        user.uuid,
        "safety.permit.archived",
        {
          resource_type: "safety.permits",
          resource_id: params.data.id,
          operating_company_id: query.data.operating_company_id,
        },
        "info",
        "A23-13"
      );
      return row;
    });

    if (!archived) return reply.code(404).send({ error: "permit_not_found" });
    return { permit: archived };
  });

  app.post("/api/v1/safety/permits/:id/restore", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const restored = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          UPDATE safety.permits
          SET archived_at = NULL,
              updated_by_user_id = $3,
              updated_at = now()
          WHERE id = $1
            AND operating_company_id = $2
            AND archived_at IS NOT NULL
          RETURNING *, (expiry_date - CURRENT_DATE) AS days_to_expiry
        `,
        [params.data.id, query.data.operating_company_id, user.uuid]
      );
      const row = res.rows[0];
      if (!row) return null;
      await appendCrudAudit(
        client,
        user.uuid,
        "safety.permit.restored",
        {
          resource_type: "safety.permits",
          resource_id: params.data.id,
          operating_company_id: query.data.operating_company_id,
        },
        "info",
        "A23-13"
      );
      return mapPermitRow(row as Record<string, unknown>);
    });

    if (!restored) return reply.code(404).send({ error: "permit_not_found" });
    return { permit: restored };
  });
}

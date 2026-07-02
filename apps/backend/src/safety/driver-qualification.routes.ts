import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const driverParamsSchema = z.object({
  driver_id: z.string().uuid(),
});

const itemParamsSchema = z.object({
  id: z.string().uuid(),
});

const createDqItemSchema = z.object({
  driver_id: z.string().uuid(),
  item_name: z.string().trim().min(1),
  status: z.enum(["present", "missing", "expired"]).default("present"),
  effective_date: z.string().optional(),
  expiry_date: z.string().optional(),
  notes: z.string().optional(),
});

const patchDqItemSchema = z.object({
  status: z.enum(["present", "missing", "expired"]).optional(),
  effective_date: z.string().nullable().optional(),
  expiry_date: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  voided_reason: z.string().trim().min(1).optional(),
});

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function canMutate(role: string) {
  return ["Owner", "Administrator", "Manager", "Safety"].includes(role);
}

async function withCompanyScope<T>(
  userId: string,
  operatingCompanyId: string,
  fn: (client: Queryable) => Promise<T>
) {
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [operatingCompanyId]);
    return fn(client as Queryable);
  });
}

function expiryPill(daysToExpiry: number | null) {
  if (daysToExpiry == null) return "unknown";
  if (daysToExpiry < 0) return "red";
  if (daysToExpiry <= 30) return "amber";
  return "green";
}

export async function registerSafetyDriverQualificationRoutes(app: FastifyInstance) {
  app.get("/api/v1/safety/driver-qualification/drivers/:driver_id/items", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const company = companyQuerySchema.safeParse(req.query ?? {});
    if (!company.success) return reply.code(400).send({ error: "validation_error", details: company.error.flatten() });
    const params = driverParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });

    const items = await withCompanyScope(user.uuid, company.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT
            id,
            operating_company_id,
            driver_id,
            item_name,
            status,
            effective_date,
            expiry_date,
            notes,
            voided_at,
            voided_reason,
            created_at,
            updated_at,
            CASE
              WHEN expiry_date IS NULL THEN NULL
              ELSE (expiry_date - CURRENT_DATE)
            END AS days_to_expiry
          FROM safety.driver_qualification_files
          WHERE operating_company_id = $1
            AND driver_id = $2
            AND voided_at IS NULL
          ORDER BY item_name ASC
        `,
        [company.data.operating_company_id, params.data.driver_id]
      );
      return res.rows.map((row) => {
        // Number(null) === 0 would coerce a NULL expiry (no card on file) into an
        // "amber" pill; keep null as null so it maps to the "unknown" pill.
        const raw = (row as { days_to_expiry?: number | null }).days_to_expiry;
        const days = raw == null ? null : Number(raw);
        return {
          ...row,
          expiry_pill: expiryPill(days != null && Number.isFinite(days) ? days : null),
        };
      });
    });

    return { items };
  });

  app.post("/api/v1/safety/driver-qualification/items", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const company = companyQuerySchema.safeParse(req.query ?? {});
    if (!company.success) return reply.code(400).send({ error: "validation_error", details: company.error.flatten() });
    const body = createDqItemSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    const created = await withCompanyScope(user.uuid, company.data.operating_company_id, async (client) => {
      const insertRes = await client.query(
        `
          INSERT INTO safety.driver_qualification_files (
            operating_company_id,
            driver_id,
            item_name,
            status,
            effective_date,
            expiry_date,
            notes
          )
          VALUES ($1, $2, $3, $4, $5::date, $6::date, $7)
          RETURNING *
        `,
        [
          company.data.operating_company_id,
          body.data.driver_id,
          body.data.item_name,
          body.data.status,
          body.data.effective_date ?? null,
          body.data.expiry_date ?? null,
          body.data.notes ?? null,
        ]
      );

      await appendCrudAudit(
        client,
        user.uuid,
        "safety.driver_qualification.item_created",
        {
          resource_type: "safety.driver_qualification_files",
          resource_id: (insertRes.rows[0] as { id?: string })?.id ?? null,
          operating_company_id: company.data.operating_company_id,
          driver_id: body.data.driver_id,
        },
        "info",
        "P7-SAF-DRIVER-DQF"
      );
      return insertRes.rows[0];
    });

    return reply.code(201).send(created);
  });

  app.patch("/api/v1/safety/driver-qualification/items/:id", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const company = companyQuerySchema.safeParse(req.query ?? {});
    if (!company.success) return reply.code(400).send({ error: "validation_error", details: company.error.flatten() });
    const params = itemParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const body = patchDqItemSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    const updated = await withCompanyScope(user.uuid, company.data.operating_company_id, async (client) => {
      const existingRes = await client.query(
        `
          SELECT *
          FROM safety.driver_qualification_files
          WHERE id = $1
            AND operating_company_id = $2
            AND voided_at IS NULL
          LIMIT 1
        `,
        [params.data.id, company.data.operating_company_id]
      );
      const existing = existingRes.rows[0];
      if (!existing) return null;

      if (body.data.voided_reason) {
        const voidRes = await client.query(
          `
            UPDATE safety.driver_qualification_files
            SET voided_at = now(),
                voided_reason = $3,
                updated_at = now()
            WHERE id = $1
              AND operating_company_id = $2
              AND voided_at IS NULL
            RETURNING *
          `,
          [params.data.id, company.data.operating_company_id, body.data.voided_reason]
        );
        await appendCrudAudit(
          client,
          user.uuid,
          "safety.driver_qualification.item_voided",
          {
            resource_type: "safety.driver_qualification_files",
            resource_id: params.data.id,
            operating_company_id: company.data.operating_company_id,
            driver_id: (existing as { driver_id?: string }).driver_id ?? null,
          },
          "info",
          "P7-SAF-DRIVER-DQF"
        );
        return voidRes.rows[0];
      }

      const patchRes = await client.query(
        `
          UPDATE safety.driver_qualification_files
          SET status = COALESCE($3, status),
              effective_date = COALESCE($4::date, effective_date),
              expiry_date = COALESCE($5::date, expiry_date),
              notes = COALESCE($6, notes),
              updated_at = now()
          WHERE id = $1
            AND operating_company_id = $2
            AND voided_at IS NULL
          RETURNING *
        `,
        [
          params.data.id,
          company.data.operating_company_id,
          body.data.status ?? null,
          body.data.effective_date ?? null,
          body.data.expiry_date ?? null,
          body.data.notes ?? null,
        ]
      );

      await appendCrudAudit(
        client,
        user.uuid,
        "safety.driver_qualification.item_updated",
        {
          resource_type: "safety.driver_qualification_files",
          resource_id: params.data.id,
          operating_company_id: company.data.operating_company_id,
          driver_id: (existing as { driver_id?: string }).driver_id ?? null,
        },
        "info",
        "P7-SAF-DRIVER-DQF"
      );
      return patchRes.rows[0];
    });

    if (!updated) return reply.code(404).send({ error: "driver_qualification_item_not_found" });
    return updated;
  });
}

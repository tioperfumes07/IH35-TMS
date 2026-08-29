import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  driver_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const RL_READ = { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } };
const RL_WRITE = { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } };

const driverParamsSchema = z.object({
  driver_id: z.string().uuid(),
});

const cardParamsSchema = z.object({
  id: z.string().uuid(),
});

const createMedicalCardSchema = z.object({
  driver_id: z.string().uuid(),
  card_number: z.string().trim().min(1),
  issued_date: z.string(),
  expiry_date: z.string(),
  notes: z.string().optional(),
});

const patchMedicalCardSchema = z.object({
  card_number: z.string().trim().min(1).optional(),
  issued_date: z.string().optional(),
  expiry_date: z.string().optional(),
  notes: z.string().nullable().optional(),
  voided_reason: z.string().trim().min(1).optional(),
});

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return reply;
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
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [operatingCompanyId]);
    return fn(client as Queryable);
  });
}

function expiryPill(daysToExpiry: number | null) {
  if (daysToExpiry == null) return "unknown";
  if (daysToExpiry < 0) return "red";
  if (daysToExpiry <= 30) return "amber";
  return "green";
}

function mapMedicalCardRow(row: Record<string, unknown>) {
  const days = Number((row as { days_to_expiry?: number | null }).days_to_expiry);
  return {
    ...row,
    expiry_pill: expiryPill(Number.isFinite(days) ? days : null),
  };
}

export async function registerSafetyMedicalCardsRoutes(app: FastifyInstance) {
  app.get("/api/v1/safety/medical-cards", RL_READ, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const company = companyQuerySchema.safeParse(req.query ?? {});
    if (!company.success) return reply.code(400).send({ error: "validation_error", details: company.error.flatten() });
    const result = await withCompanyScope(user.uuid, company.data.operating_company_id, async (client) => {
      if (company.data.driver_id) {
        const parent = await client.query(
          `SELECT 1 FROM mdata.drivers d
            WHERE d.id = $1::uuid
              AND d.archived_at IS NULL
              AND (
                d.operating_company_id = $2::uuid
                OR EXISTS (
                  SELECT 1 FROM mdata.driver_company_authorizations dca
                   WHERE dca.driver_id = d.id
                     AND dca.company_id = $2::uuid
                     AND dca.is_authorized = true
                     AND dca.deactivated_at IS NULL
                )
              )
            LIMIT 1`,
          [company.data.driver_id, company.data.operating_company_id]
        );
        if (!parent.rows[0]) return { found: false, cards: [], total_count: 0 };
      }
      const values: unknown[] = [company.data.operating_company_id];
      const driverFilter = company.data.driver_id
        ? (values.push(company.data.driver_id), `AND mc.driver_id = $${values.length}::uuid`)
        : "";
      const countRes = await client.query(
        `SELECT count(*)::int AS total_count
         FROM safety.medical_cards mc
         WHERE mc.operating_company_id = $1::uuid
           AND mc.voided_at IS NULL
           ${driverFilter}`,
        values
      );
      values.push(company.data.limit, company.data.offset);
      const res = await client.query(
        `
          SELECT mc.*,
                 NULLIF(TRIM(COALESCE(d.first_name, '') || ' ' || COALESCE(d.last_name, '')), '') AS driver_name,
                 CASE WHEN mc.expiry_date IS NULL THEN NULL ELSE (mc.expiry_date - CURRENT_DATE) END AS days_to_expiry
          FROM safety.medical_cards mc
          JOIN mdata.drivers d
            ON d.id = mc.driver_id
           AND (
             d.operating_company_id = mc.operating_company_id
             OR EXISTS (
               SELECT 1 FROM mdata.driver_company_authorizations label_dca
                WHERE label_dca.driver_id = d.id
                  AND label_dca.company_id = mc.operating_company_id
                  AND label_dca.is_authorized = true
                  AND label_dca.deactivated_at IS NULL
             )
           )
          WHERE mc.operating_company_id = $1::uuid
            AND mc.voided_at IS NULL
            ${driverFilter}
          ORDER BY mc.expiry_date ASC, mc.created_at DESC
          LIMIT $${values.length - 1} OFFSET $${values.length}
        `,
        values
      );
      return {
        found: true,
        cards: res.rows.map((row) => mapMedicalCardRow(row as Record<string, unknown>)),
        total_count: Number(countRes.rows[0]?.total_count ?? 0),
      };
    });
    if (!result.found) return reply.code(404).send({ error: "mdata_driver_not_found" });
    return { cards: result.cards, total_count: result.total_count };
  });

  app.get("/api/v1/safety/medical-cards/drivers/:driver_id", RL_READ, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const company = companyQuerySchema.safeParse(req.query ?? {});
    if (!company.success) return reply.code(400).send({ error: "validation_error", details: company.error.flatten() });
    const params = driverParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });

    const cards = await withCompanyScope(user.uuid, company.data.operating_company_id, async (client) => {
      const parent = await client.query(
        `SELECT 1
         FROM mdata.drivers d
         WHERE d.id = $1::uuid
           AND d.archived_at IS NULL
           AND (
             d.operating_company_id = $2::uuid
             OR EXISTS (
               SELECT 1 FROM mdata.driver_company_authorizations dca
               WHERE dca.driver_id = d.id
                 AND dca.company_id = $2::uuid
                 AND dca.is_authorized = true
                 AND dca.deactivated_at IS NULL
             )
           )
         LIMIT 1`,
        [params.data.driver_id, company.data.operating_company_id]
      );
      if (!parent.rows[0]) return null;
      const res = await client.query(
        `
          SELECT
            id,
            operating_company_id,
            driver_id,
            card_number,
            issued_date,
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
          FROM safety.medical_cards
          WHERE operating_company_id = $1::uuid
            AND driver_id = $2
            AND voided_at IS NULL
          ORDER BY expiry_date DESC, created_at DESC
        `,
        [company.data.operating_company_id, params.data.driver_id]
      );
      return res.rows.map((row) => mapMedicalCardRow(row as Record<string, unknown>));
    });

    if (!cards) return reply.code(404).send({ error: "mdata_driver_not_found" });
    return { cards };
  });

  app.post("/api/v1/safety/medical-cards", RL_WRITE, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const company = companyQuerySchema.safeParse(req.query ?? {});
    if (!company.success) return reply.code(400).send({ error: "validation_error", details: company.error.flatten() });
    const body = createMedicalCardSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    const created = await withCompanyScope(user.uuid, company.data.operating_company_id, async (client) => {
      const driver = await client.query(
        `SELECT id FROM mdata.drivers d
         WHERE d.id = $1::uuid
           AND (d.operating_company_id = $2::uuid OR EXISTS (
             SELECT 1 FROM mdata.driver_company_authorizations medical_card_create_driver_dca
             WHERE medical_card_create_driver_dca.driver_id = d.id
               AND medical_card_create_driver_dca.company_id = $2::uuid
               AND medical_card_create_driver_dca.is_authorized = true
               AND medical_card_create_driver_dca.deactivated_at IS NULL
           ))
         LIMIT 1`,
        [body.data.driver_id, company.data.operating_company_id]
      );
      if (!driver.rows[0]) return null;
      const res = await client.query(
        `
          INSERT INTO safety.medical_cards (
            operating_company_id,
            driver_id,
            card_number,
            issued_date,
            expiry_date,
            notes
          )
          VALUES ($1, $2, $3, $4::date, $5::date, $6)
          RETURNING *
        `,
        [
          company.data.operating_company_id,
          body.data.driver_id,
          body.data.card_number,
          body.data.issued_date,
          body.data.expiry_date,
          body.data.notes ?? null,
        ]
      );
      const card = res.rows[0] as { id?: string } | undefined;
      if (!card?.id) throw new Error("safety_medical_card_insert_failed");

      await appendCrudAudit(
        client,
        user.uuid,
        "safety.medical_card.created",
        {
          resource_type: "safety.medical_cards",
          resource_id: card.id,
          operating_company_id: company.data.operating_company_id,
          driver_id: body.data.driver_id,
        },
        "info",
        "P7-SAF-DRIVER-MED"
      );
      return card;
    });

    if (!created) return reply.code(400).send({ error: "driver_not_in_operating_company" });

    return reply.code(201).send(created);
  });

  app.patch("/api/v1/safety/medical-cards/:id", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const company = companyQuerySchema.safeParse(req.query ?? {});
    if (!company.success) return reply.code(400).send({ error: "validation_error", details: company.error.flatten() });
    const params = cardParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const body = patchMedicalCardSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    const updated = await withCompanyScope(user.uuid, company.data.operating_company_id, async (client) => {
      const existingRes = await client.query(
        `
          SELECT *
          FROM safety.medical_cards
          WHERE id = $1
            AND operating_company_id = $2::uuid
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
            UPDATE safety.medical_cards
            SET voided_at = now(),
                voided_reason = $3,
                updated_at = now()
            WHERE id = $1
              AND operating_company_id = $2::uuid
              AND voided_at IS NULL
            RETURNING *
          `,
          [params.data.id, company.data.operating_company_id, body.data.voided_reason]
        );
        const voided = voidRes.rows[0];
        if (!voided) return null;
        await appendCrudAudit(
          client,
          user.uuid,
          "safety.medical_card.voided",
          {
            resource_type: "safety.medical_cards",
            resource_id: params.data.id,
            operating_company_id: company.data.operating_company_id,
            driver_id: (existing as { driver_id?: string }).driver_id ?? null,
          },
          "info",
          "P7-SAF-DRIVER-MED"
        );
        return voided;
      }

      const patchRes = await client.query(
        `
          UPDATE safety.medical_cards
          SET card_number = COALESCE($3, card_number),
              issued_date = COALESCE($4::date, issued_date),
              expiry_date = COALESCE($5::date, expiry_date),
              notes = COALESCE($6, notes),
              updated_at = now()
          WHERE id = $1
            AND operating_company_id = $2::uuid
            AND voided_at IS NULL
          RETURNING *
        `,
        [
          params.data.id,
          company.data.operating_company_id,
          body.data.card_number ?? null,
          body.data.issued_date ?? null,
          body.data.expiry_date ?? null,
          body.data.notes ?? null,
        ]
      );
      const patched = patchRes.rows[0];
      if (!patched) return null;

      await appendCrudAudit(
        client,
        user.uuid,
        "safety.medical_card.updated",
        {
          resource_type: "safety.medical_cards",
          resource_id: params.data.id,
          operating_company_id: company.data.operating_company_id,
          driver_id: (existing as { driver_id?: string }).driver_id ?? null,
        },
        "info",
        "P7-SAF-DRIVER-MED"
      );
      return patched;
    });

    if (!updated) return reply.code(404).send({ error: "medical_card_not_found" });
    return updated;
  });
}

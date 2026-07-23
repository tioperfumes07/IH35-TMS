import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const incidentTypeSchema = z.enum(["damage_report", "trailer_interchange", "cargo_claim"]);

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const listQuerySchema = companyQuerySchema.extend({
  incident_type: incidentTypeSchema,
  driver_id: z.string().uuid().optional(),
  unit_id: z.string().uuid().optional(),
  // SAF-F17: the trailer profile's reverse safety section. `safety.incidents.trailer_id` FKs to
  // mdata.equipment (trailers live in mdata.equipment, NOT mdata.units — migration
  // 202607031600_safety_incidents_trailer_fk_to_equipment.sql), and trailer interchanges are the
  // incident type that is ABOUT a trailer, so having no trailer filter made them unreachable
  // from the trailer they concern.
  trailer_id: z.string().uuid().optional(),
  // YYYY-MM-DD inclusive bounds on incident_at (date portion).
  date_from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  date_to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
  offset: z.coerce.number().int().min(0).default(0),
});

const idParamsSchema = z.object({
  id: z.string().uuid(),
});

const createBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  incident_type: incidentTypeSchema,
  incident_at: z.string().datetime({ offset: true }).optional(),
  location: z.string().max(500).default(""),
  description: z.string().max(4000).default(""),
  driver_id: z.string().uuid().nullable().optional(),
  unit_id: z.string().uuid().nullable().optional(),
  trailer_id: z.string().uuid().nullable().optional(),
  load_id: z.string().uuid().nullable().optional(),
  interchange_party: z.string().max(200).nullable().optional(),
  damage_amount_cents: z.coerce.number().int().min(0).default(0),
  // SC4 — Carmack/49 CFR 1005.2 cargo-claim fields (cargo_claim rows only; enforced below).
  claim_reason_code: z.string().trim().max(80).nullable().optional(),
  claimant_customer_id: z.string().uuid().nullable().optional(),
  claim_filed_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
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
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [operatingCompanyId]);
    return fn(client);
  });
}

function isSafetyMutationAllowed(role: string) {
  return ["Owner", "Administrator", "Manager", "Safety"].includes(role);
}

export async function registerSafetyIncidentsRoutes(app: FastifyInstance) {
  app.get("/api/v1/safety/incidents", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = listQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const rows = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const params: unknown[] = [query.data.operating_company_id, query.data.incident_type];
      const filters: string[] = ["i.operating_company_id = $1", "i.incident_type = $2"];

      if (query.data.driver_id) {
        params.push(query.data.driver_id);
        filters.push(`i.driver_id = $${params.length}`);
      }
      if (query.data.unit_id) {
        params.push(query.data.unit_id);
        filters.push(`i.unit_id = $${params.length}`);
      }
      if (query.data.trailer_id) {
        params.push(query.data.trailer_id);
        filters.push(`i.trailer_id = $${params.length}`);
      }
      if (query.data.date_from) {
        params.push(query.data.date_from);
        filters.push(`(i.incident_at AT TIME ZONE 'UTC')::date >= $${params.length}::date`);
      }
      if (query.data.date_to) {
        params.push(query.data.date_to);
        filters.push(`(i.incident_at AT TIME ZONE 'UTC')::date <= $${params.length}::date`);
      }

      params.push(query.data.limit, query.data.offset);
      const limitIdx = params.length - 1;
      const offsetIdx = params.length;

      const res = await client.query(
        `
          SELECT i.*, u.unit_number
          FROM safety.incidents i
          LEFT JOIN mdata.units u ON u.id = i.unit_id AND (u.owner_company_id = $1 OR u.currently_leased_to_company_id = $1)
          WHERE ${filters.join("\n            AND ")}
          ORDER BY i.incident_at DESC
          LIMIT $${limitIdx} OFFSET $${offsetIdx}
        `,
        params
      );
      return res.rows;
    });

    return { incidents: rows };
  });

  app.get("/api/v1/safety/incidents/:id", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const row = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT *
          FROM safety.incidents
          WHERE id = $1
            AND operating_company_id = $2
          LIMIT 1
        `,
        [params.data.id, query.data.operating_company_id]
      );
      return res.rows[0] ?? null;
    });

    if (!row) return reply.code(404).send({ error: "incident_not_found" });
    return { incident: row };
  });

  app.post("/api/v1/safety/incidents", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isSafetyMutationAllowed(user.role)) return reply.code(403).send({ error: "forbidden" });
    const body = createBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    // SC4 — cargo-claim fields belong ONLY to cargo_claim rows. Reject non-null claim_* on
    // damage_report / trailer_interchange so those clusters stay clean. Trust the incident_type,
    // never the client.
    const claimReasonCode = body.data.claim_reason_code ?? null;
    const claimantCustomerId = body.data.claimant_customer_id ?? null;
    const claimFiledAt = body.data.claim_filed_at ?? null;
    if (
      body.data.incident_type !== "cargo_claim" &&
      (claimReasonCode !== null || claimantCustomerId !== null || claimFiledAt !== null)
    ) {
      return reply.code(400).send({
        error: "validation_error",
        details: "claim_reason_code / claimant_customer_id / claim_filed_at are only valid for incident_type=cargo_claim",
      });
    }

    const trailerId = body.data.trailer_id ?? null;

    const created = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
      // SC-TRAILER-FK: the trailer FK points at mdata.equipment (trailers live there; mdata.units is
      // trucks only). Validate existence with an EXPLICIT entity predicate — RLS on mdata.* is
      // role-scoped, NOT app.operating_company_id-scoped, so an Owner sees every entity's equipment and
      // cannot be relied on for the entity gate. Pin it in the query: a TRK-owned trailer operated by
      // TRANSP is visible via owner_company_id OR currently_leased_to_company_id (so this is NOT an
      // owner==operating compare). A truck uuid (mdata.units only) or a cross-entity trailer is simply
      // not found here → 400 invalid_trailer, never a raw FK-violation 500.
      if (trailerId !== null) {
        const trailerRes = await client.query<{ id: string }>(
          `SELECT id FROM mdata.equipment WHERE id = $1 AND (owner_company_id = $2 OR currently_leased_to_company_id = $2) LIMIT 1`,
          [trailerId, body.data.operating_company_id]
        );
        if (trailerRes.rows.length === 0) {
          return { error: "invalid_trailer" as const };
        }
      }
      // Entity-independence hard rule: the claimant must belong to the SAME operating company as the
      // incident row. Never rely on the FK for tenant isolation — pin the entity predicate
      // (operating_company_id) IN the query, so a cross-entity customer is simply not found → mismatch.
      if (claimantCustomerId !== null) {
        const custRes = await client.query<{ id: string }>(
          `SELECT id FROM mdata.customers WHERE id = $1 AND operating_company_id = $2 LIMIT 1`,
          [claimantCustomerId, body.data.operating_company_id]
        );
        if (custRes.rows.length === 0) {
          return { error: "claimant_company_mismatch" as const };
        }
      }
      // Validate reason against the SAME source the catalog route reads (catalogs.cargo_claim_reasons),
      // active codes only, scoped to this company.
      if (claimReasonCode !== null) {
        const reasonRes = await client.query(
          `
            SELECT 1
            FROM catalogs.cargo_claim_reasons
            WHERE operating_company_id = $1
              AND reason_code = $2
              AND is_active = true
            LIMIT 1
          `,
          [body.data.operating_company_id, claimReasonCode]
        );
        if (reasonRes.rows.length === 0) {
          return { error: "invalid_claim_reason" as const };
        }
      }

      const res = await client.query(
        `
          INSERT INTO safety.incidents (
            operating_company_id,
            incident_type,
            incident_at,
            location,
            description,
            driver_id,
            unit_id,
            trailer_id,
            load_id,
            interchange_party,
            damage_amount_cents,
            claim_reason_code,
            claimant_customer_id,
            claim_filed_at
          )
          VALUES (
            $1, $2,
            COALESCE($3::timestamptz, now()),
            $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::date
          )
          RETURNING *
        `,
        [
          body.data.operating_company_id,
          body.data.incident_type,
          body.data.incident_at ?? null,
          body.data.location,
          body.data.description,
          body.data.driver_id ?? null,
          body.data.unit_id ?? null,
          body.data.trailer_id ?? null,
          body.data.load_id ?? null,
          body.data.interchange_party ?? null,
          body.data.damage_amount_cents,
          claimReasonCode,
          claimantCustomerId,
          claimFiledAt,
        ]
      );
      const row = res.rows[0];
      if (!row) return { error: "create_failed" as const };
      await appendCrudAudit(
        client,
        user.uuid,
        "safety.incident.created",
        {
          resource_type: "safety.incidents",
          resource_id: row.id,
          incident_type: body.data.incident_type,
          operating_company_id: body.data.operating_company_id,
        },
        "info",
        "A23-7-INCIDENTS-CLUSTER"
      );
      return { row };
    });

    if ("error" in created) {
      if (created.error === "create_failed") return reply.code(500).send({ error: "create_failed" });
      return reply.code(400).send({ error: created.error });
    }
    return reply.code(201).send({ incident: created.row });
  });

  app.post("/api/v1/safety/incidents/:id/photos", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isSafetyMutationAllowed(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "file_required" });

    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const photoKey = `incidents/${params.data.id}/${file.filename ?? "photo"}`;
      const res = await client.query(
        `
          UPDATE safety.incidents
          SET photo_keys = array_append(photo_keys, $3),
              updated_at = now()
          WHERE id = $1
            AND operating_company_id = $2
            AND cardinality(photo_keys) < 10
          RETURNING id, photo_keys
        `,
        [params.data.id, query.data.operating_company_id, photoKey]
      );
      if (!res.rows[0]) return null;
      await appendCrudAudit(
        client,
        user.uuid,
        "safety.incident.photo_added",
        {
          resource_type: "safety.incidents",
          resource_id: params.data.id,
          photo_key: photoKey,
          operating_company_id: query.data.operating_company_id,
        },
        "info",
        "A23-7-INCIDENTS-CLUSTER"
      );
      return {
        incident_id: params.data.id,
        photo_key: photoKey,
        photo_keys: res.rows[0].photo_keys,
      };
    });

    if (!result) return reply.code(404).send({ error: "incident_not_found" });
    return result;
  });
}

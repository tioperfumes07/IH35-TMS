import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { isR2Configured, putObjectBytes } from "../storage/r2-client.js";
import { randomUUID } from "node:crypto";

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
  // SAF-C01 — load-detail reverse: filter in SQL (LIMIT capped — never client-filter past page).
  load_id: z.string().uuid().optional(),
  claimant_customer_id: z.string().uuid().optional(),
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
  // SAF-B19: void-not-delete means the row is PRESERVED, not hidden forever — an auditor must still
  // be able to see what was retracted and why. Default excludes voided rows from the operational
  // list (which is what the void route's own contract promised and nothing implemented); this opts
  // them back in.
  include_voided: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

const idParamsSchema = z.object({
  id: z.string().uuid(),
});

// SAF-F20 void (gated batch item 2): reason-REQUIRED, void-not-delete. The voided_at /
// voided_reason / voided_by_user_id columns ship in migration 202607820000, so this route lands
// WITH that migration — never before it. Deploy order is apply-then-merge.
const voidBodySchema = z.object({
  void_reason: z.string().trim().min(3).max(500),
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
  claim_reason_id: z.string().uuid().nullable().optional(),
  claimant_customer_id: z.string().uuid().nullable().optional(),
  claim_filed_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  // SAF-F34 (gated batch item 3) — the ask-rail. OWNER RULING: ALWAYS ASK. 'ask' means undecided
  // and posts NOTHING; the rail records where damage_amount_cents is meant to go, and each rail
  // carries its own counterparty FK. This is PERSISTENCE AND READ ONLY — no GL, no journal entry,
  // no flag. Columns ship in migration 202607820000, so this lands with it.
  recovery_rail: z
    .enum(["expense", "bill_to_responsible_party", "insurance_receivable", "driver_recovery", "ask"])
    .default("ask"),
  recovery_expense_account_id: z.string().uuid().nullable().optional(),
  responsible_party_vendor_id: z.string().uuid().nullable().optional(),
  responsible_party_customer_id: z.string().uuid().nullable().optional(),
  insurance_claim_id: z.string().uuid().nullable().optional(),
  recovery_driver_id: z.string().uuid().nullable().optional(),
});

// SAF-F20 — damage reports, trailer interchanges and cargo claims were CREATE-ONLY. The cluster
// surface returned early from saveCreate unless `createMode`, every input was `disabled={!createMode}`,
// and the cargo-claim detail was five read-only lines. So an incident could be filed with a wrong
// amount, a wrong unit, or a wrong description and NEVER corrected, and one filed in error stayed
// "open" forever because there was no way to close it. safety.incidents.status has accepted
// open | investigating | closed since migration 0345 and nothing could set it past the default.
//
// Only fields that already exist on the table are patchable. Type is NOT patchable: an incident's
// incident_type decides which surface owns it and which regulatory shape applies (a damage report is
// not a cargo claim), so changing it would silently move a record between modules.
const patchBodySchema = z
  .object({
    incident_at: z.string().datetime({ offset: true }).optional(),
    location: z.string().max(500).optional(),
    description: z.string().max(4000).optional(),
    driver_id: z.string().uuid().nullable().optional(),
    unit_id: z.string().uuid().nullable().optional(),
    trailer_id: z.string().uuid().nullable().optional(),
    load_id: z.string().uuid().nullable().optional(),
    interchange_party: z.string().max(200).nullable().optional(),
    damage_amount_cents: z.coerce.number().int().min(0).optional(),
    claim_reason_code: z.string().trim().max(80).nullable().optional(),
    claim_reason_id: z.string().uuid().nullable().optional(),
    claimant_customer_id: z.string().uuid().nullable().optional(),
    claim_filed_at: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: "no_fields_to_update" });

// Status is its own route, not a patch field: closing an incident is an accountable decision, not a
// field edit, and it is reason-required so the record says WHY it was closed.
const statusBodySchema = z.object({
  status: z.enum(["open", "investigating", "closed"]),
  reason: z.string().trim().min(3).max(500),
});

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

function isSafetyMutationAllowed(role: string) {
  return ["Owner", "Administrator", "Manager", "Safety"].includes(role);
}

export async function registerSafetyIncidentsRoutes(app: FastifyInstance) {
  app.get("/api/v1/safety/incidents", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = listQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const params: unknown[] = [query.data.operating_company_id, query.data.incident_type];
      const filters: string[] = ["i.operating_company_id = $1::uuid", "i.incident_type = $2"];

      if (query.data.driver_id) {
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
          [query.data.driver_id, query.data.operating_company_id]
        );
        if (!parent.rows[0]) return { found: false as const, rows: [] };
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
      if (query.data.load_id) {
        params.push(query.data.load_id);
        filters.push(`i.load_id = $${params.length}`);
      }
      if (query.data.claimant_customer_id) {
        params.push(query.data.claimant_customer_id);
        filters.push(`i.claimant_customer_id = $${params.length}`);
      }
      if (query.data.date_from) {
        params.push(query.data.date_from);
        filters.push(`(i.incident_at AT TIME ZONE 'UTC')::date >= $${params.length}::date`);
      }
      if (query.data.date_to) {
        params.push(query.data.date_to);
        filters.push(`(i.incident_at AT TIME ZONE 'UTC')::date <= $${params.length}::date`);
      }

      // SAF-B19: a voided incident is a retraction. Leaving it in the operational list meant voiding
      // changed nothing an operator could see, which is why the feature read as absent even where
      // the route existed.
      if (!query.data.include_voided) filters.push(`i.voided_at IS NULL`);

      params.push(query.data.limit, query.data.offset);
      const limitIdx = params.length - 1;
      const offsetIdx = params.length;

      // SAF-C06: the cluster list resolved driver/unit to plain text with no EntityLink — operators
      // could read a name but could not drill through to the driver profile, unit profile, load, or
      // trailer. Join the display names server-side (entity-scoped) so the frontend labels links by
      // name, never a truncated uuid.
      const res = await client.query(
        `
          SELECT i.*,
                 NULLIF(TRIM(COALESCE(d.first_name, '') || ' ' || COALESCE(d.last_name, '')), '') AS driver_name,
                 c.customer_name AS claimant_customer_name,
                 u.unit_number AS unit_number,
                 eq.equipment_number AS trailer_number,
                 l.load_number AS load_number,
                 wo.display_id AS work_order_display_id
          FROM safety.incidents i
          LEFT JOIN mdata.drivers d
            ON d.id = i.driver_id
           AND (
             d.operating_company_id = i.operating_company_id
             OR EXISTS (
               SELECT 1 FROM mdata.driver_company_authorizations label_dca
               WHERE label_dca.driver_id = d.id
                 AND label_dca.company_id = i.operating_company_id
                 AND label_dca.is_authorized = true
                 AND label_dca.deactivated_at IS NULL
             )
           )
          LEFT JOIN mdata.customers c
            ON c.id = i.claimant_customer_id
           AND c.operating_company_id = i.operating_company_id
          LEFT JOIN mdata.units u
            ON u.id = i.unit_id
           AND (u.owner_company_id = i.operating_company_id
                OR u.currently_leased_to_company_id = i.operating_company_id)
          LEFT JOIN mdata.equipment eq
            ON eq.id = i.trailer_id
           AND (eq.owner_company_id = i.operating_company_id
                OR eq.currently_leased_to_company_id = i.operating_company_id)
          LEFT JOIN mdata.loads l
            ON l.id = i.load_id
           AND l.operating_company_id = i.operating_company_id
          LEFT JOIN maintenance.work_orders wo
            ON wo.id = i.work_order_id
           AND wo.operating_company_id = i.operating_company_id
          WHERE ${filters.join("\n            AND ")}
          ORDER BY i.incident_at DESC
          LIMIT $${limitIdx} OFFSET $${offsetIdx}
        `,
        params
      );
      return { found: true as const, rows: res.rows };
    });

    if (!result.found) return reply.code(404).send({ error: "mdata_driver_not_found" });
    return { incidents: result.rows };
    },
  );

  app.get("/api/v1/safety/incidents/:id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const row = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT i.*,
                 NULLIF(TRIM(COALESCE(d.first_name, '') || ' ' || COALESCE(d.last_name, '')), '') AS driver_name,
                 c.customer_name AS claimant_customer_name,
                 u.unit_number AS unit_number,
                 eq.equipment_number AS trailer_number,
                 l.load_number AS load_number,
                 wo.display_id AS work_order_display_id
          FROM safety.incidents i
          LEFT JOIN mdata.drivers d
            ON d.id = i.driver_id
           AND (d.operating_company_id = i.operating_company_id OR EXISTS (
             SELECT 1 FROM mdata.driver_company_authorizations incident_detail_dca
             WHERE incident_detail_dca.driver_id = d.id
               AND incident_detail_dca.company_id = i.operating_company_id
               AND incident_detail_dca.is_authorized = true
               AND incident_detail_dca.deactivated_at IS NULL
           ))
          LEFT JOIN mdata.customers c
            ON c.id = i.claimant_customer_id
           AND c.operating_company_id = i.operating_company_id
          LEFT JOIN mdata.units u
            ON u.id = i.unit_id
           AND (u.owner_company_id = i.operating_company_id
                OR u.currently_leased_to_company_id = i.operating_company_id)
          LEFT JOIN mdata.equipment eq
            ON eq.id = i.trailer_id
           AND (eq.owner_company_id = i.operating_company_id
                OR eq.currently_leased_to_company_id = i.operating_company_id)
          LEFT JOIN mdata.loads l
            ON l.id = i.load_id
           AND l.operating_company_id = i.operating_company_id
          LEFT JOIN maintenance.work_orders wo
            ON wo.id = i.work_order_id
           AND wo.operating_company_id = i.operating_company_id
          WHERE i.id = $1
            AND i.operating_company_id = $2::uuid
          LIMIT 1
        `,
        [params.data.id, query.data.operating_company_id]
      );
      return res.rows[0] ?? null;
    });

    if (!row) return reply.code(404).send({ error: "incident_not_found" });
    return { incident: row };
  });

  app.post("/api/v1/safety/incidents", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isSafetyMutationAllowed(user.role)) return reply.code(403).send({ error: "forbidden" });
    const body = createBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    // SC4 — cargo-claim fields belong ONLY to cargo_claim rows. Reject non-null claim_* on
    // damage_report / trailer_interchange so those clusters stay clean. Trust the incident_type,
    // never the client.
    const claimReasonCode = body.data.claim_reason_code ?? null;
    const claimReasonId = body.data.claim_reason_id ?? null;
    const claimantCustomerId = body.data.claimant_customer_id ?? null;
    const claimFiledAt = body.data.claim_filed_at ?? null;
    if (
      body.data.incident_type !== "cargo_claim" &&
      (claimReasonCode !== null || claimReasonId !== null || claimantCustomerId !== null || claimFiledAt !== null)
    ) {
      return reply.code(400).send({
        error: "validation_error",
        details: "claim_reason_code / claimant_customer_id / claim_filed_at are only valid for incident_type=cargo_claim",
      });
    }
    if (body.data.incident_type === "cargo_claim" && claimReasonId === null) {
      return reply.code(400).send({ error: "validation_error", details: "claim_reason_id is required for cargo claims" });
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
          `SELECT id FROM mdata.customers WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`,
          [claimantCustomerId, body.data.operating_company_id]
        );
        if (custRes.rows.length === 0) {
          return { error: "claimant_company_mismatch" as const };
        }
      }
      // Validate reason against the SAME source the catalog route reads (catalogs.cargo_claim_reasons),
      // active codes only, scoped to this company.
      let canonicalReasonCode = claimReasonCode;
      if (claimReasonId !== null) {
        const reasonRes = await client.query<{ reason_code: string }>(
          `
            SELECT reason_code
            FROM catalogs.cargo_claim_reasons
            WHERE operating_company_id = $1::uuid
              AND id = $2
              AND is_active = true
            LIMIT 1
          `,
          [body.data.operating_company_id, claimReasonId]
        );
        if (reasonRes.rows.length === 0) {
          return { error: "invalid_claim_reason" as const };
        }
        canonicalReasonCode = reasonRes.rows[0].reason_code;
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
            claim_reason_id,
            claimant_customer_id,
            claim_filed_at,
            recovery_rail,
            recovery_expense_account_id,
            responsible_party_vendor_id,
            responsible_party_customer_id,
            insurance_claim_id,
            recovery_driver_id
          )
          VALUES (
            $1, $2,
            COALESCE($3::timestamptz, now()),
            $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::date,
            $16, $17, $18, $19, $20, $21
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
          canonicalReasonCode,
          claimReasonId,
          claimantCustomerId,
          claimFiledAt,
          body.data.recovery_rail,
          body.data.recovery_expense_account_id ?? null,
          body.data.responsible_party_vendor_id ?? null,
          body.data.responsible_party_customer_id ?? null,
          body.data.insurance_claim_id ?? null,
          body.data.recovery_driver_id ?? null,
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

  app.post("/api/v1/safety/incidents/:id/photos", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isSafetyMutationAllowed(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    if (!isR2Configured()) return reply.code(503).send({ error: "r2_not_configured" });
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "file_required" });

    const chunks: Buffer[] = [];
    for await (const chunk of file.file) chunks.push(Buffer.from(chunk));
    const buffer = Buffer.concat(chunks);
    const safeFilename = (file.filename ?? "photo").replace(/[^a-zA-Z0-9._-]+/g, "-");

    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const photoKey = `safety/incidents/${query.data.operating_company_id}/${params.data.id}/${randomUUID()}-${safeFilename}`;
      const res = await client.query(
        `
          UPDATE safety.incidents
          SET photo_keys = array_append(photo_keys, $3),
              updated_at = now()
          WHERE id = $1
            AND operating_company_id = $2::uuid
            -- SAF-B19: no new evidence onto a retracted record.
            AND voided_at IS NULL
            AND cardinality(photo_keys) < 10
          RETURNING id, photo_keys
        `,
        [params.data.id, query.data.operating_company_id, photoKey]
      );
      if (!res.rows[0]) return null;
      // If storage rejects the bytes, withCompanyScope rolls the key append back; never expose a
      // photo count or audit record for evidence that does not exist.
      await putObjectBytes(photoKey, buffer, file.mimetype || "application/octet-stream");
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
    return reply.code(201).send(result);
  });

  /**
   * SAF-F20 — edit an incident. Only real columns, never the type.
   *
   * Built as an explicit column allow-list rather than a spread of the parsed body: a dynamic
   * `SET ${Object.keys(body)}` would let any future schema addition reach the UPDATE unreviewed, and
   * on a table carrying damage_amount_cents that is not a risk worth taking for brevity.
   */
  app.patch("/api/v1/safety/incidents/:id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isSafetyMutationAllowed(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const body = patchBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const PATCHABLE = [
      "incident_at",
      "location",
      "description",
      "driver_id",
      "unit_id",
      "trailer_id",
      "load_id",
      "interchange_party",
      "damage_amount_cents",
      "claim_reason_code",
      "claim_reason_id",
      "claimant_customer_id",
      "claim_filed_at",
    ] as const;

    const updated = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const patchData: Record<string, unknown> = { ...body.data };
      if (body.data.claim_reason_id !== undefined) {
        if (body.data.claim_reason_id === null) return null;
        const reasonRes = await client.query<{ reason_code: string }>(
          `SELECT reason_code FROM catalogs.cargo_claim_reasons
           WHERE id = $1 AND operating_company_id = $2::uuid AND is_active = true LIMIT 1`,
          [body.data.claim_reason_id, query.data.operating_company_id]
        );
        if (!reasonRes.rows[0]) return null;
        patchData.claim_reason_code = reasonRes.rows[0].reason_code;
      }
      const sets: string[] = [];
      const values: unknown[] = [params.data.id, query.data.operating_company_id];
      for (const column of PATCHABLE) {
        const value = patchData[column];
        if (value === undefined) continue;
        values.push(value);
        sets.push(`${column} = $${values.length}`);
      }
      if (sets.length === 0) return null;
      const res = await client.query(
        `
          UPDATE safety.incidents
          SET ${sets.join(", ")}, updated_at = now()
          -- SAF-B19: a voided incident is immutable. The void route's contract said so; nothing
          -- enforced it, so a retracted record could still be edited after the fact.
          WHERE id = $1 AND operating_company_id = $2::uuid AND voided_at IS NULL
          RETURNING *
        `,
        values
      );
      const row = res.rows[0];
      if (!row) return null;
      await appendCrudAudit(
        client,
        user.uuid,
        "safety.incident.updated",
        {
          incident_id: row.id,
          incident_type: row.incident_type,
          operating_company_id: query.data.operating_company_id,
          changed_fields: Object.keys(body.data),
        },
        "info",
        "SAF-F20-INCIDENT-LIFECYCLE"
      );
      return row;
    });

    if (!updated) return reply.code(404).send({ error: "incident_not_found" });
    return { incident: updated };
  });

  /**
   * SAF-F20 — status lifecycle (open -> investigating -> closed, and reopen).
   *
   * Reason-required: an incident closed without a recorded reason leaves no answer to "why is this
   * $4,000 damage report closed?" months later, which is exactly the question an insurer or an
   * auditor asks. The reason is appended to the description trail, not stored in a column, because
   * safety.incidents has no reason column and inventing one needs a migration.
   */
  app.post("/api/v1/safety/incidents/:id/status", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isSafetyMutationAllowed(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const body = statusBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const outcome = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const current = await client.query(
        `SELECT id, status, incident_type, voided_at FROM safety.incidents WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`,
        [params.data.id, query.data.operating_company_id]
      );
      const row = current.rows[0];
      if (!row) return { kind: "not_found" as const };
      // SAF-B19: voiding is a retraction, so the lifecycle stops. Re-opening a voided incident would
      // resurrect a record the company formally said should not exist.
      if (row.voided_at) return { kind: "voided" as const };
      if (row.status === body.data.status) return { kind: "unchanged" as const, status: row.status };

      const res = await client.query(
        `
          UPDATE safety.incidents
          SET status = $3,
              description = COALESCE(description || E'\n', '') || $4,
              updated_at = now()
          WHERE id = $1 AND operating_company_id = $2::uuid
            AND voided_at IS NULL
            AND status = $5
          RETURNING *
        `,
        [
          params.data.id,
          query.data.operating_company_id,
          body.data.status,
          `[${body.data.status.toUpperCase()}] ${body.data.reason}`,
          row.status,
        ]
      );
      const updatedRow = res.rows[0];
      if (!updatedRow) return { kind: "conflict_race" as const };
      await appendCrudAudit(
        client,
        user.uuid,
        "safety.incident.status_changed",
        {
          incident_id: updatedRow.id,
          incident_type: updatedRow.incident_type,
          operating_company_id: query.data.operating_company_id,
          previous_status: row.status,
          new_status: body.data.status,
          reason: body.data.reason,
        },
        body.data.status === "closed" ? "warning" : "info",
        "SAF-F20-INCIDENT-LIFECYCLE"
      );
      return { kind: "ok" as const, row: updatedRow };
    });

    if (outcome.kind === "not_found") return reply.code(404).send({ error: "incident_not_found" });
    if (outcome.kind === "voided") {
      return reply
        .code(409)
        .send({ error: "incident_voided", message: "This incident was voided and its lifecycle is closed." });
    }
    if (outcome.kind === "conflict_race") {
      return reply.code(409).send({
        error: "incident_state_changed",
        message: "This incident was voided or changed status while you were editing it. Reload and retry.",
      });
    }
    if (outcome.kind === "unchanged") {
      return reply.code(409).send({ error: "incident_status_unchanged", message: `This incident is already ${outcome.status}.` });
    }
    return { incident: outcome.row };
  });

  /**
   * SAF-F20 — void an incident (void-not-delete). Owner/Administrator only.
   *
   * A voided incident is immutable and drops out of the operational list. It is never DELETEd: the
   * record of what was filed, and why it was retracted, is exactly what an insurer or an auditor
   * asks for. "closed" is a lifecycle outcome; "voided" is a retraction — collapsing the two would
   * lose the distinction, which is why safety.incidents gets its own void columns rather than an
   * extra status value.
   */
  app.post("/api/v1/safety/incidents/:id/void", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!["Owner", "Administrator"].includes(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const body = voidBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const voided = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          UPDATE safety.incidents
          SET voided_at = now(), voided_reason = $3, voided_by_user_id = $4, updated_at = now()
          WHERE id = $1 AND operating_company_id = $2::uuid AND voided_at IS NULL
          RETURNING *
        `,
        [params.data.id, query.data.operating_company_id, body.data.void_reason, user.uuid]
      );
      const row = res.rows[0];
      if (!row) return null;
      await appendCrudAudit(
        client,
        user.uuid,
        "safety.incident.voided",
        {
          incident_id: row.id,
          incident_type: row.incident_type,
          operating_company_id: query.data.operating_company_id,
          void_reason: body.data.void_reason,
        },
        "warning",
        "SAF-F20-INCIDENT-VOID"
      );
      return row;
    });

    if (!voided) return reply.code(404).send({ error: "incident_not_found" });
    return { incident: voided };
  });
}

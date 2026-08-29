import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { withCurrentUser } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";
import { assertCompanyMembership } from "../../_helpers/company-membership-guard.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  driver_id: z.string().uuid().optional(),
  load_id: z.string().uuid().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  source: z.enum(["samsara_auto", "manual_office", "dot_citation"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const createHosViolationSchema = z.object({
  driver_id: z.string().uuid(),
  // Prod columns (Neon br-fancy-credit): violation_type, occurred_at, duration_minutes, source, notes, created_by.
  // Do NOT invent unit_id / violation_code / duty_status / severity — those are not on prod.
  violation_type: z.string().trim().min(1).max(200),
  // LST-LINK-02: the real reference. violation_type stays as the FMCSA code string; this is the join
  // key, so catalogs.dot_violation_types stops being an FK island.
  dot_violation_type_id: z.string().uuid(),
  occurred_at: z.string().datetime({ offset: true }),
  duration_minutes: z.number().int().nonnegative().optional().nullable(),
  source: z.enum(["samsara_auto", "manual_office", "dot_citation"]).default("manual_office"),
  notes: z.string().trim().max(20_000).optional().nullable(),
  related_load_id: z.string().uuid().optional().nullable(),
  related_dot_inspection_id: z.string().uuid().optional().nullable(),
  csa_points: z.number().int().nonnegative().optional().nullable(),
});

const idParamsSchema = z.object({
  id: z.string().uuid(),
});

/** Required user-supplied void reason — never a hardcoded endpoint literal. */
const voidHosViolationSchema = z.object({
  reason: z.string().trim().min(3, "a reason is required").max(500),
});

function currentUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return reply;
  return req.user;
}

function validationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function canMutate(role: string) {
  return ["Owner", "Administrator", "Manager", "Safety"].includes(role);
}

async function withCompany<T>(userId: string, role: string, companyId: string, fn: (client: any) => Promise<T>) {
  await assertCompanyMembership(userId, companyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    await client.query(`SELECT set_config('app.user_role', $1::text, true)`, [role]);
    return fn(client);
  });
}

export async function registerSafetyHosViolationsRoutes(app: FastifyInstance) {
  app.get("/api/v1/safety/hos-violations", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const result = await withCompany(user.uuid, user.role, query.data.operating_company_id, async (client) => {
      const values: unknown[] = [query.data.operating_company_id];
      const filters: string[] = ["operating_company_id = $1::uuid", "voided_at IS NULL"];
      if (query.data.driver_id) {
        values.push(query.data.driver_id);
        filters.push(`driver_id = $${values.length}`);
      }
      if (query.data.load_id) {
        values.push(query.data.load_id);
        filters.push(`related_load_id = $${values.length}`);
      }
      if (query.data.from) {
        values.push(query.data.from);
        filters.push(`occurred_at >= $${values.length}::timestamptz`);
      }
      if (query.data.to) {
        values.push(query.data.to);
        filters.push(`occurred_at <= $${values.length}::timestamptz`);
      }
      if (query.data.source) {
        values.push(query.data.source);
        filters.push(`source = $${values.length}`);
      }
      const countRes = await client.query(
        `SELECT COUNT(*)::int AS total_count
         FROM safety.hos_violations hv
         WHERE ${filters.map((filter) => `hv.${filter}`).join(" AND ")}`,
        values,
      );
      const totalCount = Number(countRes.rows[0]?.total_count ?? 0);
      values.push(query.data.limit);
      const limitParam = values.length;
      values.push(query.data.offset);
      const offsetParam = values.length;
      // CLS-UUID-LABEL: no driver join — HOSViolationsTab's EntityLink reads row.driver_name
      // (undefined here), so it fell back to rendering the raw driver_id uuid. Mirrors the
      // driver-join pattern already used on accidents/dot_inspections/internal_fines/training.
      const res = await client.query(
        `
          SELECT hv.*,
                 NULLIF(TRIM(COALESCE(d.first_name, '') || ' ' || COALESCE(d.last_name, '')), '') AS driver_name,
                 l.load_number AS related_load_number
          FROM safety.hos_violations hv
          LEFT JOIN mdata.drivers d
            ON d.id = hv.driver_id
           AND (d.operating_company_id = hv.operating_company_id OR EXISTS (
             SELECT 1 FROM mdata.driver_company_authorizations hos_violations_list_dca
             WHERE hos_violations_list_dca.driver_id = d.id
               AND hos_violations_list_dca.company_id = hv.operating_company_id
               AND hos_violations_list_dca.is_authorized = true
               AND hos_violations_list_dca.deactivated_at IS NULL
           ))
          LEFT JOIN mdata.loads l
            ON l.id = hv.related_load_id
           AND l.operating_company_id = hv.operating_company_id
          WHERE ${filters.map((f) => `hv.${f}`).join(" AND ")}
          ORDER BY hv.occurred_at DESC, hv.created_at DESC
          LIMIT $${limitParam} OFFSET $${offsetParam}
        `,
        values
      );
      return { rows: res.rows, total_count: totalCount };
    });

    return { hos_violations: result.rows, total_count: result.total_count };
  });

  app.get("/api/v1/safety/hos-violations/:id", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const row = await withCompany(user.uuid, user.role, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT *
          FROM safety.hos_violations
          WHERE id = $1
            AND operating_company_id = $2::uuid
          LIMIT 1
        `,
        [params.data.id, query.data.operating_company_id]
      );
      return res.rows[0] ?? null;
    });
    if (!row) return reply.code(404).send({ error: "hos_violation_not_found" });
    return row;
  });

  app.post("/api/v1/safety/hos-violations", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });

    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = createHosViolationSchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const created = await withCompany(user.uuid, user.role, query.data.operating_company_id, async (client) => {
      const linked = await client.query(
        `SELECT
           EXISTS (
             SELECT 1 FROM mdata.drivers d
             WHERE d.id = $2::uuid
               AND (d.operating_company_id = $1::uuid OR EXISTS (
                 SELECT 1 FROM mdata.driver_company_authorizations hos_create_driver_dca
                 WHERE hos_create_driver_dca.driver_id = d.id
                   AND hos_create_driver_dca.company_id = $1::uuid
                   AND hos_create_driver_dca.is_authorized = true
                   AND hos_create_driver_dca.deactivated_at IS NULL
               ))
               AND d.status = 'Active' AND d.deactivated_at IS NULL AND d.archived_at IS NULL
           ) AS driver_ok,
           EXISTS (
             SELECT 1 FROM catalogs.dot_violation_types vt
             WHERE vt.id = $3::uuid AND vt.operating_company_id = $1::uuid
               AND vt.is_active = true AND vt.basic_category = 'hours_of_service'
               AND vt.violation_code = $4
           ) AS violation_type_ok,
           ($5::uuid IS NULL OR EXISTS (
             SELECT 1 FROM mdata.loads l
             WHERE l.id = $5::uuid AND l.operating_company_id = $1::uuid
           )) AS load_ok,
           ($6::uuid IS NULL OR EXISTS (
             SELECT 1 FROM safety.dot_inspections di
             WHERE di.id = $6::uuid AND di.operating_company_id = $1::uuid
           )) AS dot_inspection_ok`,
        [
          query.data.operating_company_id,
          body.data.driver_id,
          body.data.dot_violation_type_id ?? null,
          body.data.violation_type,
          body.data.related_load_id ?? null,
          body.data.related_dot_inspection_id ?? null,
        ]
      );
      const validity = linked.rows[0];
      if (!validity?.driver_ok || !validity?.violation_type_ok || !validity?.load_ok || !validity?.dot_inspection_ok) return null;
      const res = await client.query(
        `
          INSERT INTO safety.hos_violations (
            operating_company_id,
            driver_id,
            violation_type,
            dot_violation_type_id,
            occurred_at,
            duration_minutes,
            source,
            related_load_id,
            related_dot_inspection_id,
            notes,
            csa_points,
            created_by
          )
          VALUES (
            $1,$2,$3,$4,$5::timestamptz,$6,$7,$8,$9,$10,COALESCE($11, 0),$12
          )
          RETURNING *
        `,
        [
          query.data.operating_company_id,
          body.data.driver_id,
          body.data.violation_type,
          body.data.dot_violation_type_id ?? null,
          body.data.occurred_at,
          body.data.duration_minutes ?? null,
          body.data.source,
          body.data.related_load_id ?? null,
          body.data.related_dot_inspection_id ?? null,
          body.data.notes ?? null,
          body.data.csa_points ?? null,
          user.uuid,
        ]
      );
      const row = res.rows[0];
      await appendCrudAudit(
        client,
        user.uuid,
        "safety.hos_violation.created",
        {
          hos_violation_id: row.id,
          operating_company_id: query.data.operating_company_id,
          violation_type: row.violation_type,
          source: row.source,
        },
        "info",
        "P3-T11.17.2-SAFETY-V6.4"
      );
      return row;
    });

    if (!created) {
      return reply.code(400).send({
        error: "linked_entity_not_in_operating_company",
        message: "Select an active driver and HOS violation type from the current operating company.",
      });
    }

    return reply.code(201).send({ hos_violation: created });
  });

  app.post("/api/v1/safety/hos-violations/:id/void", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = voidHosViolationSchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const payload = await withCompany(user.uuid, user.role, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          UPDATE safety.hos_violations
          SET voided_at = now(), voided_by = $2, void_reason = $4
          WHERE id = $1
            AND operating_company_id = $3::uuid
            AND voided_at IS NULL
          RETURNING *
        `,
        [params.data.id, user.uuid, query.data.operating_company_id, body.data.reason]
      );
      const row = res.rows[0];
      if (!row) return null;
      await appendCrudAudit(
        client,
        user.uuid,
        "safety.hos_violation.voided",
        {
          hos_violation_id: row.id,
          operating_company_id: query.data.operating_company_id,
          void_reason: body.data.reason,
        },
        "info",
        "P3-T11.17.2-SAFETY-V6.4"
      );
      return row;
    });

    if (!payload) return reply.code(404).send({ error: "hos_violation_not_found" });
    return { hos_violation: payload };
  });
}

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { submitDvirBodySchema, submitDriverDvir } from "./dvir-submit.service.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const listQuerySchema = companyQuerySchema.extend({
  driver_id: z.string().uuid().optional(),
  unit_id: z.string().uuid().optional(),
  // SAF-F17: the trailer profile's reverse safety section. The column already existed on
  // safety.dvir_submissions; only the filter was missing, so a trailer's DVIRs were unreachable.
  trailer_id: z.string().uuid().optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  search: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

const idParamsSchema = z.object({
  id: z.string().uuid(),
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
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [operatingCompanyId]);
    return fn(client);
  });
}

export async function registerSafetyDvirRoutes(app: FastifyInstance) {
  app.get("/api/v1/safety/dvir", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = listQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
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
        if (!parent.rows[0]) return { found: false as const, rows: [], total_count: 0 };
      }
      const filters: string[] = ["ds.operating_company_id = $1::uuid"];
      const values: unknown[] = [query.data.operating_company_id];
      let idx = 2;
      if (query.data.driver_id) {
        filters.push(`ds.driver_id = $${idx++}`);
        values.push(query.data.driver_id);
      }
      if (query.data.unit_id) {
        filters.push(`ds.unit_id = $${idx++}`);
        values.push(query.data.unit_id);
      }
      if (query.data.trailer_id) {
        filters.push(`ds.trailer_id = $${idx++}`);
        values.push(query.data.trailer_id);
      }
      if (query.data.from) {
        filters.push(`ds.submitted_at >= $${idx++}`);
        values.push(query.data.from);
      }
      if (query.data.to) {
        filters.push(`ds.submitted_at <= $${idx++}`);
        values.push(query.data.to);
      }
      if (query.data.search) {
        filters.push(`(ds.type::text ILIKE $${idx} OR ds.submitted_at::text ILIKE $${idx})`);
        values.push(`%${query.data.search}%`);
        idx += 1;
      }
      const countRes = await client.query<{ total_count: number }>(
        `SELECT COUNT(*)::int AS total_count FROM safety.dvir_submissions ds WHERE ${filters.join(" AND ")}`,
        values
      );
      values.push(query.data.limit, query.data.offset);

      const res = await client.query(
        `
          SELECT
            ds.id,
            ds.submitted_at,
            ds.type,
            ds.has_major_defect,
            ds.has_any_defect,
            ds.follow_up_wo_id,
            wo.display_id AS follow_up_wo_display_id,
            ds.driver_id,
            ds.unit_id,
            ds.load_id,
            ds.corrects_dvir_id,
            corrected.submitted_at AS corrects_submitted_at,
            COALESCE(corrections.correction_count, 0)::int AS correction_count,
            TRIM(CONCAT(d.first_name, ' ', d.last_name)) AS driver_name,
            u.unit_number,
            COALESCE(dc.defect_count, 0)::int AS defect_count,
            CASE
              WHEN ds.has_major_defect THEN 'major'
              WHEN ds.has_any_defect THEN 'minor'
              ELSE 'none'
            END AS defect_severity
          FROM safety.dvir_submissions ds
          -- ENTITY PREDICATES (CLS-JOIN-ENTITY-UNSCOPED): the DVIR ds is scoped; the driver and unit it
          -- names were not. A DVIR is a DOT compliance record — the driver and unit on it are the record.
          -- mdata.units has NO operating_company_id; it uses the owner/leased pair (CLAUDE.md §4).
          LEFT JOIN mdata.drivers d ON d.id = ds.driver_id
                                   AND (
                                     d.operating_company_id = ds.operating_company_id
                                     OR EXISTS (
                                       SELECT 1 FROM mdata.driver_company_authorizations label_dca
                                       WHERE label_dca.driver_id = d.id
                                         AND label_dca.company_id = ds.operating_company_id
                                         AND label_dca.is_authorized = true
                                         AND label_dca.deactivated_at IS NULL
                                     )
                                   )
          LEFT JOIN mdata.units u ON u.id = ds.unit_id
                                 AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = ds.operating_company_id
          LEFT JOIN maintenance.work_orders wo ON wo.id = ds.follow_up_wo_id
                                               AND wo.operating_company_id = ds.operating_company_id
          LEFT JOIN safety.dvir_submissions corrected ON corrected.id = ds.corrects_dvir_id
                                                     AND corrected.operating_company_id = ds.operating_company_id
          LEFT JOIN LATERAL (
            SELECT COUNT(*)::int AS correction_count
              FROM safety.dvir_submissions correction
             WHERE correction.corrects_dvir_id = ds.id
               AND correction.operating_company_id = ds.operating_company_id
          ) corrections ON true
          LEFT JOIN LATERAL (
            SELECT COUNT(*)::int AS defect_count
            FROM safety.dvir_defects dd
            WHERE dd.dvir_submission_id = ds.id
          ) dc ON true
          WHERE ${filters.join(" AND ")}
          ORDER BY ds.submitted_at DESC, ds.id DESC
          LIMIT $${idx++} OFFSET $${idx}
        `,
        values
      );
      return { found: true as const, rows: res.rows, total_count: Number(countRes.rows[0]?.total_count ?? 0) };
    });

    if (!result.found) return reply.code(404).send({ error: "mdata_driver_not_found" });
    return { submissions: result.rows, total_count: result.total_count };
  });

  app.get("/api/v1/safety/dvir/:id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);

    const payload = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const submissionRes = await client.query(
        `
          SELECT ds.*, TRIM(CONCAT(d.first_name, ' ', d.last_name)) AS driver_name, u.unit_number
          FROM safety.dvir_submissions ds
          -- ENTITY PREDICATES (CLS-JOIN-ENTITY-UNSCOPED): the DVIR ds is scoped; the driver and unit it
          -- names were not. A DVIR is a DOT compliance record — the driver and unit on it are the record.
          -- mdata.units has NO operating_company_id; it uses the owner/leased pair (CLAUDE.md §4).
          LEFT JOIN mdata.drivers d ON d.id = ds.driver_id
                                   AND (
                                     d.operating_company_id = ds.operating_company_id
                                     OR EXISTS (
                                       SELECT 1 FROM mdata.driver_company_authorizations safety_dvir_detail_dca
                                       WHERE safety_dvir_detail_dca.driver_id = d.id
                                         AND safety_dvir_detail_dca.company_id = ds.operating_company_id
                                         AND safety_dvir_detail_dca.is_authorized = true
                                         AND safety_dvir_detail_dca.deactivated_at IS NULL
                                     )
                                   )
          LEFT JOIN mdata.units u ON u.id = ds.unit_id
                                 AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = ds.operating_company_id
          WHERE ds.id = $1
            AND ds.operating_company_id = $2::uuid
          LIMIT 1
        `,
        [params.data.id, query.data.operating_company_id]
      );
      const submission = submissionRes.rows[0];
      if (!submission) return null;
      const defectsRes = await client.query(
        `
          SELECT *
          FROM safety.dvir_defects
          WHERE dvir_submission_id = $1
          ORDER BY created_at ASC
        `,
        [params.data.id]
      );
      const correctionsRes = await client.query(
        `
          SELECT correction.id, correction.submitted_at, correction.type,
                 correction.has_major_defect, correction.has_any_defect
            FROM safety.dvir_submissions correction
           WHERE correction.corrects_dvir_id = $1::uuid
             AND correction.operating_company_id = $2::uuid
           ORDER BY correction.submitted_at ASC, correction.id ASC
        `,
        [params.data.id, query.data.operating_company_id]
      );
      const correctedRes = submission.corrects_dvir_id
        ? await client.query(
            `
              SELECT original.id, original.submitted_at, original.type
                FROM safety.dvir_submissions original
               WHERE original.id = $1::uuid
                 AND original.operating_company_id = $2::uuid
               LIMIT 1
            `,
            [submission.corrects_dvir_id, query.data.operating_company_id]
          )
        : { rows: [] };
      return { submission, defects: defectsRes.rows, corrected_submission: correctedRes.rows[0] ?? null, corrections: correctionsRes.rows };
    });

    if (!payload) return reply.code(404).send({ error: "dvir_not_found" });
    return payload;
  });

  app.post("/api/v1/safety/dvir", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const body = submitDvirBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const driverRes = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      return client.query<{ id: string }>(
        `
          SELECT id
          FROM mdata.drivers
          WHERE identity_user_id = $1
            AND operating_company_id = $2::uuid
          LIMIT 1
        `,
        [user.uuid, query.data.operating_company_id]
      );
    });
    const driver = driverRes.rows[0];
    if (!driver) return reply.code(403).send({ error: "driver_profile_required" });

    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) =>
      submitDriverDvir(client, user.uuid, driver, body.data)
    );

    if ("error" in result) {
      if (result.error === "forbidden") return reply.code(403).send({ error: "forbidden" });
      if (result.error === "load_not_found") return reply.code(404).send({ error: "load_not_found" });
      if (result.error === "duplicate_request") {
        return reply.code(409).send({ error: "duplicate_request" });
      }
      return reply.code(400).send({ error: result.error });
    }
    return reply.code(201).send(result);
  });
}

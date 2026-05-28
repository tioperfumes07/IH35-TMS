import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const listQuerySchema = z.object({
  type: z.string().trim().min(1).max(100).optional(),
  entity: z
    .enum(["driver", "customer", "vendor", "unit", "equipment", "load", "settlement", "invoice"])
    .optional(),
  expires_before: z.string().date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(25),
  operating_company_id: z.string().uuid().optional(),
});

const idParamSchema = z.object({
  id: z.string().uuid(),
});

const companyScopeQuerySchema = z.object({
  operating_company_id: z.string().uuid().optional(),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

async function resolveOperatingCompanyId(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<{ id: string }> }> },
  userId: string,
  requested?: string
) {
  if (requested) return requested;
  const res = await client.query(
    `
      SELECT c.id
      FROM identity.users u
      JOIN org.companies c ON c.id = u.default_company_id
      WHERE u.id = $1
        AND c.deactivated_at IS NULL
      UNION
      SELECT c.id
      FROM org.companies c
      WHERE c.id IN (SELECT org.user_accessible_company_ids())
      ORDER BY id
      LIMIT 1
    `,
    [userId]
  );
  return res.rows[0]?.id ?? null;
}

export async function registerDocsFoundationRoutes(app: FastifyInstance) {
  app.get("/api/v1/docs/kpis", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedQuery = companyScopeQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

    const operatingCompanyId = await withCurrentUser(authUser.uuid, async (client) =>
      resolveOperatingCompanyId(client, authUser.uuid, parsedQuery.data.operating_company_id)
    );
    if (!operatingCompanyId) return reply.code(400).send({ error: "operating_company_id_required" });

    const kpis = await withCurrentUser(authUser.uuid, async (client) => {
      const res = await client.query(
        `
          WITH scoped_files AS (
            SELECT f.id, f.category_id, f.upload_completed_at, f.expiration_date, f.created_at
            FROM docs.files f
            WHERE f.operating_company_id = $1
              AND f.deleted_at IS NULL
          )
          SELECT
            COUNT(*)::int AS total_docs,
            COUNT(*) FILTER (
              WHERE expiration_date IS NOT NULL
                AND expiration_date <= (CURRENT_DATE + INTERVAL '30 days')
            )::int AS expiring_30_days,
            COUNT(*) FILTER (
              WHERE category_id IS NULL OR upload_completed_at IS NULL
            )::int AS missing_required,
            COUNT(*) FILTER (
              WHERE created_at >= (NOW() - INTERVAL '7 days')
            )::int AS recent_uploads
          FROM scoped_files
        `,
        [operatingCompanyId]
      );
      return res.rows[0] ?? {
        total_docs: 0,
        expiring_30_days: 0,
        missing_required: 0,
        recent_uploads: 0,
      };
    });

    return {
      total_docs: Number(kpis.total_docs ?? 0),
      expiring_30_days: Number(kpis.expiring_30_days ?? 0),
      missing_required: Number(kpis.missing_required ?? 0),
      recent_uploads: Number(kpis.recent_uploads ?? 0),
    };
  });

  app.get("/api/v1/docs", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedQuery = listQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

    const query = parsedQuery.data;
    const operatingCompanyId = await withCurrentUser(authUser.uuid, async (client) =>
      resolveOperatingCompanyId(client, authUser.uuid, query.operating_company_id)
    );
    if (!operatingCompanyId) return reply.code(400).send({ error: "operating_company_id_required" });

    const page = query.page;
    const limit = query.limit;
    const offset = (page - 1) * limit;

    const payload = await withCurrentUser(authUser.uuid, async (client) => {
      const params: unknown[] = [operatingCompanyId];
      const whereClauses = ["f.operating_company_id = $1", "f.deleted_at IS NULL"];

      if (query.type) {
        params.push(query.type);
        const idx = params.length;
        whereClauses.push(`(fc.code ILIKE $${idx} OR fc.label ILIKE $${idx} OR f.mime_type ILIKE $${idx})`);
      }

      if (query.entity) {
        params.push(query.entity);
        const idx = params.length;
        whereClauses.push(
          `EXISTS (
            SELECT 1
            FROM docs.file_links fl
            WHERE fl.file_id = f.id
              AND fl.deleted_at IS NULL
              AND fl.entity_type = $${idx}
          )`
        );
      }

      if (query.expires_before) {
        params.push(query.expires_before);
        const idx = params.length;
        whereClauses.push(`f.expiration_date IS NOT NULL AND f.expiration_date <= $${idx}::date`);
      }

      const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
      const countSql = `SELECT COUNT(*)::int AS total FROM docs.files f LEFT JOIN catalogs.file_categories fc ON fc.id = f.category_id ${whereSql}`;
      const countRes = await client.query(countSql, params);
      const total = Number(countRes.rows[0]?.total ?? 0);

      params.push(limit);
      params.push(offset);
      const limitIdx = params.length - 1;
      const offsetIdx = params.length;

      const rowsRes = await client.query(
        `
          SELECT
            f.id,
            f.original_filename,
            f.mime_type,
            f.size_bytes,
            f.category_id,
            fc.code AS type,
            fc.label AS type_label,
            f.expiration_date,
            f.upload_completed_at,
            f.created_at,
            COALESCE((
              SELECT json_agg(
                json_build_object(
                  'entity_type', fl.entity_type,
                  'entity_id', fl.entity_id
                )
                ORDER BY fl.created_at DESC
              )
              FROM docs.file_links fl
              WHERE fl.file_id = f.id
                AND fl.deleted_at IS NULL
            ), '[]'::json) AS links
          FROM docs.files f
          LEFT JOIN catalogs.file_categories fc ON fc.id = f.category_id
          ${whereSql}
          ORDER BY f.created_at DESC
          LIMIT $${limitIdx}
          OFFSET $${offsetIdx}
        `,
        params
      );

      return {
        total,
        page,
        limit,
        rows: rowsRes.rows,
      };
    });

    return payload;
  });

  app.get("/api/v1/docs/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedQuery = companyScopeQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

    const operatingCompanyId = await withCurrentUser(authUser.uuid, async (client) =>
      resolveOperatingCompanyId(client, authUser.uuid, parsedQuery.data.operating_company_id)
    );
    if (!operatingCompanyId) return reply.code(400).send({ error: "operating_company_id_required" });

    const doc = await withCurrentUser(authUser.uuid, async (client) => {
      const res = await client.query(
        `
          SELECT
            f.*,
            fc.code AS type,
            fc.label AS type_label,
            COALESCE((
              SELECT json_agg(
                json_build_object(
                  'entity_type', fl.entity_type,
                  'entity_id', fl.entity_id,
                  'created_at', fl.created_at
                )
                ORDER BY fl.created_at DESC
              )
              FROM docs.file_links fl
              WHERE fl.file_id = f.id
                AND fl.deleted_at IS NULL
            ), '[]'::json) AS links
          FROM docs.files f
          LEFT JOIN catalogs.file_categories fc ON fc.id = f.category_id
          WHERE f.id = $1
            AND f.operating_company_id = $2
            AND f.deleted_at IS NULL
          LIMIT 1
        `,
        [parsedParams.data.id, operatingCompanyId]
      );
      return res.rows[0] ?? null;
    });

    if (!doc) return reply.code(404).send({ error: "docs_not_found" });
    return doc;
  });
}

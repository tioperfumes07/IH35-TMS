import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { resolveOperatingCompanyId } from "../auth/operating-company-scope.js";
import { requireAuth } from "../auth/session-middleware.js";
import { MAX_DOC_UPLOAD_BYTES, isAllowedDocMimeType } from "./upload-constraints.js";
import { hydrateEntityLabels } from "./entity-labels.js";
import {
  generatePresignedDownloadUrl,
  generatePresignedUploadUrl,
  getObjectMetadata,
  getR2BucketName,
  isR2Configured,
  verifyObjectExists,
} from "../storage/r2-client.js";

const SOURCE_TAG = "BT-2-DOCS-SCHEMA-AND-R2";
const DEFAULT_UPLOAD_EXPIRES_SECONDS = 900;
const DEFAULT_DOWNLOAD_EXPIRES_SECONDS = 300;
// DOCS-1: `load` was omitted here (though present in the zod enum + the docs.file_links
// CHECK constraint), so the Load Documents tab could never link/upload a document and
// rendered empty. mdata.loads is a non-financial master-data table; adding it here is safe.
// LV-FILE-LINK-ENTITY-TYPE-3WAY-MISMATCH: `invoice` and `settlement` are also listed in the
// zod enum and the FE FileEntityType union; they map to real tables and must be supported.
const SUPPORTED_LINK_ENTITY_TYPES = [
  "driver",
  "customer",
  "vendor",
  "unit",
  "equipment",
  "load",
  "invoice",
  "settlement",
] as const;

const idParamSchema = z.object({ file_id: z.string().uuid() });
const linkParamSchema = z.object({ file_id: z.string().uuid(), link_id: z.string().uuid() });
const entityTypeSchema = z.enum(["driver", "customer", "vendor", "unit", "equipment", "load", "settlement", "invoice"]);

function optionalQueryString() {
  return z.preprocess((value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    if (!trimmed || trimmed === "undefined" || trimmed === "null") return undefined;
    return trimmed;
  }, z.string().optional());
}

const fileLinkInputSchema = z.object({
  entity_type: entityTypeSchema,
  entity_id: z.string().uuid(),
});

const uploadUrlBodySchema = z.object({
  original_filename: z.string().trim().min(1).max(255),
  // DOCS-2: enforce a MIME allowlist (blocks html/svg/scripts/executables) + a hard size cap.
  mime_type: z.string().trim().min(1).max(200).refine(isAllowedDocMimeType, { message: "unsupported_mime_type" }),
  size_bytes: z.number().int().min(1).max(MAX_DOC_UPLOAD_BYTES),
  sha256_hash: z.string().trim().regex(/^[A-Fa-f0-9]{64}$/).optional(),
  category_id: z.string().uuid().optional(),
  entity_links: z.array(fileLinkInputSchema).max(25).optional(),
  // The ACTIVE company the caller is filing under. Without it, resolveOperatingCompanyId falls back to the
  // lowest-UUID accessible company — which for a multi-company user is NOT the one they're looking at, so a
  // later read that filters by the active company (e.g. rate-con extract) 404s "file_not_found". When
  // supplied it is used ONLY after verifying the user can access it.
  operating_company_id: z.string().uuid().optional(),
});

const listQuerySchema = z.object({
  operating_company_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  entity_type: z.preprocess(
    (value) => {
      if (typeof value !== "string") return value;
      const trimmed = value.trim();
      if (!trimmed || trimmed === "undefined" || trimmed === "null") return undefined;
      return trimmed;
    },
    entityTypeSchema.optional()
  ),
  entity_id: optionalQueryString().pipe(z.string().uuid().optional()),
  category: optionalQueryString().pipe(z.string().uuid().optional()),
  include_deleted: z.coerce.boolean().optional(),
  include_incomplete: z.coerce.boolean().optional(),
});

const updateFileBodySchema = z
  .object({
    category_id: z.string().uuid().nullable().optional(),
    document_date: z.string().date().nullable().optional(),
    expiration_date: z.string().date().nullable().optional(),
    description: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "at least one field is required" });

const deleteFileBodySchema = z.object({
  delete_reason: z.string().trim().min(10).max(2000),
});

const createVersionBodySchema = z.object({
  original_filename: z.string().trim().min(1).max(255),
  // DOCS-2: same allowlist + size cap on the new-version upload path.
  mime_type: z.string().trim().min(1).max(200).refine(isAllowedDocMimeType, { message: "unsupported_mime_type" }),
  size_bytes: z.number().int().min(1).max(MAX_DOC_UPLOAD_BYTES),
  sha256_hash: z.string().trim().regex(/^[A-Fa-f0-9]{64}$/).optional(),
});

type AuthUser = { uuid: string; role: string; email: string | null };

function currentAuthUser(req: FastifyRequest, reply: FastifyReply): AuthUser | null {
  if (!requireAuth(req, reply)) return null;
  return req.user as AuthUser;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function requireRole(reply: FastifyReply, role: string, allowed: string[]) {
  if (!allowed.includes(role)) {
    reply.code(403).send({ error: "forbidden" });
    return false;
  }
  return true;
}

function sanitizeFilename(filename: string) {
  return filename
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 180);
}

function toUtcIsoFromNow(seconds: number) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function requestUserAgent(req: FastifyRequest) {
  const userAgent = req.headers["user-agent"];
  if (Array.isArray(userAgent)) return userAgent[0] ?? null;
  return userAgent ?? null;
}

async function ensureCategoryExists(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<{ id: string }> }> },
  categoryId: string
) {
  const res = await client.query(
    `SELECT id FROM catalogs.file_categories WHERE id = $1 AND deactivated_at IS NULL AND is_active = true LIMIT 1`,
    [categoryId]
  );
  return Boolean(res.rows[0]?.id);
}

// DOCS-F6072: every one of these tables is company-scoped (operating_company_id NOT NULL),
// but this existence check used to look the entity_id up with no company predicate at all —
// any accessible-company user could link a file to a driver/customer/vendor/unit/equipment/
// load/invoice/settlement that belongs to a DIFFERENT company, as long as they knew its UUID.
// Every entity_type branch below must filter on the resolved operating_company_id.
async function ensureLinkEntityExists(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<{ id: string }> }> },
  entityType: z.infer<typeof entityTypeSchema>,
  entityId: string,
  operatingCompanyId: string
) {
  if (entityType === "driver") {
    const res = await client.query("SELECT id FROM mdata.drivers WHERE id = $1 AND operating_company_id = $2 LIMIT 1", [entityId, operatingCompanyId]);
    return res.rows.length > 0;
  }
  if (entityType === "customer") {
    const res = await client.query("SELECT id FROM mdata.customers WHERE id = $1 AND operating_company_id = $2 LIMIT 1", [entityId, operatingCompanyId]);
    return res.rows.length > 0;
  }
  if (entityType === "vendor") {
    const res = await client.query("SELECT id FROM mdata.vendors WHERE id = $1 AND operating_company_id = $2 LIMIT 1", [entityId, operatingCompanyId]);
    return res.rows.length > 0;
  }
  if (entityType === "unit") {
    const res = await client.query(
      "SELECT id FROM mdata.units WHERE id = $1 AND (owner_company_id = $2::uuid OR currently_leased_to_company_id = $2::uuid) LIMIT 1",
      [entityId, operatingCompanyId]
    );
    return res.rows.length > 0;
  }
  if (entityType === "equipment") {
    const res = await client.query(
      "SELECT id FROM mdata.equipment WHERE id = $1 AND (owner_company_id = $2::uuid OR currently_leased_to_company_id = $2::uuid) LIMIT 1",
      [entityId, operatingCompanyId]
    );
    return res.rows.length > 0;
  }
  if (entityType === "load") {
    // §4: loads live in mdata.loads with soft-delete via soft_deleted_at.
    const res = await client.query("SELECT id FROM mdata.loads WHERE id = $1 AND operating_company_id = $2 AND soft_deleted_at IS NULL LIMIT 1", [entityId, operatingCompanyId]);
    return res.rows.length > 0;
  }
  if (entityType === "invoice") {
    const res = await client.query(
      "SELECT id FROM accounting.invoices WHERE id = $1 AND operating_company_id = $2 AND voided_at IS NULL LIMIT 1",
      [entityId, operatingCompanyId]
    );
    return res.rows.length > 0;
  }
  if (entityType === "settlement") {
    const res = await client.query(
      "SELECT id FROM driver_finance.driver_settlements WHERE id = $1 AND operating_company_id = $2 LIMIT 1",
      [entityId, operatingCompanyId]
    );
    return res.rows.length > 0;
  }
  return false;
}

export async function registerDocsFilesRoutes(app: FastifyInstance) {
  app.post("/api/v1/docs/files/upload-url", {
    config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
    handler: async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const parsedBody = uploadUrlBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    if (!isR2Configured()) return reply.code(503).send({ error: "r2_not_configured" });

    const body = parsedBody.data;
    try {
      const result = await withCurrentUser(user.uuid, async (client) => {
        // Prefer the caller-supplied active company (so the file is filed where later reads will look for
        // it), but ONLY if the user can actually access it; otherwise fall back to the resolved default.
        let operatingCompanyId: string | null;
        if (body.operating_company_id) {
          const access = await client.query(
            `SELECT 1 AS ok WHERE $1::uuid IN (SELECT org.user_accessible_company_ids())`,
            [body.operating_company_id],
          );
          if (!access.rows[0]) throw new Error("operating_company_id_forbidden");
          operatingCompanyId = body.operating_company_id;
        } else {
          operatingCompanyId = await resolveOperatingCompanyId(client, user.uuid);
        }
        if (!operatingCompanyId) throw new Error("operating_company_id_required");

        if (body.category_id) {
          const exists = await ensureCategoryExists(client, body.category_id);
          if (!exists) throw new Error("invalid_category_id");
        }

        // LV-FILE-LINK-ENTITY-TYPE-3WAY-MISMATCH: validate links BEFORE inserting the file row so a
        // bad link rolls back only the request, not an otherwise valid upload.
        if (body.entity_links && body.entity_links.length > 0) {
          for (const link of body.entity_links) {
            if (!SUPPORTED_LINK_ENTITY_TYPES.includes(link.entity_type as (typeof SUPPORTED_LINK_ENTITY_TYPES)[number])) {
              throw new Error("entity_type_not_supported_yet");
            }
            const exists = await ensureLinkEntityExists(client, link.entity_type, link.entity_id, operatingCompanyId);
            if (!exists) throw new Error(`entity_not_found:${link.entity_type}`);
          }
        }

        const fileRes = await client.query(
          `
            INSERT INTO docs.files (
              operating_company_id,
              original_filename,
              mime_type,
              size_bytes,
              sha256_hash,
              r2_bucket,
              r2_key,
              category_id,
              uploader_user_id,
              upload_ip_address,
              upload_user_agent
            )
            VALUES (
              $1,
              $2,
              $3,
              $4,
              $5,
              $6,
              '',
              $7,
              $8,
              $9::inet,
              $10
            )
            RETURNING id
          `,
          [
            operatingCompanyId,
            body.original_filename,
            body.mime_type,
            body.size_bytes,
            body.sha256_hash ?? null,
            getR2BucketName(),
            body.category_id ?? null,
            user.uuid,
            req.ip ?? null,
            requestUserAgent(req),
          ]
        );
        const fileId = String(fileRes.rows[0].id);
        const safeName = sanitizeFilename(body.original_filename) || "file";
        const r2Key = `org/${operatingCompanyId}/files/${fileId}/v1/${safeName}`;

        await client.query(`UPDATE docs.files SET r2_key = $2 WHERE id = $1`, [fileId, r2Key]);

        if (body.entity_links && body.entity_links.length > 0) {
          for (const link of body.entity_links) {
            // Existence/type validated before the file row was inserted; insert only here.
            await client.query(
              `
                INSERT INTO docs.file_links (file_id, entity_type, entity_id, created_by_user_id)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (file_id, entity_type, entity_id) WHERE deleted_at IS NULL DO NOTHING
              `,
              [fileId, link.entity_type, link.entity_id, user.uuid]
            );
          }
        }

        return { file_id: fileId, r2_key: r2Key };
      });

      const signed = await generatePresignedUploadUrl(result.r2_key, body.mime_type, DEFAULT_UPLOAD_EXPIRES_SECONDS);
      return reply.code(201).send({
        file_id: result.file_id,
        presigned_url: signed.url,
        r2_key: result.r2_key,
        expires_at: toUtcIsoFromNow(DEFAULT_UPLOAD_EXPIRES_SECONDS),
      });
    } catch (error) {
      if ((error as Error).message === "operating_company_id_required") return reply.code(400).send({ error: "operating_company_id_required" });
      if ((error as Error).message === "operating_company_id_forbidden") return reply.code(403).send({ error: "operating_company_id_forbidden" });
      if ((error as Error).message === "invalid_category_id") return reply.code(400).send({ error: "invalid_category_id" });
      if ((error as Error).message === "entity_type_not_supported_yet") return reply.code(400).send({ error: "entity_type_not_supported_yet" });
      if ((error as Error).message.startsWith("entity_not_found:")) {
        return reply.code(400).send({ error: "entity_not_found", entity_type: (error as Error).message.split(":")[1] });
      }
      if ((error as { code?: string }).code === "23505") return reply.code(409).send({ error: "file_link_conflict" });
      if ((error as Error).message.startsWith("r2_not_configured")) return reply.code(503).send({ error: "r2_not_configured" });
      throw error;
    }
  },
  });

  app.post("/api/v1/docs/files/:file_id/upload-complete", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    if (!isR2Configured()) return reply.code(503).send({ error: "r2_not_configured" });

    const completed = await withCurrentUser(user.uuid, async (client) => {
      const fileRes = await client.query(
        `
          SELECT id, original_filename, size_bytes, category_id, uploader_user_id, r2_key, upload_completed_at, parent_file_id
          FROM docs.files
          WHERE id = $1
          LIMIT 1
        `,
        [parsedParams.data.file_id]
      );
      const row = fileRes.rows[0] as
        | {
            id: string;
            original_filename: string;
            size_bytes: string;
            category_id: string | null;
            uploader_user_id: string;
            r2_key: string;
            upload_completed_at: string | null;
            parent_file_id: string | null;
          }
        | undefined;
      if (!row) return null;
      if (row.uploader_user_id !== user.uuid) throw new Error("upload_complete_forbidden");
      if (row.upload_completed_at) {
        return { already_completed: true, row };
      }
      const exists = await verifyObjectExists(row.r2_key);
      if (!exists) throw new Error("upload_not_found");

      const metadata = await getObjectMetadata(row.r2_key);
      await client.query(`UPDATE docs.files SET upload_completed_at = now(), updated_at = now() WHERE id = $1`, [row.id]);

      const eventClass = row.parent_file_id ? "docs.files.version_uploaded" : "docs.files.uploaded";
      await appendCrudAudit(
        client,
        user.uuid,
        eventClass,
        {
          resource_id: row.id,
          resource_type: "docs.files",
          file_id: row.id,
          original_filename: row.original_filename,
          size_bytes: Number(row.size_bytes),
          category_id: row.category_id,
          uploader_user_id: user.uuid,
          ip_address: req.ip ?? null,
          user_agent_snapshot: requestUserAgent(req),
          etag: metadata?.etag ?? null,
        },
        "info",
        SOURCE_TAG
      );
      return { already_completed: false, row };
    });

    if (!completed) return reply.code(404).send({ error: "docs_file_not_found" });
    return {
      ok: true,
      file_id: parsedParams.data.file_id,
      already_completed: completed.already_completed,
    };
  });

  app.get("/api/v1/docs/files", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!requireRole(reply, user.role, ["Owner", "Administrator", "Manager"])) return;

    const parsedQuery = listQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);
    const query = parsedQuery.data;

    const operatingCompanyId = await withCurrentUser(user.uuid, async (client) =>
      resolveOperatingCompanyId(client, user.uuid, query.operating_company_id)
    );
    if (!operatingCompanyId) return reply.code(400).send({ error: "operating_company_id_required" });

    const response = await withCurrentUser(user.uuid, async (client) => {
      const filters: string[] = [];
      const values: unknown[] = [operatingCompanyId];
      filters.push("f.operating_company_id = $1::uuid");
      if (query.entity_type) {
        values.push(query.entity_type);
        filters.push(
          `EXISTS (SELECT 1 FROM docs.file_links fl WHERE fl.file_id = f.id AND fl.deleted_at IS NULL AND fl.entity_type = $${values.length})`
        );
      }
      if (query.entity_id) {
        values.push(query.entity_id);
        filters.push(
          `EXISTS (SELECT 1 FROM docs.file_links fl WHERE fl.file_id = f.id AND fl.deleted_at IS NULL AND fl.entity_id = $${values.length})`
        );
      }
      if (query.category) {
        values.push(query.category);
        filters.push(`f.category_id = $${values.length}`);
      }
      if (!query.include_deleted || user.role !== "Owner") {
        filters.push("f.deleted_at IS NULL");
      }
      if (!query.include_incomplete) {
        filters.push("f.upload_completed_at IS NOT NULL");
      } else if (!["Owner", "Administrator"].includes(user.role)) {
        values.push(user.uuid);
        filters.push(`(f.upload_completed_at IS NOT NULL OR f.uploader_user_id = $${values.length})`);
      }
      const whereClause = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
      values.push(query.limit);
      values.push(query.offset);
      const limitIdx = values.length - 1;
      const offsetIdx = values.length;
      const countRes = await client.query(`SELECT count(*)::int AS total FROM docs.files f ${whereClause}`, values.slice(0, values.length - 2));
      const res = await client.query(
        `
          SELECT
            f.*,
            fc.code AS category_code,
            fc.label AS category_label,
            iu.email AS uploader_email,
            COALESCE((
              SELECT json_agg(
                json_build_object(
                  'id', fl.id,
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
          LEFT JOIN identity.users iu ON iu.id = f.uploader_user_id
          ${whereClause}
          ORDER BY f.created_at DESC, f.id DESC
          LIMIT $${limitIdx}
          OFFSET $${offsetIdx}
        `,
        values
      );
      await hydrateEntityLabels(client, operatingCompanyId, res.rows);

      return {
        files: res.rows,
        total: Number(countRes.rows[0]?.total ?? 0),
      };
    });

    return {
      files: response.files,
      total: response.total,
      limit: query.limit,
      offset: query.offset,
    };
  });

  app.get("/api/v1/docs/files/:file_id", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const payload = await withCurrentUser(user.uuid, async (client) => {
      const fileRes = await client.query(
        `
          SELECT *
          FROM docs.files
          WHERE id = $1
            AND operating_company_id IN (SELECT org.user_accessible_company_ids())
          LIMIT 1
        `,
        [parsedParams.data.file_id]
      );
      const file = fileRes.rows[0] ?? null;
      if (!file) return null;

      const linksRes = await client.query(
        `
          SELECT id, entity_type, entity_id, created_at, created_by_user_id, deleted_at, deleted_by_user_id
          FROM docs.file_links
          WHERE file_id = $1
          ORDER BY created_at DESC
        `,
        [parsedParams.data.file_id]
      );

      const versionsRes = await client.query(
        `
          WITH RECURSIVE ancestors AS (
            SELECT id, parent_file_id
            FROM docs.files
            WHERE id = $1
            UNION ALL
            SELECT f.id, f.parent_file_id
            FROM docs.files f
            JOIN ancestors a ON a.parent_file_id = f.id
          ),
          root AS (
            SELECT id AS root_id
            FROM ancestors
            WHERE parent_file_id IS NULL
            ORDER BY id
            LIMIT 1
          ),
          chain AS (
            SELECT f.id, f.parent_file_id, f.version_number, f.original_filename, f.mime_type, f.size_bytes, f.created_at, f.upload_completed_at
            FROM docs.files f
            WHERE f.id = COALESCE((SELECT root_id FROM root), $1::uuid)
            UNION ALL
            SELECT f.id, f.parent_file_id, f.version_number, f.original_filename, f.mime_type, f.size_bytes, f.created_at, f.upload_completed_at
            FROM docs.files f
            JOIN chain c ON f.parent_file_id = c.id
          )
          SELECT *
          FROM chain
          ORDER BY version_number DESC
        `,
        [parsedParams.data.file_id]
      );

      return {
        file,
        links: linksRes.rows,
        versions: versionsRes.rows,
      };
    });

    if (!payload) return reply.code(404).send({ error: "docs_file_not_found" });
    return payload;
  });

  app.get("/api/v1/docs/files/:file_id/download-url", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    if (!isR2Configured()) return reply.code(503).send({ error: "r2_not_configured" });

    const file = await withCurrentUser(user.uuid, async (client) => {
      const res = await client.query(
        `
          SELECT id, original_filename, r2_key, upload_completed_at, deleted_at
          FROM docs.files
          WHERE id = $1
            AND operating_company_id IN (SELECT org.user_accessible_company_ids())
          LIMIT 1
        `,
        [parsedParams.data.file_id]
      );
      return res.rows[0] ?? null;
    });
    if (!file) return reply.code(404).send({ error: "docs_file_not_found" });
    if (!file.upload_completed_at) return reply.code(409).send({ error: "upload_not_completed" });

    const signed = await generatePresignedDownloadUrl(String(file.r2_key), DEFAULT_DOWNLOAD_EXPIRES_SECONDS);
    await withCurrentUser(user.uuid, async (client) => {
      await appendCrudAudit(
        client,
        user.uuid,
        "docs.files.viewed",
        {
          resource_id: file.id,
          resource_type: "docs.files",
          file_id: file.id,
          viewer_user_id: user.uuid,
          ip_address: req.ip ?? null,
        },
        "info",
        SOURCE_TAG
      );
    });
    return {
      presigned_url: signed.url,
      expires_at: toUtcIsoFromNow(DEFAULT_DOWNLOAD_EXPIRES_SECONDS),
      original_filename: file.original_filename,
    };
  });

  app.patch("/api/v1/docs/files/:file_id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!requireRole(reply, user.role, ["Owner", "Administrator", "Manager"])) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = updateFileBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    const body = parsedBody.data;

    const updated = await withCurrentUser(user.uuid, async (client) => {
      const existingRes = await client.query(
        `SELECT id, category_id, document_date, expiration_date, description FROM docs.files WHERE id = $1 AND operating_company_id IN (SELECT org.user_accessible_company_ids()) LIMIT 1`,
        [parsedParams.data.file_id]
      );
      const existing = existingRes.rows[0] ?? null;
      if (!existing) return null;

      if (body.category_id) {
        const exists = await ensureCategoryExists(client, body.category_id);
        if (!exists) throw new Error("invalid_category_id");
      }

      const values: unknown[] = [];
      const setParts: string[] = [];
      const add = (column: string, value: unknown) => {
        values.push(value);
        setParts.push(`${column} = $${values.length}`);
      };
      if ("category_id" in body) add("category_id", body.category_id ?? null);
      if ("document_date" in body) add("document_date", body.document_date ?? null);
      if ("expiration_date" in body) add("expiration_date", body.expiration_date ?? null);
      if ("description" in body) add("description", body.description ?? null);
      add("updated_at", new Date().toISOString());
      values.push(parsedParams.data.file_id);
      const idIdx = values.length;

      const res = await client.query(`UPDATE docs.files SET ${setParts.join(", ")} WHERE id = $${idIdx} RETURNING *`, values);
      const row = res.rows[0] ?? null;
      if (!row) return null;

      await appendCrudAudit(
        client,
        user.uuid,
        "docs.files.categorized",
        {
          resource_id: row.id,
          resource_type: "docs.files",
          file_id: row.id,
          previous_category_id: existing.category_id ?? null,
          new_category_id: row.category_id ?? null,
          metadata_changes: body,
        },
        "info",
        SOURCE_TAG
      );
      return row;
    });

    if (!updated) return reply.code(404).send({ error: "docs_file_not_found" });
    return updated;
  });

  app.post("/api/v1/docs/files/:file_id/links", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!requireRole(reply, user.role, ["Owner", "Administrator", "Manager", "Dispatcher", "Safety", "Accountant"])) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = fileLinkInputSchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

    const body = parsedBody.data;
    if (!SUPPORTED_LINK_ENTITY_TYPES.includes(body.entity_type as (typeof SUPPORTED_LINK_ENTITY_TYPES)[number])) {
      return reply.code(400).send({ error: "entity_type_not_supported_yet" });
    }

    try {
      const linked = await withCurrentUser(user.uuid, async (client) => {
        const fileRes = await client.query(
          `SELECT id, operating_company_id FROM docs.files WHERE id = $1 AND operating_company_id IN (SELECT org.user_accessible_company_ids()) LIMIT 1`,
          [parsedParams.data.file_id]
        );
        if (fileRes.rows.length === 0) return null;
        const entityExists = await ensureLinkEntityExists(client, body.entity_type, body.entity_id, String(fileRes.rows[0].operating_company_id));
        if (!entityExists) throw new Error("entity_not_found");
        const res = await client.query(
          `
            INSERT INTO docs.file_links (file_id, entity_type, entity_id, created_by_user_id)
            VALUES ($1, $2, $3, $4)
            RETURNING *
          `,
          [parsedParams.data.file_id, body.entity_type, body.entity_id, user.uuid]
        );
        const row = res.rows[0];
        await appendCrudAudit(
          client,
          user.uuid,
          "docs.files.linked_to_entity",
          {
            resource_id: parsedParams.data.file_id,
            resource_type: "docs.files",
            file_id: parsedParams.data.file_id,
            link_id: row.id,
            entity_type: row.entity_type,
            entity_id: row.entity_id,
          },
          "info",
          SOURCE_TAG
        );
        return row;
      });
      if (!linked) return reply.code(404).send({ error: "docs_file_not_found" });
      return reply.code(201).send({ link: linked });
    } catch (error) {
      if ((error as Error).message === "entity_not_found") return reply.code(400).send({ error: "entity_not_found" });
      if ((error as { code?: string }).code === "23505") return reply.code(409).send({ error: "file_link_conflict" });
      throw error;
    }
  });

  app.delete("/api/v1/docs/files/:file_id/links/:link_id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!requireRole(reply, user.role, ["Owner", "Administrator", "Manager"])) return;
    const parsedParams = linkParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const unlinked = await withCurrentUser(user.uuid, async (client) => {
      const res = await client.query(
        `
          UPDATE docs.file_links
          SET deleted_at = now(), deleted_by_user_id = $3
          WHERE id = $1
            AND file_id = $2
            AND deleted_at IS NULL
            AND file_id IN (SELECT id FROM docs.files WHERE operating_company_id IN (SELECT org.user_accessible_company_ids()))
          RETURNING *
        `,
        [parsedParams.data.link_id, parsedParams.data.file_id, user.uuid]
      );
      const row = res.rows[0] ?? null;
      if (!row) return null;
      await appendCrudAudit(
        client,
        user.uuid,
        "docs.files.unlinked_from_entity",
        {
          resource_id: parsedParams.data.file_id,
          resource_type: "docs.files",
          file_id: parsedParams.data.file_id,
          link_id: row.id,
          entity_type: row.entity_type,
          entity_id: row.entity_id,
        },
        "warning",
        SOURCE_TAG
      );
      return row;
    });

    if (!unlinked) return reply.code(404).send({ error: "docs_file_link_not_found" });
    return { ok: true, link_id: parsedParams.data.link_id };
  });

  app.delete("/api/v1/docs/files/:file_id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!requireRole(reply, user.role, ["Owner", "Administrator"])) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = deleteFileBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

    const deleted = await withCurrentUser(user.uuid, async (client) => {
      const res = await client.query(
        `
          UPDATE docs.files
          SET deleted_at = now(),
              deleted_by_user_id = $2,
              delete_reason = $3,
              updated_at = now()
          WHERE id = $1
            AND deleted_at IS NULL
            AND operating_company_id IN (SELECT org.user_accessible_company_ids())
          RETURNING id
        `,
        [parsedParams.data.file_id, user.uuid, parsedBody.data.delete_reason]
      );
      const row = res.rows[0] ?? null;
      if (!row) return null;
      await appendCrudAudit(
        client,
        user.uuid,
        "docs.files.soft_deleted",
        {
          resource_id: parsedParams.data.file_id,
          resource_type: "docs.files",
          file_id: parsedParams.data.file_id,
          delete_reason: parsedBody.data.delete_reason,
        },
        "warning",
        SOURCE_TAG
      );
      return row;
    });
    if (!deleted) return reply.code(404).send({ error: "docs_file_not_found" });
    return { ok: true, file_id: parsedParams.data.file_id };
  });

  app.post("/api/v1/docs/files/:file_id/restore", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!requireRole(reply, user.role, ["Owner"])) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

    const restored = await withCurrentUser(user.uuid, async (client) => {
      const res = await client.query(
        `
          UPDATE docs.files
          SET deleted_at = NULL,
              deleted_by_user_id = NULL,
              delete_reason = NULL,
              updated_at = now()
          WHERE id = $1
            AND deleted_at IS NOT NULL
            AND operating_company_id IN (SELECT org.user_accessible_company_ids())
          RETURNING id
        `,
        [parsedParams.data.file_id]
      );
      const row = res.rows[0] ?? null;
      if (!row) return null;
      await appendCrudAudit(
        client,
        user.uuid,
        "docs.files.restored",
        {
          resource_id: parsedParams.data.file_id,
          resource_type: "docs.files",
          file_id: parsedParams.data.file_id,
        },
        "info",
        SOURCE_TAG
      );
      return row;
    });
    if (!restored) return reply.code(404).send({ error: "docs_file_not_found_or_not_deleted" });
    return { ok: true, file_id: parsedParams.data.file_id };
  });

  app.post("/api/v1/docs/files/:file_id/versions", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!requireRole(reply, user.role, ["Owner", "Administrator", "Manager"])) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = createVersionBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);
    if (!isR2Configured()) return reply.code(503).send({ error: "r2_not_configured" });

    const body = parsedBody.data;
    const created = await withCurrentUser(user.uuid, async (client) => {
      const parentRes = await client.query(
        `
          SELECT
            id,
            operating_company_id,
            category_id,
            document_date,
            expiration_date,
            description,
            version_number
          FROM docs.files
          WHERE id = $1
            AND operating_company_id IN (SELECT org.user_accessible_company_ids())
          LIMIT 1
        `,
        [parsedParams.data.file_id]
      );
      const parent = parentRes.rows[0] ?? null;
      if (!parent) return null;

      const insertRes = await client.query(
        `
          INSERT INTO docs.files (
            operating_company_id,
            original_filename,
            mime_type,
            size_bytes,
            sha256_hash,
            r2_bucket,
            r2_key,
            category_id,
            document_date,
            expiration_date,
            description,
            parent_file_id,
            version_number,
            uploader_user_id,
            upload_ip_address,
            upload_user_agent
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            '',
            $7,
            $8,
            $9,
            $10,
            $11,
            $12,
            $13,
            $14::inet,
            $15
          )
          RETURNING id, version_number, operating_company_id
        `,
        [
          parent.operating_company_id,
          body.original_filename,
          body.mime_type,
          body.size_bytes,
          body.sha256_hash ?? null,
          getR2BucketName(),
          parent.category_id ?? null,
          parent.document_date ?? null,
          parent.expiration_date ?? null,
          parent.description ?? null,
          parent.id,
          Number(parent.version_number) + 1,
          user.uuid,
          req.ip ?? null,
          requestUserAgent(req),
        ]
      );
      const row = insertRes.rows[0];
      const safeName = sanitizeFilename(body.original_filename) || "file";
      const r2Key = `org/${row.operating_company_id}/files/${row.id}/v${row.version_number}/${safeName}`;
      await client.query(`UPDATE docs.files SET r2_key = $2 WHERE id = $1`, [row.id, r2Key]);
      return { file_id: String(row.id), version_number: Number(row.version_number), r2_key: r2Key };
    });

    if (!created) return reply.code(404).send({ error: "docs_file_not_found" });
    const signed = await generatePresignedUploadUrl(created.r2_key, body.mime_type, DEFAULT_UPLOAD_EXPIRES_SECONDS);
    return reply.code(201).send({
      file_id: created.file_id,
      version_number: created.version_number,
      presigned_url: signed.url,
      r2_key: created.r2_key,
      expires_at: toUtcIsoFromNow(DEFAULT_UPLOAD_EXPIRES_SECONDS),
    });
  });
}

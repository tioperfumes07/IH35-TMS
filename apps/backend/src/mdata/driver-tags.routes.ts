/**
 * DRIVER-F7334-ROSTER-TAG-HAS-NO-CANONICAL-MODEL (docs/audit/GUARD-WORKORDERS.md, routed=CC-3).
 * Canonical company-scoped driver tags: catalogs.driver_tags (the tag catalog) +
 * mdata.driver_tag_memberships (append-only membership; removal archives, never deletes).
 *
 * relationExists-guarded throughout — safe to deploy ahead of the migration landing on any given
 * environment.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { resolveOperatingCompanyId } from "../auth/operating-company-scope.js";

const TAG_CODE_RE = /^[a-z0-9][a-z0-9_-]{0,47}$/;

const listTagsQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const createTagBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  code: z.string().trim().toLowerCase().regex(TAG_CODE_RE, "code must be lowercase letters/digits/-/_ (max 48 chars)"),
  label: z.string().trim().min(1).max(80),
  color: z.string().trim().max(20).optional().nullable(),
});

const membershipsQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  driver_ids: z.string().transform((value, ctx) => {
    const ids = [...new Set(value.split(",").map((id) => id.trim()).filter(Boolean))];
    if (ids.length === 0 || ids.length > 200 || ids.some((id) => !z.string().uuid().safeParse(id).success)) {
      ctx.addIssue({ code: "custom", message: "driver_ids must contain 1-200 comma-separated UUIDs" });
      return z.NEVER;
    }
    return ids;
  }),
});

const bulkTagBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  driver_ids: z.array(z.string().uuid()).min(1).max(200),
  tag_id: z.string().uuid(),
  action: z.enum(["add", "remove"]),
  removed_reason: z.string().trim().min(1).max(500).optional(),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function validationError(reply: FastifyReply, err: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: err.flatten() });
}

async function relationExists(client: any, relation: string): Promise<boolean> {
  const res = await client.query(`SELECT to_regclass($1) IS NOT NULL AS ok`, [relation]);
  return Boolean(res.rows[0]?.ok);
}

async function withCompany<T>(
  userId: string,
  companyId: string,
  fn: (client: any, scopedCompanyId: string) => Promise<T>
): Promise<T | { noCompany: true }> {
  return withCurrentUser(userId, async (client) => {
    const scopedCompanyId = await resolveOperatingCompanyId(client, userId, companyId);
    // membership-scope-exempt: scopedCompanyId comes from resolveOperatingCompanyId, which validates
    // the requested company against org.user_accessible_company_ids() and throws forbidden_company_membership.
    if (!scopedCompanyId) return { noCompany: true as const };
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [scopedCompanyId]);
    return fn(client, scopedCompanyId);
  });
}

export async function registerDriverTagsRoutes(app: FastifyInstance) {
  app.get("/api/v1/mdata/driver-tags", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = listTagsQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const result = await withCompany(user.uuid, query.data.operating_company_id, async (client) => {
      if (!(await relationExists(client, "catalogs.driver_tags"))) return { tags: [] };
      const res = await client.query(
        `
          SELECT id::text, code, label, color, is_active, created_at::text
          FROM catalogs.driver_tags
          WHERE operating_company_id = $1::uuid AND archived_at IS NULL
          ORDER BY label ASC
        `,
        [query.data.operating_company_id]
      );
      return { tags: res.rows };
    });
    if ("noCompany" in result) return { tags: [] };
    return result;
  });

  app.post("/api/v1/mdata/driver-tags", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const body = createTagBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const result = await withCompany(user.uuid, body.data.operating_company_id, async (client) => {
      if (!(await relationExists(client, "catalogs.driver_tags"))) return { unavailable: true as const };
      const existing = await client.query(
        `SELECT id::text, code, label, color FROM catalogs.driver_tags
          WHERE operating_company_id = $1::uuid AND code = $2 AND archived_at IS NULL`,
        [body.data.operating_company_id, body.data.code]
      );
      if (existing.rows[0]) return { tag: existing.rows[0], alreadyExisted: true as const };

      const res = await client.query(
        `
          INSERT INTO catalogs.driver_tags (operating_company_id, code, label, color, created_by_user_id)
          VALUES ($1::uuid, $2, $3, $4, $5::uuid)
          RETURNING id::text, code, label, color
        `,
        [body.data.operating_company_id, body.data.code, body.data.label, body.data.color ?? null, user.uuid]
      );
      await appendCrudAudit(client, user.uuid, "mdata.driver_tag.created", {
        resource_type: "catalogs.driver_tags",
        resource_id: res.rows[0].id,
        operating_company_id: body.data.operating_company_id,
        code: body.data.code,
      });
      return { tag: res.rows[0], alreadyExisted: false as const };
    });

    if ("noCompany" in result) return reply.code(403).send({ error: "forbidden_company_membership" });
    if ("unavailable" in result) return reply.code(503).send({ error: "driver_tags_not_provisioned" });
    return result;
  });

  app.get(
    "/api/v1/mdata/driver-tags/memberships",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = authed(req, reply);
      if (!user) return;
      const query = membershipsQuerySchema.safeParse(req.query ?? {});
      if (!query.success) return validationError(reply, query.error);

      const result = await withCompany(user.uuid, query.data.operating_company_id, async (client) => {
        if (!(await relationExists(client, "mdata.driver_tag_memberships"))) return { memberships: {} };
        const res = await client.query(
          `
            SELECT m.driver_id::text, t.id::text AS tag_id, t.code, t.label, t.color
            FROM mdata.driver_tag_memberships m
            JOIN catalogs.driver_tags t ON t.id = m.tag_id AND t.operating_company_id = m.operating_company_id
            WHERE m.operating_company_id = $1::uuid
              AND m.driver_id = ANY($2::uuid[])
              AND m.removed_at IS NULL
              AND t.archived_at IS NULL
            ORDER BY t.label ASC
          `,
          [query.data.operating_company_id, query.data.driver_ids]
        );
        const memberships: Record<string, Array<{ tag_id: string; code: string; label: string; color: string | null }>> = {};
        for (const row of res.rows as Array<{ driver_id: string; tag_id: string; code: string; label: string; color: string | null }>) {
          (memberships[row.driver_id] ??= []).push({ tag_id: row.tag_id, code: row.code, label: row.label, color: row.color });
        }
        return { memberships };
      });
      if ("noCompany" in result) return { memberships: {} };
      return result;
    }
  );

  app.post(
    "/api/v1/mdata/drivers/bulk-tag",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = authed(req, reply);
      if (!user) return;
      const body = bulkTagBodySchema.safeParse(req.body ?? {});
      if (!body.success) return validationError(reply, body.error);
      if (body.data.action === "remove" && !body.data.removed_reason) {
        return reply.code(400).send({ error: "removed_reason_required" });
      }

      const result = await withCompany(user.uuid, body.data.operating_company_id, async (client, scopedCompanyId) => {
        if (!(await relationExists(client, "mdata.driver_tag_memberships"))) return { unavailable: true as const };

        // Cross-company IDs fail: both the tag and every driver_id must belong to the scoped
        // company (RLS already enforces this at the row level; this is a fast, explicit
        // pre-check so a mismatched id is reported as a real error, not a silent partial no-op).
        const tagCheck = await client.query(
          `SELECT 1 FROM catalogs.driver_tags WHERE id = $1::uuid AND operating_company_id = $2::uuid AND archived_at IS NULL`,
          [body.data.tag_id, scopedCompanyId]
        );
        if (!tagCheck.rows[0]) return { error: "tag_not_found_for_company" as const };

        const driverCheck = await client.query(
          `SELECT id::text FROM mdata.drivers WHERE id = ANY($1::uuid[]) AND operating_company_id = $2::uuid`,
          [body.data.driver_ids, scopedCompanyId]
        );
        const validDriverIds = new Set(driverCheck.rows.map((r: { id: string }) => r.id));
        const invalidIds = body.data.driver_ids.filter((id) => !validDriverIds.has(id));
        if (invalidIds.length) return { error: "driver_ids_not_found_for_company" as const, invalidIds };

        let affected = 0;
        if (body.data.action === "add") {
          const res = await client.query(
            `
              INSERT INTO mdata.driver_tag_memberships (operating_company_id, driver_id, tag_id, assigned_by_user_id)
              SELECT $1::uuid, d.id, $2::uuid, $3::uuid
              FROM unnest($4::uuid[]) AS d(id)
              ON CONFLICT (operating_company_id, driver_id, tag_id) WHERE removed_at IS NULL DO NOTHING
              RETURNING id
            `,
            [scopedCompanyId, body.data.tag_id, user.uuid, body.data.driver_ids]
          );
          affected = res.rows.length;
        } else {
          const res = await client.query(
            `
              UPDATE mdata.driver_tag_memberships
              SET removed_at = now(), removed_by_user_id = $1::uuid, removed_reason = $2
              WHERE operating_company_id = $3::uuid
                AND tag_id = $4::uuid
                AND driver_id = ANY($5::uuid[])
                AND removed_at IS NULL
              RETURNING id
            `,
            [user.uuid, body.data.removed_reason ?? null, scopedCompanyId, body.data.tag_id, body.data.driver_ids]
          );
          affected = res.rows.length;
        }

        await appendCrudAudit(client, user.uuid, `mdata.driver_tag.bulk_${body.data.action}`, {
          resource_type: "mdata.driver_tag_memberships",
          operating_company_id: scopedCompanyId,
          tag_id: body.data.tag_id,
          driver_ids: body.data.driver_ids,
          affected,
        });

        return { ok: true as const, affected };
      });

      if ("noCompany" in result) return reply.code(403).send({ error: "forbidden_company_membership" });
      if ("unavailable" in result) return reply.code(503).send({ error: "driver_tags_not_provisioned" });
      if ("error" in result) return reply.code(400).send(result);
      return result;
    }
  );
}

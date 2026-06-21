import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { isCatalogWriteRole } from "../../auth/role-helpers.js";
import { catalogCodeSchema, currentAuthUser, idParamSchema, listQuerySchema, validationError, withCompanyScope } from "./shared.js";

const severitySchema = z.enum(["low", "medium", "high", "critical"]);

const createBodySchema = z.object({
  type_code: catalogCodeSchema,
  type_name: z.string().trim().min(1).max(140),
  default_severity: severitySchema.nullable().optional(),
  is_active: z.boolean().default(true),
});

const updateBodySchema = z
  .object({
    type_code: catalogCodeSchema.optional(),
    type_name: z.string().trim().min(1).max(140).optional(),
    default_severity: severitySchema.nullable().optional(),
    is_active: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "at least one field is required" });

export async function registerComplaintTypesRoutes(app: FastifyInstance) {
  app.get("/api/v1/catalogs/safety/complaint-types", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsed = listQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const q = parsed.data;

    const payload = await withCompanyScope(authUser.uuid, q.operating_company_id, async (client) => {
      const values: unknown[] = [q.operating_company_id];
      const where: string[] = ["c.operating_company_id = $1"];
      if (q.is_active === "true") where.push("c.is_active = true");
      if (q.is_active === "false") where.push("c.is_active = false");
      if (q.search) {
        values.push(`%${q.search}%`);
        where.push(`(c.type_code ILIKE $${values.length} OR c.type_name ILIKE $${values.length})`);
      }
      const whereClause = where.join(" AND ");

      const countRes = await client.query(`SELECT count(*)::text AS total FROM catalogs.complaint_types c WHERE ${whereClause}`, values);
      values.push(q.limit);
      values.push(q.offset);
      const rowsRes = await client.query(
        `
          SELECT
            c.id,
            c.operating_company_id,
            c.type_code,
            c.type_name,
            c.default_severity,
            c.is_active
          FROM catalogs.complaint_types c
          WHERE ${whereClause}
          ORDER BY c.type_code ASC
          LIMIT $${values.length - 1}
          OFFSET $${values.length}
        `,
        values
      );
      return { rows: rowsRes.rows, total: Number(((countRes.rows[0] as { total?: string } | undefined)?.total ?? 0)) };
    });

    return payload;
  });

  app.get("/api/v1/catalogs/safety/complaint-types/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return validationError(reply, parsedParams.error);
    const parsedQuery = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
    if (!parsedQuery.success) return validationError(reply, parsedQuery.error);

    const row = await withCompanyScope(authUser.uuid, parsedQuery.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT
            id,
            operating_company_id,
            type_code,
            type_name,
            default_severity,
            is_active
          FROM catalogs.complaint_types
          WHERE id = $1
            AND operating_company_id = $2
          LIMIT 1
        `,
        [parsedParams.data.id, parsedQuery.data.operating_company_id]
      );
      return res.rows[0] ?? null;
    });

    if (!row) return reply.code(404).send({ error: "catalog_complaint_type_not_found" });
    return row;
  });

  app.post("/api/v1/catalogs/safety/complaint-types", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isCatalogWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedQuery = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
    if (!parsedQuery.success) return validationError(reply, parsedQuery.error);
    const parsedBody = createBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return validationError(reply, parsedBody.error);
    const b = parsedBody.data;

    const created = await withCompanyScope(authUser.uuid, parsedQuery.data.operating_company_id, async (client) => {
      const conflict = await client.query(
        `
          SELECT id
          FROM catalogs.complaint_types
          WHERE operating_company_id = $1
            AND type_code = $2
          LIMIT 1
        `,
        [parsedQuery.data.operating_company_id, b.type_code]
      );
      if (conflict.rows.length > 0) return { error: "catalog_complaint_type_code_conflict" as const };

      const res = await client.query(
        `
          INSERT INTO catalogs.complaint_types (
            operating_company_id, type_code, type_name, default_severity, is_active
          )
          VALUES ($1,$2,$3,$4,$5)
          RETURNING
            id,
            operating_company_id,
            type_code,
            type_name,
            default_severity,
            is_active
        `,
        [parsedQuery.data.operating_company_id, b.type_code, b.type_name, b.default_severity ?? null, b.is_active]
      );
      const row = res.rows[0];
      await appendCrudAudit(client, authUser.uuid, "catalogs.complaint_types_created", {
        resource_id: row.id,
        resource_type: "catalogs.complaint_types",
        type_code: row.type_code,
      });
      return { row };
    });

    if ("error" in created) return reply.code(409).send({ error: created.error });
    return reply.code(201).send(created.row);
  });

  app.patch("/api/v1/catalogs/safety/complaint-types/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isCatalogWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return validationError(reply, parsedParams.error);
    const parsedQuery = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
    if (!parsedQuery.success) return validationError(reply, parsedQuery.error);
    const parsedBody = updateBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return validationError(reply, parsedBody.error);
    const b = parsedBody.data;

    const updated = await withCompanyScope(authUser.uuid, parsedQuery.data.operating_company_id, async (client) => {
      if (b.type_code) {
        const conflict = await client.query(
          `
            SELECT id
            FROM catalogs.complaint_types
            WHERE operating_company_id = $1
              AND type_code = $2
              AND id <> $3
            LIMIT 1
          `,
          [parsedQuery.data.operating_company_id, b.type_code, parsedParams.data.id]
        );
        if (conflict.rows.length > 0) return { error: "catalog_complaint_type_code_conflict" as const };
      }

      const fields: string[] = [];
      const values: unknown[] = [];
      const add = (sql: string, value: unknown) => {
        values.push(value);
        fields.push(`${sql} = $${values.length}`);
      };
      if ("type_code" in b) add("type_code", b.type_code);
      if ("type_name" in b) add("type_name", b.type_name);
      if ("default_severity" in b) add("default_severity", b.default_severity ?? null);
      if ("is_active" in b) add("is_active", b.is_active);
      values.push(parsedParams.data.id, parsedQuery.data.operating_company_id);

      const res = await client.query(
        `
          UPDATE catalogs.complaint_types
          SET ${fields.join(", ")}
          WHERE id = $${values.length - 1}
            AND operating_company_id = $${values.length}
          RETURNING
            id,
            operating_company_id,
            type_code,
            type_name,
            default_severity,
            is_active
        `,
        values
      );
      if (res.rows.length === 0) return { error: "catalog_complaint_type_not_found" as const };
      const row = res.rows[0];
      await appendCrudAudit(client, authUser.uuid, "catalogs.complaint_types_updated", {
        resource_id: row.id,
        resource_type: "catalogs.complaint_types",
      });
      return { row };
    });

    if ("error" in updated) {
      if (updated.error === "catalog_complaint_type_not_found") return reply.code(404).send({ error: updated.error });
      return reply.code(409).send({ error: updated.error });
    }
    return updated.row;
  });

  app.delete("/api/v1/catalogs/safety/complaint-types/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isCatalogWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return validationError(reply, parsedParams.error);
    const parsedQuery = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
    if (!parsedQuery.success) return validationError(reply, parsedQuery.error);

    const result = await withCompanyScope(authUser.uuid, parsedQuery.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          UPDATE catalogs.complaint_types
          SET is_active = false
          WHERE id = $1
            AND operating_company_id = $2
          RETURNING id, type_code
        `,
        [parsedParams.data.id, parsedQuery.data.operating_company_id]
      );
      if (res.rows.length === 0) return null;
      await appendCrudAudit(client, authUser.uuid, "catalogs.complaint_types_deactivated", {
        resource_id: res.rows[0].id,
        resource_type: "catalogs.complaint_types",
        type_code: res.rows[0].type_code,
      });
      return { ok: true };
    });

    if (!result) return reply.code(404).send({ error: "catalog_complaint_type_not_found" });
    return result;
  });
}

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { isCatalogWriteRole } from "../../auth/role-helpers.js";
import { currentAuthUser, idParamSchema, listQuerySchema, validationError, withCompanyScope } from "./shared.js";

// FMCSA violation codes look like "392.2", "395.8A", "393.75" — allow uppercase letters, digits, dots, dashes.
const violationCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Z0-9][A-Z0-9.-]*$/, "violation_code must be letters, digits, dots, and dashes")
  .min(1)
  .max(40);

// FMCSA BASIC categories, excluding Hazmat (CLAUDE.md: NO hazmat fields anywhere).
const basicCategorySchema = z.enum([
  "unsafe_driving",
  "hours_of_service",
  "driver_fitness",
  "controlled_substances",
  "vehicle_maintenance",
  "crash_indicator",
]);

const createBodySchema = z.object({
  violation_code: violationCodeSchema,
  display_name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).nullable().optional(),
  basic_category: basicCategorySchema.nullable().optional(),
  severity_weight: z.coerce.number().int().min(1).max(10).nullable().optional(),
  is_oos: z.boolean().default(false),
  is_active: z.boolean().default(true),
  sort_order: z.coerce.number().int().min(0).max(10000).default(0),
});

const updateBodySchema = z
  .object({
    violation_code: violationCodeSchema.optional(),
    display_name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    basic_category: basicCategorySchema.nullable().optional(),
    severity_weight: z.coerce.number().int().min(1).max(10).nullable().optional(),
    is_oos: z.boolean().optional(),
    is_active: z.boolean().optional(),
    sort_order: z.coerce.number().int().min(0).max(10000).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "at least one field is required" });

const SELECT_COLUMNS = `
  id,
  operating_company_id,
  violation_code,
  display_name,
  description,
  basic_category,
  severity_weight,
  is_oos,
  is_active,
  sort_order,
  created_at,
  updated_at
`;

export async function registerDotViolationTypesRoutes(app: FastifyInstance) {
  app.get("/api/v1/catalogs/safety/dot-violation-types", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsed = listQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const q = parsed.data;

    const payload = await withCompanyScope(authUser.uuid, q.operating_company_id, async (client) => {
      const values: unknown[] = [q.operating_company_id];
      const where: string[] = ["d.operating_company_id = $1"];
      if (q.is_active === "true") where.push("d.is_active = true");
      if (q.is_active === "false") where.push("d.is_active = false");
      if (q.search) {
        values.push(`%${q.search}%`);
        where.push(`(d.violation_code ILIKE $${values.length} OR d.display_name ILIKE $${values.length})`);
      }
      const whereClause = where.join(" AND ");

      const countRes = await client.query(`SELECT count(*)::text AS total FROM catalogs.dot_violation_types d WHERE ${whereClause}`, values);
      values.push(q.limit);
      values.push(q.offset);
      const rowsRes = await client.query(
        `
          SELECT ${SELECT_COLUMNS}
          FROM catalogs.dot_violation_types d
          WHERE ${whereClause}
          ORDER BY d.sort_order ASC, d.violation_code ASC
          LIMIT $${values.length - 1}
          OFFSET $${values.length}
        `,
        values
      );
      return { rows: rowsRes.rows, total: Number(((countRes.rows[0] as { total?: string } | undefined)?.total ?? 0)) };
    });

    return payload;
  });

  app.get("/api/v1/catalogs/safety/dot-violation-types/:id", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return validationError(reply, parsedParams.error);
    const parsedQuery = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
    if (!parsedQuery.success) return validationError(reply, parsedQuery.error);

    const row = await withCompanyScope(authUser.uuid, parsedQuery.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT ${SELECT_COLUMNS}
          FROM catalogs.dot_violation_types
          WHERE id = $1
            AND operating_company_id = $2
          LIMIT 1
        `,
        [parsedParams.data.id, parsedQuery.data.operating_company_id]
      );
      return res.rows[0] ?? null;
    });

    if (!row) return reply.code(404).send({ error: "catalog_dot_violation_type_not_found" });
    return row;
  });

  app.post("/api/v1/catalogs/safety/dot-violation-types", async (req, reply) => {
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
          FROM catalogs.dot_violation_types
          WHERE operating_company_id = $1
            AND violation_code = $2
          LIMIT 1
        `,
        [parsedQuery.data.operating_company_id, b.violation_code]
      );
      if (conflict.rows.length > 0) return { error: "catalog_dot_violation_type_code_conflict" as const };

      const res = await client.query(
        `
          INSERT INTO catalogs.dot_violation_types (
            operating_company_id, violation_code, display_name, description, basic_category, severity_weight, is_oos, is_active, sort_order
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
          RETURNING ${SELECT_COLUMNS}
        `,
        [
          parsedQuery.data.operating_company_id,
          b.violation_code,
          b.display_name,
          b.description ?? null,
          b.basic_category ?? null,
          b.severity_weight ?? null,
          b.is_oos,
          b.is_active,
          b.sort_order,
        ]
      );
      const row = res.rows[0];
      await appendCrudAudit(client, authUser.uuid, "catalogs.dot_violation_types_created", {
        resource_id: row.id,
        resource_type: "catalogs.dot_violation_types",
        violation_code: row.violation_code,
      });
      return { row };
    });

    if ("error" in created) return reply.code(409).send({ error: created.error });
    return reply.code(201).send(created.row);
  });

  app.patch("/api/v1/catalogs/safety/dot-violation-types/:id", async (req, reply) => {
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
      if (b.violation_code) {
        const conflict = await client.query(
          `
            SELECT id
            FROM catalogs.dot_violation_types
            WHERE operating_company_id = $1
              AND violation_code = $2
              AND id <> $3
            LIMIT 1
          `,
          [parsedQuery.data.operating_company_id, b.violation_code, parsedParams.data.id]
        );
        if (conflict.rows.length > 0) return { error: "catalog_dot_violation_type_code_conflict" as const };
      }

      const fields: string[] = [];
      const values: unknown[] = [];
      const add = (sql: string, value: unknown) => {
        values.push(value);
        fields.push(`${sql} = $${values.length}`);
      };
      if ("violation_code" in b) add("violation_code", b.violation_code);
      if ("display_name" in b) add("display_name", b.display_name);
      if ("description" in b) add("description", b.description ?? null);
      if ("basic_category" in b) add("basic_category", b.basic_category ?? null);
      if ("severity_weight" in b) add("severity_weight", b.severity_weight ?? null);
      if ("is_oos" in b) add("is_oos", b.is_oos);
      if ("is_active" in b) add("is_active", b.is_active);
      if ("sort_order" in b) add("sort_order", b.sort_order);
      fields.push("updated_at = now()");
      values.push(parsedParams.data.id, parsedQuery.data.operating_company_id);

      const res = await client.query(
        `
          UPDATE catalogs.dot_violation_types
          SET ${fields.join(", ")}
          WHERE id = $${values.length - 1}
            AND operating_company_id = $${values.length}
          RETURNING ${SELECT_COLUMNS}
        `,
        values
      );
      if (res.rows.length === 0) return { error: "catalog_dot_violation_type_not_found" as const };
      const row = res.rows[0];
      await appendCrudAudit(client, authUser.uuid, "catalogs.dot_violation_types_updated", {
        resource_id: row.id,
        resource_type: "catalogs.dot_violation_types",
      });
      return { row };
    });

    if ("error" in updated) {
      if (updated.error === "catalog_dot_violation_type_not_found") return reply.code(404).send({ error: updated.error });
      return reply.code(409).send({ error: updated.error });
    }
    return updated.row;
  });

  app.delete("/api/v1/catalogs/safety/dot-violation-types/:id", async (req, reply) => {
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
          UPDATE catalogs.dot_violation_types
          SET is_active = false,
              updated_at = now()
          WHERE id = $1
            AND operating_company_id = $2
          RETURNING id, violation_code
        `,
        [parsedParams.data.id, parsedQuery.data.operating_company_id]
      );
      if (res.rows.length === 0) return null;
      await appendCrudAudit(client, authUser.uuid, "catalogs.dot_violation_types_deactivated", {
        resource_id: res.rows[0].id,
        resource_type: "catalogs.dot_violation_types",
        violation_code: res.rows[0].violation_code,
      });
      return { ok: true };
    });

    if (!result) return reply.code(404).send({ error: "catalog_dot_violation_type_not_found" });
    return result;
  });
}

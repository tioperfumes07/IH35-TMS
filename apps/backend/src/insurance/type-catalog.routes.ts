import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { INSURANCE_COVERAGE_TYPES } from "./policy.shared.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const listQuerySchema = companyQuerySchema.extend({
  include_inactive: z.coerce.boolean().optional(),
});

const idParamsSchema = z.object({
  id: z.string().uuid(),
});

const createSchema = z.object({
  operating_company_id: z.string().uuid(),
  code: z.enum(INSURANCE_COVERAGE_TYPES),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  active: z.boolean().optional(),
  sort_order: z.number().int().min(0).max(10000).optional(),
});

const updateSchema = z
  .object({
    code: z.enum(INSURANCE_COVERAGE_TYPES).optional(),
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    active: z.boolean().optional(),
    sort_order: z.number().int().min(0).max(10000).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "at least one field is required" });

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

type PgError = {
  code?: string;
  constraint?: string;
};

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function canMutate(role: string) {
  return ["Owner", "Administrator", "Manager", "Accountant"].includes(role);
}

async function withCompanyScope<T>(
  userId: string,
  operatingCompanyId: string,
  fn: (client: Queryable) => Promise<T>
) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${operatingCompanyId}'`);
    return fn(client as Queryable);
  });
}

function selectColumns() {
  return `
    id::text,
    code,
    name,
    description,
    active,
    sort_order::int,
    created_at::text,
    updated_at::text
  `;
}

function mapConflictError(err: unknown) {
  const pgErr = err as PgError;
  if (pgErr?.code === "23505" && pgErr.constraint?.includes("type_catalog")) {
    return "insurance_type_catalog_conflict";
  }
  return null;
}

export async function registerInsuranceTypeCatalogRoutes(app: FastifyInstance) {
  app.get("/api/v1/insurance/type-catalog", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    const parsed = listQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });

    const rows = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
      const filters = ["tenant_id = $1::uuid"];
      if (!parsed.data.include_inactive) filters.push("active = true");
      const result = await client.query(
        `
          SELECT ${selectColumns()}
          FROM insurance.type_catalog
          WHERE ${filters.join(" AND ")}
          ORDER BY sort_order ASC, name ASC
        `,
        [parsed.data.operating_company_id]
      );
      return result.rows;
    });

    return { types: rows };
  });

  app.post("/api/v1/insurance/type-catalog", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const parsed = createSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    const body = parsed.data;

    try {
      const created = await withCompanyScope(user.uuid, body.operating_company_id, async (client) => {
        const result = await client.query(
          `
            INSERT INTO insurance.type_catalog (
              tenant_id, code, name, description, active, sort_order
            )
            VALUES ($1::uuid, $2, $3, $4, $5, $6)
            RETURNING ${selectColumns()}
          `,
          [
            body.operating_company_id,
            body.code,
            body.name,
            body.description ?? null,
            body.active ?? true,
            body.sort_order ?? 0,
          ]
        );
        await appendCrudAudit(client, user.uuid, "insurance.type_catalog.created", {
          resource_id: result.rows[0]?.id,
          operating_company_id: body.operating_company_id,
        });
        return result.rows[0];
      });
      return reply.code(201).send(created);
    } catch (error) {
      const mapped = mapConflictError(error);
      if (mapped) return reply.code(409).send({ error: mapped });
      throw error;
    }
  });

  app.patch("/api/v1/insurance/type-catalog/:id", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    const bodyParsed = updateSchema.safeParse(req.body ?? {});
    if (!bodyParsed.success) return reply.code(400).send({ error: "validation_error", details: bodyParsed.error.flatten() });
    const body = bodyParsed.data;

    try {
      const updated = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
        const assignments: string[] = [];
        const values: unknown[] = [query.data.operating_company_id, params.data.id];
        const setField = (column: string, value: unknown) => {
          values.push(value);
          assignments.push(`${column} = $${values.length}`);
        };

        if (body.code !== undefined) setField("code", body.code);
        if (body.name !== undefined) setField("name", body.name);
        if (body.description !== undefined) setField("description", body.description);
        if (body.active !== undefined) setField("active", body.active);
        if (body.sort_order !== undefined) setField("sort_order", body.sort_order);

        const result = await client.query(
          `
            UPDATE insurance.type_catalog
            SET ${assignments.join(", ")}
            WHERE tenant_id = $1::uuid AND id = $2::uuid
            RETURNING ${selectColumns()}
          `,
          values
        );
        if (!result.rows[0]) return null;
        await appendCrudAudit(client, user.uuid, "insurance.type_catalog.updated", {
          resource_id: params.data.id,
          operating_company_id: query.data.operating_company_id,
        });
        return result.rows[0];
      });

      if (!updated) return reply.code(404).send({ error: "insurance_type_catalog_not_found" });
      return updated;
    } catch (error) {
      const mapped = mapConflictError(error);
      if (mapped) return reply.code(409).send({ error: mapped });
      throw error;
    }
  });

  app.delete("/api/v1/insurance/type-catalog/:id", async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;
    if (!canMutate(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });

    const deactivated = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const result = await client.query(
        `
          UPDATE insurance.type_catalog
          SET active = false
          WHERE tenant_id = $1::uuid AND id = $2::uuid
          RETURNING id::text
        `,
        [query.data.operating_company_id, params.data.id]
      );
      if (!result.rows[0]) return false;
      await appendCrudAudit(client, user.uuid, "insurance.type_catalog.deactivated", {
        resource_id: params.data.id,
        operating_company_id: query.data.operating_company_id,
      });
      return true;
    });

    if (!deactivated) return reply.code(404).send({ error: "insurance_type_catalog_not_found" });
    return reply.code(204).send();
  });
}

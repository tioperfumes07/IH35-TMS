import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { isCatalogWriteRole } from "../../auth/role-helpers.js";
import { catalogCodeSchema, currentAuthUser, idParamSchema, listQuerySchema, validationError, withCompanyScope } from "./shared.js";

const claimCategorySchema = z.enum([
  "damage",
  "shortage",
  "loss",
  "delay",
  "temperature",
  "contamination",
  "theft",
  "concealed_damage",
  "other",
]);

const createBodySchema = z.object({
  reason_code: catalogCodeSchema,
  display_name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).nullable().optional(),
  claim_category: claimCategorySchema.nullable().optional(),
  is_active: z.boolean().default(true),
  sort_order: z.coerce.number().int().min(0).max(10000).default(0),
});

const updateBodySchema = z
  .object({
    reason_code: catalogCodeSchema.optional(),
    display_name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    claim_category: claimCategorySchema.nullable().optional(),
    is_active: z.boolean().optional(),
    sort_order: z.coerce.number().int().min(0).max(10000).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "at least one field is required" });

const SELECT_COLUMNS = `
  id,
  operating_company_id,
  reason_code,
  display_name,
  description,
  claim_category,
  is_active,
  sort_order,
  created_at,
  updated_at
`;

export async function registerCargoClaimReasonsRoutes(app: FastifyInstance) {
  app.get("/api/v1/catalogs/safety/cargo-claim-reasons", async (req, reply) => {
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
        where.push(`(c.reason_code ILIKE $${values.length} OR c.display_name ILIKE $${values.length})`);
      }
      const whereClause = where.join(" AND ");

      const countRes = await client.query(`SELECT count(*)::text AS total FROM catalogs.cargo_claim_reasons c WHERE ${whereClause}`, values);
      values.push(q.limit);
      values.push(q.offset);
      const rowsRes = await client.query(
        `
          SELECT ${SELECT_COLUMNS}
          FROM catalogs.cargo_claim_reasons c
          WHERE ${whereClause}
          ORDER BY c.sort_order ASC, c.reason_code ASC
          LIMIT $${values.length - 1}
          OFFSET $${values.length}
        `,
        values
      );
      return { rows: rowsRes.rows, total: Number(((countRes.rows[0] as { total?: string } | undefined)?.total ?? 0)) };
    });

    return payload;
  });

  app.get("/api/v1/catalogs/safety/cargo-claim-reasons/:id", async (req, reply) => {
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
          FROM catalogs.cargo_claim_reasons
          WHERE id = $1
            AND operating_company_id = $2
          LIMIT 1
        `,
        [parsedParams.data.id, parsedQuery.data.operating_company_id]
      );
      return res.rows[0] ?? null;
    });

    if (!row) return reply.code(404).send({ error: "catalog_cargo_claim_reason_not_found" });
    return row;
  });

  app.post("/api/v1/catalogs/safety/cargo-claim-reasons", async (req, reply) => {
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
          FROM catalogs.cargo_claim_reasons
          WHERE operating_company_id = $1
            AND reason_code = $2
          LIMIT 1
        `,
        [parsedQuery.data.operating_company_id, b.reason_code]
      );
      if (conflict.rows.length > 0) return { error: "catalog_cargo_claim_reason_code_conflict" as const };

      const res = await client.query(
        `
          INSERT INTO catalogs.cargo_claim_reasons (
            operating_company_id, reason_code, display_name, description, claim_category, is_active, sort_order
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7)
          RETURNING ${SELECT_COLUMNS}
        `,
        [
          parsedQuery.data.operating_company_id,
          b.reason_code,
          b.display_name,
          b.description ?? null,
          b.claim_category ?? null,
          b.is_active,
          b.sort_order,
        ]
      );
      const row = res.rows[0];
      await appendCrudAudit(client, authUser.uuid, "catalogs.cargo_claim_reasons_created", {
        resource_id: row.id,
        resource_type: "catalogs.cargo_claim_reasons",
        reason_code: row.reason_code,
      });
      return { row };
    });

    if ("error" in created) return reply.code(409).send({ error: created.error });
    return reply.code(201).send(created.row);
  });

  app.patch("/api/v1/catalogs/safety/cargo-claim-reasons/:id", async (req, reply) => {
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
      if (b.reason_code) {
        const conflict = await client.query(
          `
            SELECT id
            FROM catalogs.cargo_claim_reasons
            WHERE operating_company_id = $1
              AND reason_code = $2
              AND id <> $3
            LIMIT 1
          `,
          [parsedQuery.data.operating_company_id, b.reason_code, parsedParams.data.id]
        );
        if (conflict.rows.length > 0) return { error: "catalog_cargo_claim_reason_code_conflict" as const };
      }

      const fields: string[] = [];
      const values: unknown[] = [];
      const add = (sql: string, value: unknown) => {
        values.push(value);
        fields.push(`${sql} = $${values.length}`);
      };
      if ("reason_code" in b) add("reason_code", b.reason_code);
      if ("display_name" in b) add("display_name", b.display_name);
      if ("description" in b) add("description", b.description ?? null);
      if ("claim_category" in b) add("claim_category", b.claim_category ?? null);
      if ("is_active" in b) add("is_active", b.is_active);
      if ("sort_order" in b) add("sort_order", b.sort_order);
      fields.push("updated_at = now()");
      values.push(parsedParams.data.id, parsedQuery.data.operating_company_id);

      const res = await client.query(
        `
          UPDATE catalogs.cargo_claim_reasons
          SET ${fields.join(", ")}
          WHERE id = $${values.length - 1}
            AND operating_company_id = $${values.length}
          RETURNING ${SELECT_COLUMNS}
        `,
        values
      );
      if (res.rows.length === 0) return { error: "catalog_cargo_claim_reason_not_found" as const };
      const row = res.rows[0];
      await appendCrudAudit(client, authUser.uuid, "catalogs.cargo_claim_reasons_updated", {
        resource_id: row.id,
        resource_type: "catalogs.cargo_claim_reasons",
      });
      return { row };
    });

    if ("error" in updated) {
      if (updated.error === "catalog_cargo_claim_reason_not_found") return reply.code(404).send({ error: updated.error });
      return reply.code(409).send({ error: updated.error });
    }
    return updated.row;
  });

  app.delete("/api/v1/catalogs/safety/cargo-claim-reasons/:id", async (req, reply) => {
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
          UPDATE catalogs.cargo_claim_reasons
          SET is_active = false,
              updated_at = now()
          WHERE id = $1
            AND operating_company_id = $2
          RETURNING id, reason_code
        `,
        [parsedParams.data.id, parsedQuery.data.operating_company_id]
      );
      if (res.rows.length === 0) return null;
      await appendCrudAudit(client, authUser.uuid, "catalogs.cargo_claim_reasons_deactivated", {
        resource_id: res.rows[0].id,
        resource_type: "catalogs.cargo_claim_reasons",
        reason_code: res.rows[0].reason_code,
      });
      return { ok: true };
    });

    if (!result) return reply.code(404).send({ error: "catalog_cargo_claim_reason_not_found" });
    return result;
  });
}

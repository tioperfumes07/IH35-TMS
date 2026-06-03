import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { isCatalogWriteRole } from "../auth/role-helpers.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { FLEET_BRAND_SOURCES_SQL, fetchFleetBrands, normalizeBrandKey } from "./oem-parts.brand-match.js";

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

async function withReferenceScope<T>(userId: string, fn: (client: Queryable) => Promise<T>) {
  return withCurrentUser(userId, async (client) => fn(client as Queryable));
}

const listQuerySchema = z.object({
  brand: z.string().trim().optional(),
  category: z.string().trim().optional(),
  fleet_only: z.coerce.boolean().optional(),
  q: z.string().trim().optional(),
  include_archived: z.coerce.boolean().optional(),
});

const createBodySchema = z.object({
  brand: z.string().trim().min(1).max(120),
  model_compat: z.string().trim().max(160).nullable().optional(),
  oem_part_number: z.string().trim().max(80).nullable().optional(),
  part_name: z.string().trim().min(1).max(200),
  category: z.string().trim().min(1).max(80),
  sub_category: z.string().trim().max(80).nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
  unit_cost_usd_typical: z.coerce.number().min(0).max(99999999.99).nullable().optional(),
  default_supplier: z.string().trim().max(160).nullable().optional(),
});

const updateBodySchema = createBodySchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: "at least one field is required" });

const idParamSchema = z.object({
  id: z.string().uuid(),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function validationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function selectColumns(alias = "") {
  const p = alias ? `${alias}.` : "";
  return `
    ${p}id::text,
    ${p}brand,
    ${p}model_compat,
    ${p}oem_part_number,
    ${p}part_name,
    ${p}category,
    ${p}sub_category,
    ${p}description,
    ${p}unit_cost_usd_typical::text,
    ${p}default_supplier,
    ${p}archived_at::text,
    ${p}created_at::text,
    ${p}updated_at::text
  `;
}

export async function registerOemPartsRoutes(app: FastifyInstance) {
  const basePath = "/api/v1/lists/oem-parts";

  app.get(`${basePath}/brands`, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;

    const payload = await withReferenceScope(authUser.uuid, async (client) => {
      const fleetBrands = await fetchFleetBrands(client);
      const rowsRes = await client.query<{ brand: string; total_count: string; fleet_match: boolean }>(
        `
          SELECT
            brand,
            count(*) FILTER (WHERE archived_at IS NULL)::text AS total_count,
            false AS fleet_match
          FROM reference.oem_parts
          GROUP BY brand
          ORDER BY brand ASC
        `
      );
      const rows = rowsRes.rows.map((row) => ({
        brand: row.brand,
        total_count: Number(row.total_count ?? 0),
        fleet_match: fleetBrands.has(normalizeBrandKey(row.brand)),
      }));
      const fleetMatchedCount = rows.filter((row) => row.fleet_match).length;
      return {
        rows,
        fleet_brands: [...fleetBrands].sort(),
        fleet_matched_brand_count: fleetMatchedCount,
      };
    });

    return payload;
  });

  app.get(basePath, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsed = listQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const q = parsed.data;
    const fleetOnly = q.fleet_only !== false;

    const payload = await withReferenceScope(authUser.uuid, async (client) => {
      const fleetBrands = fleetOnly ? await fetchFleetBrands(client) : null;
      const values: unknown[] = [];
      const where: string[] = [];
      if (!q.include_archived) where.push("archived_at IS NULL");
      if (q.brand) {
        values.push(q.brand);
        where.push(`brand ILIKE $${values.length}`);
      }
      if (q.category) {
        values.push(q.category);
        where.push(`category ILIKE $${values.length}`);
      }
      if (q.q) {
        values.push(`%${q.q}%`);
        where.push(
          `(part_name ILIKE $${values.length} OR oem_part_number ILIKE $${values.length} OR brand ILIKE $${values.length})`
        );
      }
      if (fleetBrands) {
        if (fleetBrands.size === 0) {
          where.push("FALSE");
        } else {
          values.push([...fleetBrands]);
          where.push(`UPPER(brand) = ANY($${values.length}::text[])`);
        }
      }
      const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

      const countRes = await client.query<{ total_count: string; archived_count: string; brand_count: string; fleet_count: string }>(
        `
          SELECT
            count(*) FILTER (WHERE archived_at IS NULL)::text AS total_count,
            count(*) FILTER (WHERE archived_at IS NOT NULL)::text AS archived_count,
            count(DISTINCT brand) FILTER (WHERE archived_at IS NULL)::text AS brand_count,
            count(*) FILTER (
              WHERE archived_at IS NULL
                AND UPPER(brand) IN (
                  SELECT brand FROM (${FLEET_BRAND_SOURCES_SQL}) fleet_brands
                )
            )::text AS fleet_count
          FROM reference.oem_parts
        `
      );
      const rowsRes = await client.query(
        `
          SELECT ${selectColumns()}
          FROM reference.oem_parts
          ${whereClause}
          ORDER BY brand ASC, category ASC, part_name ASC
        `,
        values
      );

      const counts = countRes.rows[0] ?? { total_count: "0", archived_count: "0", brand_count: "0", fleet_count: "0" };
      return {
        rows: rowsRes.rows,
        total_count: Number(counts.total_count ?? 0),
        archived_count: Number(counts.archived_count ?? 0),
        brand_count: Number(counts.brand_count ?? 0),
        fleet_count: Number(counts.fleet_count ?? 0),
        fleet_only: fleetOnly,
      };
    });

    return payload;
  });

  app.post(basePath, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isCatalogWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedBody = createBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return validationError(reply, parsedBody.error);
    const b = parsedBody.data;

    const created = await withReferenceScope(authUser.uuid, async (client) => {
      if (b.oem_part_number) {
        const conflict = await client.query(
          `
            SELECT id
            FROM reference.oem_parts
            WHERE brand = $1
              AND oem_part_number IS NOT DISTINCT FROM $2
              AND archived_at IS NULL
            LIMIT 1
          `,
          [b.brand, b.oem_part_number]
        );
        if (conflict.rows.length > 0) return { error: "oem_part_brand_number_conflict" as const };
      }

      const res = await client.query(
        `
          INSERT INTO reference.oem_parts (
            brand, model_compat, oem_part_number, part_name, category,
            sub_category, description, unit_cost_usd_typical, default_supplier
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING ${selectColumns()}
        `,
        [
          b.brand,
          b.model_compat ?? null,
          b.oem_part_number ?? null,
          b.part_name,
          b.category,
          b.sub_category ?? null,
          b.description ?? null,
          b.unit_cost_usd_typical ?? null,
          b.default_supplier ?? null,
        ]
      );
      const row = res.rows[0];
      await appendCrudAudit(client, authUser.uuid, "reference.oem_parts_created", {
        resource_id: row?.id,
        resource_type: "reference.oem_parts",
        brand: row?.brand,
        oem_part_number: row?.oem_part_number,
      });
      return { row };
    });

    if ("error" in created) return reply.code(409).send({ error: created.error });
    return reply.code(201).send(created.row);
  });

  app.patch(`${basePath}/:id`, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isCatalogWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return validationError(reply, parsedParams.error);
    const parsedBody = updateBodySchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return validationError(reply, parsedBody.error);
    const b = parsedBody.data;

    const updated = await withReferenceScope(authUser.uuid, async (client) => {
      const current = await client.query<{ brand: string; oem_part_number: string | null }>(
        `SELECT brand, oem_part_number FROM reference.oem_parts WHERE id = $1::uuid`,
        [parsedParams.data.id]
      );
      if (current.rows.length === 0) return { error: "oem_part_row_not_found" as const };
      const nextBrand = b.brand ?? current.rows[0]?.brand;
      const nextPartNumber = b.oem_part_number !== undefined ? b.oem_part_number : current.rows[0]?.oem_part_number;
      if (nextPartNumber) {
        const conflict = await client.query(
          `
            SELECT id
            FROM reference.oem_parts
            WHERE brand = $1
              AND oem_part_number IS NOT DISTINCT FROM $2
              AND archived_at IS NULL
              AND id <> $3::uuid
            LIMIT 1
          `,
          [nextBrand, nextPartNumber, parsedParams.data.id]
        );
        if (conflict.rows.length > 0) return { error: "oem_part_brand_number_conflict" as const };
      }

      const sets: string[] = ["updated_at = now()"];
      const values: unknown[] = [parsedParams.data.id];
      const assign = (column: string, value: unknown) => {
        values.push(value);
        sets.push(`${column} = $${values.length}`);
      };
      if (b.brand !== undefined) assign("brand", b.brand);
      if (b.model_compat !== undefined) assign("model_compat", b.model_compat);
      if (b.oem_part_number !== undefined) assign("oem_part_number", b.oem_part_number);
      if (b.part_name !== undefined) assign("part_name", b.part_name);
      if (b.category !== undefined) assign("category", b.category);
      if (b.sub_category !== undefined) assign("sub_category", b.sub_category);
      if (b.description !== undefined) assign("description", b.description);
      if (b.unit_cost_usd_typical !== undefined) assign("unit_cost_usd_typical", b.unit_cost_usd_typical);
      if (b.default_supplier !== undefined) assign("default_supplier", b.default_supplier);

      const res = await client.query(
        `
          UPDATE reference.oem_parts
          SET ${sets.join(", ")}
          WHERE id = $1::uuid
          RETURNING ${selectColumns()}
        `,
        values
      );
      if (res.rows.length === 0) return { error: "oem_part_row_not_found" as const };
      const row = res.rows[0];
      await appendCrudAudit(client, authUser.uuid, "reference.oem_parts_updated", {
        resource_id: row?.id,
        resource_type: "reference.oem_parts",
      });
      return { row };
    });

    if ("error" in updated) {
      if (updated.error === "oem_part_brand_number_conflict") return reply.code(409).send({ error: updated.error });
      return reply.code(404).send({ error: updated.error });
    }
    return updated.row;
  });

  app.post(`${basePath}/:id/archive`, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isCatalogWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return validationError(reply, parsedParams.error);

    const archived = await withReferenceScope(authUser.uuid, async (client) => {
      const res = await client.query(
        `
          UPDATE reference.oem_parts
          SET archived_at = now(), updated_at = now()
          WHERE id = $1::uuid AND archived_at IS NULL
          RETURNING ${selectColumns()}
        `,
        [parsedParams.data.id]
      );
      if (res.rows.length === 0) return null;
      const row = res.rows[0];
      await appendCrudAudit(client, authUser.uuid, "reference.oem_parts_archived", {
        resource_id: row?.id,
        resource_type: "reference.oem_parts",
      });
      return row;
    });

    if (!archived) return reply.code(404).send({ error: "oem_part_row_not_found" });
    return archived;
  });

  app.post(`${basePath}/:id/restore`, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isCatalogWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return validationError(reply, parsedParams.error);

    const restored = await withReferenceScope(authUser.uuid, async (client) => {
      const res = await client.query(
        `
          UPDATE reference.oem_parts
          SET archived_at = NULL, updated_at = now()
          WHERE id = $1::uuid AND archived_at IS NOT NULL
          RETURNING ${selectColumns()}
        `,
        [parsedParams.data.id]
      );
      if (res.rows.length === 0) return null;
      const row = res.rows[0];
      await appendCrudAudit(client, authUser.uuid, "reference.oem_parts_restored", {
        resource_id: row?.id,
        resource_type: "reference.oem_parts",
      });
      return row;
    });

    if (!restored) return reply.code(404).send({ error: "oem_part_row_not_found" });
    return restored;
  });
}

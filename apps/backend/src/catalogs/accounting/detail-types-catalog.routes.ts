import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../../auth/db.js";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { isCatalogWriteRole } from "../../auth/role-helpers.js";
import { companyQuerySchema, currentAuthUser, idParamSchema, listQuerySchema, validationError } from "./shared.js";

// Block 4 (COA-DETAILTYPE-01) — per-entity Detail Type catalog.
// Detail Type is keyed to a GLOBAL Account Type (catalogs.account_types, read-only taxonomy).
// Rows are either canonical system rows (is_system=true, operating_company_id NULL — immutable,
// visible to every entity) or per-entity custom rows (operating_company_id set, editable).
// Writes always create/edit the CALLER's own non-system rows; system rows are seed-locked in the
// route AND by the RLS write policy (migration 202607011700). No hard delete (void via is_active).
const RATE = { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } } as const;

const createBody = z.object({
  account_type_id: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
  code: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).optional(),
  sort_order: z.coerce.number().int().min(0).max(10000).default(100),
  is_active: z.boolean().default(true),
});
const updateBody = z
  .object({
    name: z.string().trim().min(1).max(160),
    code: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500),
    sort_order: z.coerce.number().int().min(0).max(10000),
    is_active: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "at least one field is required" });

const listWithTypeSchema = listQuerySchema.extend({
  account_type_id: z.string().uuid().optional(),
});

const SELECT_COLS =
  "id, account_type_id, name, code, description, qbo_detail_type_name, sort_order, is_active, is_system, created_at, updated_at";

export function registerDetailTypesCatalogRoutes(app: FastifyInstance) {
  const basePath = "/api/v1/catalogs/accounting/detail-types";

  // Scope the connection to the entity so the RLS policies resolve (withCurrentUser only sets the
  // user id, not app.operating_company_id).
  const scoped = <T>(userUuid: string, opco: string, fn: (client: Parameters<Parameters<typeof withCurrentUser<T>>[1]>[0]) => Promise<T>) =>
    withCurrentUser<T>(userUuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
      return fn(client);
    });

  app.get(basePath, RATE, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsed = listWithTypeSchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const q = parsed.data;
    if (!q.operating_company_id) return reply.code(400).send({ error: "operating_company_id_required" });

    return scoped(authUser.uuid, q.operating_company_id, async (client) => {
      // System rows (opco NULL) + this entity's custom rows.
      const values: unknown[] = [q.operating_company_id];
      const where: string[] = ["(operating_company_id IS NULL OR operating_company_id = $1)"];
      if (q.account_type_id) {
        values.push(q.account_type_id);
        where.push(`account_type_id = $${values.length}`);
      }
      if (q.is_active === "true") where.push("is_active = true");
      if (q.is_active === "false") where.push("is_active = false");
      if (q.search) {
        values.push(`%${q.search}%`);
        where.push(`(name ILIKE $${values.length} OR COALESCE(code,'') ILIKE $${values.length} OR COALESCE(description,'') ILIKE $${values.length})`);
      }
      const whereSql = where.join(" AND ");
      const countRes = await client.query(`SELECT count(*)::text AS total FROM catalogs.detail_types WHERE ${whereSql}`, values);
      values.push(q.limit, q.offset);
      const rowsRes = await client.query(
        `SELECT ${SELECT_COLS} FROM catalogs.detail_types WHERE ${whereSql}
         ORDER BY is_system DESC, sort_order ASC, name ASC
         LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values,
      );
      return { rows: rowsRes.rows, total: Number(countRes.rows[0]?.total ?? 0) };
    });
  });

  app.get(`${basePath}/:id`, RATE, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return validationError(reply, parsedParams.error);
    const parsedQuery = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return validationError(reply, parsedQuery.error);
    if (!parsedQuery.data.operating_company_id) return reply.code(400).send({ error: "operating_company_id_required" });

    const row = await scoped(authUser.uuid, parsedQuery.data.operating_company_id, async (client) => {
      const res = await client.query(
        `SELECT ${SELECT_COLS} FROM catalogs.detail_types
         WHERE id = $1 AND (operating_company_id IS NULL OR operating_company_id = $2) LIMIT 1`,
        [parsedParams.data.id, parsedQuery.data.operating_company_id],
      );
      return res.rows[0] ?? null;
    });
    if (!row) return reply.code(404).send({ error: "catalog_detail_type_not_found" });
    return row;
  });

  app.post(basePath, RATE, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isCatalogWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedQuery = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return validationError(reply, parsedQuery.error);
    const opco = parsedQuery.data.operating_company_id;
    if (!opco) return reply.code(400).send({ error: "operating_company_id_required" });
    const parsedBody = createBody.safeParse(req.body ?? {});
    if (!parsedBody.success) return validationError(reply, parsedBody.error);
    const b = parsedBody.data;

    const created = await scoped(authUser.uuid, opco, async (client) => {
      const res = await client.query(
        `INSERT INTO catalogs.detail_types
           (account_type_id, operating_company_id, name, code, description, sort_order, is_active, is_system)
         VALUES ($1,$2,$3,$4,$5,$6,$7,false)
         RETURNING id`,
        [b.account_type_id, opco, b.name, b.code ?? null, b.description ?? null, b.sort_order, b.is_active],
      );
      const id = res.rows[0]?.id as string;
      await appendCrudAudit(client, authUser.uuid, "catalog.detail_type.create", {
        id,
        account_type_id: b.account_type_id,
        name: b.name,
        operating_company_id: opco,
      });
      return id;
    });
    return reply.code(201).send({ id: created });
  });

  app.patch(`${basePath}/:id`, RATE, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isCatalogWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return validationError(reply, parsedParams.error);
    const parsedQuery = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return validationError(reply, parsedQuery.error);
    const opco = parsedQuery.data.operating_company_id;
    if (!opco) return reply.code(400).send({ error: "operating_company_id_required" });
    const parsedBody = updateBody.safeParse(req.body ?? {});
    if (!parsedBody.success) return validationError(reply, parsedBody.error);
    const b = parsedBody.data;

    const result = await scoped(authUser.uuid, opco, async (client) => {
      // Explicit guard for a clean error (RLS also blocks system-row writes).
      const cur = await client.query<{ is_system: boolean }>(
        `SELECT is_system FROM catalogs.detail_types WHERE id = $1 AND (operating_company_id IS NULL OR operating_company_id = $2) LIMIT 1`,
        [parsedParams.data.id, opco],
      );
      if (!cur.rows[0]) return { status: 404 as const };
      if (cur.rows[0].is_system) return { status: 409 as const };
      const setParts: string[] = [];
      const values: unknown[] = [];
      const add = (name: string, value: unknown) => {
        values.push(value);
        setParts.push(`${name} = $${values.length}`);
      };
      if (b.name !== undefined) add("name", b.name);
      if (b.code !== undefined) add("code", b.code);
      if (b.description !== undefined) add("description", b.description);
      if (b.sort_order !== undefined) add("sort_order", b.sort_order);
      if (b.is_active !== undefined) add("is_active", b.is_active);
      add("updated_at", new Date().toISOString());
      values.push(parsedParams.data.id, opco);
      const res = await client.query(
        `UPDATE catalogs.detail_types SET ${setParts.join(", ")}
         WHERE id = $${values.length - 1} AND operating_company_id = $${values.length} AND is_system = false
         RETURNING id`,
        values,
      );
      if (res.rows[0]) {
        await appendCrudAudit(client, authUser.uuid, "catalog.detail_type.update", {
          id: parsedParams.data.id,
          operating_company_id: opco,
          fields: Object.keys(b),
        });
      }
      return { status: res.rows[0] ? (200 as const) : (404 as const) };
    });
    if (result.status === 404) return reply.code(404).send({ error: "catalog_detail_type_not_found" });
    if (result.status === 409) return reply.code(409).send({ error: "detail_type_is_system" });
    return { ok: true };
  });

  // Void-not-delete: deactivate (is_active=false). System rows are seed-locked.
  app.delete(`${basePath}/:id`, RATE, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!isCatalogWriteRole(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = idParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return validationError(reply, parsedParams.error);
    const parsedQuery = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return validationError(reply, parsedQuery.error);
    const opco = parsedQuery.data.operating_company_id;
    if (!opco) return reply.code(400).send({ error: "operating_company_id_required" });

    const result = await scoped(authUser.uuid, opco, async (client) => {
      const cur = await client.query<{ is_system: boolean }>(
        `SELECT is_system FROM catalogs.detail_types WHERE id = $1 AND (operating_company_id IS NULL OR operating_company_id = $2) LIMIT 1`,
        [parsedParams.data.id, opco],
      );
      if (!cur.rows[0]) return { status: 404 as const };
      if (cur.rows[0].is_system) return { status: 409 as const };
      await client.query(
        `UPDATE catalogs.detail_types SET is_active = false, updated_at = now()
         WHERE id = $1 AND operating_company_id = $2 AND is_system = false`,
        [parsedParams.data.id, opco],
      );
      await appendCrudAudit(client, authUser.uuid, "catalog.detail_type.deactivate", {
        id: parsedParams.data.id,
        operating_company_id: opco,
      });
      return { status: 200 as const };
    });
    if (result.status === 404) return reply.code(404).send({ error: "catalog_detail_type_not_found" });
    if (result.status === 409) return reply.code(409).send({ error: "detail_type_is_system" });
    return { ok: true };
  });
}

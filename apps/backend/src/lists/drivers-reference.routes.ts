import type { FastifyInstance } from "fastify";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { isCatalogWriteRole } from "../auth/role-helpers.js";
import { withCurrentUser } from "../auth/db.js";
import {
  assertReferenceConfig,
  createBodySchema,
  currentAuthUser,
  DRIVERS_REFERENCE_CONFIGS,
  idParamSchema,
  listQuerySchema,
  selectColumns,
  updateBodySchema,
  validationError,
  type DriversReferenceConfig,
} from "./drivers-reference.shared.js";

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

async function withReferenceScope<T>(userId: string, fn: (client: Queryable) => Promise<T>) {
  return withCurrentUser(userId, async (client) => fn(client as Queryable));
}

function registerReferenceRoutes(app: FastifyInstance, config: DriversReferenceConfig) {
  assertReferenceConfig(config);
  const basePath = `/api/v1/lists/drivers/${config.urlSegment}`;

  app.get(basePath, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsed = listQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const q = parsed.data;

    const payload = await withReferenceScope(authUser.uuid, async (client) => {
      const values: unknown[] = [];
      const where: string[] = [];
      if (!q.include_archived) where.push("archived_at IS NULL");
      if (q.search) {
        values.push(`%${q.search}%`);
        where.push(`(code ILIKE $${values.length} OR label ILIKE $${values.length})`);
      }
      const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

      const countRes = await client.query<{ total_count: string; archived_count: string }>(
        `
          SELECT
            count(*) FILTER (WHERE archived_at IS NULL)::text AS total_count,
            count(*) FILTER (WHERE archived_at IS NOT NULL)::text AS archived_count
          FROM reference.${config.tableName}
        `
      );
      const rowsRes = await client.query(
        `
          SELECT ${selectColumns()}
          FROM reference.${config.tableName}
          ${whereClause}
          ORDER BY sort_order ASC, code ASC
        `,
        values
      );

      const counts = countRes.rows[0] ?? { total_count: "0", archived_count: "0" };
      return {
        rows: rowsRes.rows,
        total_count: Number(counts.total_count ?? 0),
        archived_count: Number(counts.archived_count ?? 0),
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
      const conflict = await client.query(
        `
          SELECT id
          FROM reference.${config.tableName}
          WHERE lower(code) = lower($1)
            AND archived_at IS NULL
          LIMIT 1
        `,
        [b.code]
      );
      if (conflict.rows.length > 0) return { error: "drivers_reference_code_conflict" as const };

      const res = await client.query(
        `
          INSERT INTO reference.${config.tableName} (code, label, sort_order)
          VALUES ($1, $2, $3)
          RETURNING ${selectColumns()}
        `,
        [b.code, b.label, b.sort_order ?? 50]
      );
      const row = res.rows[0];
      await appendCrudAudit(client, authUser.uuid, `reference.${config.tableName}_created`, {
        resource_id: row?.id,
        resource_type: `reference.${config.tableName}`,
        code: row?.code,
        catalog_display_name: config.displayName,
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
      if (b.code) {
        const conflict = await client.query(
          `
            SELECT id
            FROM reference.${config.tableName}
            WHERE lower(code) = lower($1)
              AND archived_at IS NULL
              AND id <> $2::uuid
            LIMIT 1
          `,
          [b.code, parsedParams.data.id]
        );
        if (conflict.rows.length > 0) return { error: "drivers_reference_code_conflict" as const };
      }

      const sets: string[] = ["updated_at = now()"];
      const values: unknown[] = [parsedParams.data.id];
      if (b.code !== undefined) {
        values.push(b.code);
        sets.push(`code = $${values.length}`);
      }
      if (b.label !== undefined) {
        values.push(b.label);
        sets.push(`label = $${values.length}`);
      }
      if (b.sort_order !== undefined) {
        values.push(b.sort_order);
        sets.push(`sort_order = $${values.length}`);
      }

      const res = await client.query(
        `
          UPDATE reference.${config.tableName}
          SET ${sets.join(", ")}
          WHERE id = $1::uuid
          RETURNING ${selectColumns()}
        `,
        values
      );
      if (res.rows.length === 0) return { error: "drivers_reference_row_not_found" as const };
      const row = res.rows[0];
      await appendCrudAudit(client, authUser.uuid, `reference.${config.tableName}_updated`, {
        resource_id: row?.id,
        resource_type: `reference.${config.tableName}`,
        catalog_display_name: config.displayName,
      });
      return { row };
    });

    if ("error" in updated) {
      if (updated.error === "drivers_reference_code_conflict") return reply.code(409).send({ error: updated.error });
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
          UPDATE reference.${config.tableName}
          SET archived_at = now(), updated_at = now()
          WHERE id = $1::uuid AND archived_at IS NULL
          RETURNING ${selectColumns()}
        `,
        [parsedParams.data.id]
      );
      if (res.rows.length === 0) return null;
      const row = res.rows[0];
      await appendCrudAudit(client, authUser.uuid, `reference.${config.tableName}_archived`, {
        resource_id: row?.id,
        resource_type: `reference.${config.tableName}`,
        catalog_display_name: config.displayName,
      });
      return row;
    });

    if (!archived) return reply.code(404).send({ error: "drivers_reference_row_not_found" });
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
          UPDATE reference.${config.tableName}
          SET archived_at = NULL, updated_at = now()
          WHERE id = $1::uuid AND archived_at IS NOT NULL
          RETURNING ${selectColumns()}
        `,
        [parsedParams.data.id]
      );
      if (res.rows.length === 0) return null;
      const row = res.rows[0];
      await appendCrudAudit(client, authUser.uuid, `reference.${config.tableName}_restored`, {
        resource_id: row?.id,
        resource_type: `reference.${config.tableName}`,
        catalog_display_name: config.displayName,
      });
      return row;
    });

    if (!restored) return reply.code(404).send({ error: "drivers_reference_row_not_found" });
    return restored;
  });
}

export async function registerDriversReferenceRoutes(app: FastifyInstance) {
  for (const config of DRIVERS_REFERENCE_CONFIGS) {
    registerReferenceRoutes(app, config);
  }
}

/**
 * M2: Position History API Routes
 * Tracks history of positioned-part assignments for Integrity/Abuse detection
 */

import { z } from "zod";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { withCurrentUser } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";
import { appendCrudAudit } from "../../audit/crud-audit.js";

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

async function withCompany<T>(userId: string, companyId: string, fn: (client: { query: <R = Record<string, unknown>>(sql: string, vals?: unknown[]) => Promise<{ rows: R[] }> }) => Promise<T>) {
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [companyId]);
    return fn(client as Parameters<typeof fn>[0]);
  });
}

const listQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  unit_id: z.string().uuid().optional(),
  part_id: z.string().uuid().optional(),
  position_set_id: z.string().uuid().optional(),
  action: z.enum(["installed", "removed", "replaced"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const createSchema = z.object({
  operating_company_id: z.string().uuid(),
  unit_id: z.string().uuid(),
  unit_type: z.enum(["truck", "trailer", "reefer"]),
  position_set_id: z.string().uuid(),
  position_code: z.string().min(1).max(20),
  part_id: z.string().uuid().optional(),
  part_number: z.string().max(100).optional(),
  action: z.enum(["installed", "removed", "replaced"]),
  action_reason: z.string().max(500).optional(),
  action_at: z.string().datetime().optional(),
  source_type: z.enum(["work_order", "manual_entry", "bulk_import"]).optional(),
  source_id: z.string().uuid().optional(),
  notes: z.string().max(1000).optional(),
});

const idParamSchema = z.object({ id: z.string().uuid() });

export async function positionHistoryRoutes(fastify: FastifyInstance) {
  fastify.get("/api/v1/safety/position-history", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = authUser(req, reply);
    if (!user) return;

    const parsed = listQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    }
    const q = parsed.data;

    return withCompany(user.uuid, q.operating_company_id, async (client: any) => {
      const values: unknown[] = [q.operating_company_id];
      const where = ["ph.operating_company_id = $1"];
      let paramIdx = 1;

      if (q.unit_id) {
        values.push(q.unit_id);
        where.push(`ph.unit_id = $${++paramIdx}`);
      }
      if (q.part_id) {
        values.push(q.part_id);
        where.push(`ph.part_id = $${++paramIdx}`);
      }
      if (q.position_set_id) {
        values.push(q.position_set_id);
        where.push(`ph.position_set_id = $${++paramIdx}`);
      }
      if (q.action) {
        values.push(q.action);
        where.push(`ph.action = $${++paramIdx}`);
      }

      const countRes = await client.query(
        `SELECT count(*)::text AS total FROM maint.position_history ph WHERE ${where.join(" AND ")}`,
        values
      );

      values.push(q.limit, q.offset);
      const rowsRes = await client.query(
        `SELECT 
          ph.*,
          u.unit_number as unit_number,
          u.license_plate as unit_license_plate,
          ps.name as position_set_name,
          p.part_name as part_name
        FROM maint.position_history ph
        LEFT JOIN mdata.units u ON u.id = ph.unit_id
        LEFT JOIN maint.position_set ps ON ps.id = ph.position_set_id
        LEFT JOIN maint.part p ON p.id = ph.part_id
        WHERE ${where.join(" AND ")}
        ORDER BY ph.action_at DESC
        LIMIT $${++paramIdx} OFFSET $${++paramIdx}`,
        values
      );

      return {
        rows: rowsRes.rows,
        total: Number(countRes.rows[0]?.total ?? 0),
        limit: q.limit,
        offset: q.offset,
      };
    });
  });

  fastify.get("/api/v1/safety/position-history/:id", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = authUser(req, reply);
    if (!user) return;

    const parsed = idParamSchema.safeParse(req.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    }
    const { id } = parsed.data;

    const queryParsed = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
    if (!queryParsed.success) {
      return reply.code(400).send({ error: "validation_error", details: queryParsed.error.flatten() });
    }
    const { operating_company_id } = queryParsed.data;

    return withCompany(user.uuid, operating_company_id, async (client: any) => {
      const result = await client.query(
        `SELECT 
          ph.*,
          u.unit_number as unit_number,
          u.license_plate as unit_license_plate,
          ps.name as position_set_name,
          p.part_name as part_name
        FROM maint.position_history ph
        LEFT JOIN mdata.units u ON u.id = ph.unit_id
        LEFT JOIN maint.position_set ps ON ps.id = ph.position_set_id
        LEFT JOIN maint.part p ON p.id = ph.part_id
        WHERE ph.id = $1 AND ph.operating_company_id = $2
        LIMIT 1`,
        [id, operating_company_id]
      );

      if (result.rows.length === 0) {
        return reply.code(404).send({ error: "not_found" });
      }

      return result.rows[0];
    });
  });

  fastify.post("/api/v1/safety/position-history", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = authUser(req, reply);
    if (!user) return;

    const parsed = createSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    }
    const data = parsed.data;

    return withCompany(user.uuid, data.operating_company_id, async (client: any) => {
      const actorResult = await client.query(
        `SELECT display_name FROM identity.users WHERE id = $1`,
        [user.uuid]
      );
      const actorName = actorResult.rows[0]?.display_name ?? "";

      const result = await client.query(
        `INSERT INTO maint.position_history (
          operating_company_id, unit_id, unit_type, position_set_id, position_code,
          part_id, part_number, action, action_reason, actor_id, actor_name, action_at,
          source_type, source_id, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, COALESCE($12, now()), $13, $14, $15)
        RETURNING *`,
        [
          data.operating_company_id, data.unit_id, data.unit_type, data.position_set_id,
          data.position_code, data.part_id ?? null, data.part_number ?? null, data.action,
          data.action_reason ?? null, user.uuid, actorName, data.action_at ?? null,
          data.source_type ?? null, data.source_id ?? null, data.notes ?? null,
        ]
      );

      const row = result.rows[0];
      if (row) {
        await appendCrudAudit(
          client,
          user.uuid,
          "maint.position_history.created",
          {
            resource_type: "maint.position_history",
            resource_id: row.id,
            operating_company_id: data.operating_company_id,
            unit_id: data.unit_id,
            position_code: data.position_code,
            action: data.action,
            part_id: data.part_id ?? null,
          },
          "info",
          "M2-INTEGRITY-POSITION-HISTORY"
        );
      }

      return reply.code(201).send(row);
    });
  });

  fastify.get("/api/v1/safety/position-history/timeline/:unit_id/:position_code", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = authUser(req, reply);
    if (!user) return;

    const paramsParsed = z.object({
      unit_id: z.string().uuid(),
      position_code: z.string().min(1),
    }).safeParse(req.params);

    if (!paramsParsed.success) {
      return reply.code(400).send({ error: "validation_error", details: paramsParsed.error.flatten() });
    }
    const { unit_id, position_code } = paramsParsed.data;

    const queryParsed = z.object({
      operating_company_id: z.string().uuid(),
      limit: z.coerce.number().int().min(1).max(100).default(20),
    }).safeParse(req.query ?? {});

    if (!queryParsed.success) {
      return reply.code(400).send({ error: "validation_error", details: queryParsed.error.flatten() });
    }
    const { operating_company_id, limit } = queryParsed.data;

    return withCompany(user.uuid, operating_company_id, async (client: any) => {
      const result = await client.query(
        `SELECT 
          ph.*,
          u.unit_number as unit_number,
          u.license_plate as unit_license_plate,
          ps.name as position_set_name,
          p.part_name as part_name
        FROM maint.position_history ph
        LEFT JOIN mdata.units u ON u.id = ph.unit_id
        LEFT JOIN maint.position_set ps ON ps.id = ph.position_set_id
        LEFT JOIN maint.part p ON p.id = ph.part_id
        WHERE ph.operating_company_id = $1
          AND ph.unit_id = $2
          AND ph.position_code = $3
        ORDER BY ph.action_at DESC
        LIMIT $4`,
        [operating_company_id, unit_id, position_code, limit]
      );

      return {
        rows: result.rows,
        unit_id,
        position_code,
        limit,
      };
    });
  });
}

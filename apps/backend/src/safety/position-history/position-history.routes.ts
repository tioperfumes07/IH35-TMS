/**
 * M2: Position History API Routes
 * Tracks history of positioned-part assignments for Integrity/Abuse detection
 */

import { z } from "zod";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { withCurrentUser } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { assertCompanyMembership } from "../../_helpers/company-membership-guard.js";

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

async function withCompany<T>(userId: string, companyId: string, fn: (client: { query: <R = Record<string, unknown>>(sql: string, vals?: unknown[]) => Promise<{ rows: R[] }> }) => Promise<T>) {
  await assertCompanyMembership(userId, companyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
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

/**
 * SWEEP-C2 landed the CODE repoint from maint.position_history to the canonical
 * maintenance.position_history, but its migration (202609020000_c2_maintenance_position_history_
 * canonical.sql) is HELD and still unapplied on prod — verified 2026-07-27 on br-fancy-credit-akjnd07a:
 * to_regclass('maintenance.position_history') IS NULL while the RETIRE table maint.position_history
 * still exists. The code therefore shipped AHEAD of its schema, and every one of these four endpoints
 * threw a raw 42P01 — a 500 with a Postgres stack — on a Safety tab that is mounted and reachable
 * (index.ts:955; the deployed build 9c09c8b carries it).
 *
 * Until the owner applies the migration this refuses HONESTLY instead of 500-ing: the caller is told
 * exactly which migration is missing and that nothing was read or written. A 500 says "we are broken";
 * a 503 naming the blocker says "this is switched off pending a known step", which is the difference
 * between an outage and a gate. Same shape as the claim-economics precedent in insurance/claim.routes.ts.
 *
 * Positive-only cache: the table appears when the migration is applied and never disappears
 * (void-not-delete), so a proven-present result is permanent, while caching "absent" would keep the
 * tab dark until the process restarts even after a successful apply.
 */
const CANONICAL_TABLE = "maintenance.position_history";
const REQUIRED_MIGRATION = "202609020000_c2_maintenance_position_history_canonical.sql";
let canonicalTableProven = false;

type QueryClient = { query: <R = Record<string, unknown>>(sql: string, vals?: unknown[]) => Promise<{ rows: R[] }> };

async function canonicalTableReady(client: QueryClient) {
  if (canonicalTableProven) return true;
  const res = await client.query<{ present: boolean }>(
    "SELECT to_regclass($1) IS NOT NULL AS present",
    [CANONICAL_TABLE]
  );
  canonicalTableProven = res.rows[0]?.present === true;
  return canonicalTableProven;
}

function sendCanonicalTableMissing(reply: FastifyReply) {
  return reply.code(503).send({
    error: "position_history_canonical_table_missing",
    message:
      `Position History is unavailable: ${CANONICAL_TABLE} does not exist on this database. ` +
      `The SWEEP-C2 code repoint is deployed but migration ${REQUIRED_MIGRATION} has not been applied yet. ` +
      `Nothing was read or written. The owner must apply that migration on Neon.`,
    required_migration: REQUIRED_MIGRATION,
  });
}

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
      if (!(await canonicalTableReady(client))) return sendCanonicalTableMissing(reply);
      const values: unknown[] = [q.operating_company_id];
      const where = ["ph.operating_company_id = $1::uuid"];
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
        `SELECT count(*)::text AS total FROM maintenance.position_history ph WHERE ${where.join(" AND ")}`,
        values
      );

      values.push(q.limit, q.offset);
      const rowsRes = await client.query(
        `SELECT 
          ph.*,
          u.unit_number as unit_number,
          u.license_plate as unit_license_plate,
          ps.display_name as position_set_name,
          p.name as part_name
        FROM maintenance.position_history ph
        LEFT JOIN mdata.units u ON u.id = ph.unit_id
          AND (u.owner_company_id = $1 OR u.currently_leased_to_company_id = $1)
        LEFT JOIN maint.position_set ps ON ps.id = ph.position_set_id
          AND ps.operating_company_id = $1::uuid
        LEFT JOIN maint.part p ON p.id = ph.part_id
          AND p.tenant_id = $1::uuid
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
      if (!(await canonicalTableReady(client))) return sendCanonicalTableMissing(reply);
      const result = await client.query(
        `SELECT 
          ph.*,
          u.unit_number as unit_number,
          u.license_plate as unit_license_plate,
          ps.display_name as position_set_name,
          p.name as part_name
        FROM maintenance.position_history ph
        LEFT JOIN mdata.units u ON u.id = ph.unit_id
          AND (u.owner_company_id = $2 OR u.currently_leased_to_company_id = $2)
        LEFT JOIN maint.position_set ps ON ps.id = ph.position_set_id
          AND ps.operating_company_id = $2::uuid
        LEFT JOIN maint.part p ON p.id = ph.part_id
          AND p.tenant_id = $2::uuid
        WHERE ph.id = $1 AND ph.operating_company_id = $2::uuid
        LIMIT 1`,
        [id, operating_company_id]
      );

      if (result.rows.length === 0) {
        return reply.code(404).send({ error: "not_found" });
      }

      return result.rows[0];
    });
  });

  fastify.post("/api/v1/safety/position-history", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = authUser(req, reply);
    if (!user) return;

    const parsed = createSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    }
    const data = parsed.data;

    return withCompany(user.uuid, data.operating_company_id, async (client: any) => {
      if (!(await canonicalTableReady(client))) return sendCanonicalTableMissing(reply);
      const linked = await client.query(
        `SELECT
           EXISTS (
             SELECT 1 FROM mdata.units u
              WHERE u.id = $2::uuid
                AND u.deactivated_at IS NULL
                AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = $1::uuid
           ) AS unit_ok,
           EXISTS (
             SELECT 1 FROM maint.position_set ps
              WHERE ps.id = $3::uuid
                AND ps.operating_company_id = $1::uuid
                AND ps.is_active = true
                AND ps.positions @> jsonb_build_array(jsonb_build_object('code', $4::text))
           ) AS position_ok,
           ($5::uuid IS NULL OR EXISTS (
             SELECT 1 FROM maint.part p
              WHERE p.id = $5::uuid AND p.tenant_id = $1::uuid
           )) AS part_ok`,
        [data.operating_company_id, data.unit_id, data.position_set_id, data.position_code, data.part_id ?? null]
      );
      const validity = linked.rows[0];
      if (!validity?.unit_ok) return reply.code(404).send({ error: "mdata_unit_not_found" });
      if (!validity?.position_ok) return reply.code(404).send({ error: "position_not_found" });
      if (!validity?.part_ok) return reply.code(404).send({ error: "part_not_found" });
      // CLS-SCHEMA-DRIFT / PHANTOM COLUMN — prod-verified 2026-08-07: identity.users has
      // first_name / last_name / email and NO display_name, so this SELECT threw 42703 and every
      // POST to this route 500'd before a position-history row could be written. Composed the same way
      // as every other actor-name read in the repo (tasks/task.routes.ts, opening-balance-register):
      // "First Last", falling back to email when neither name is set, never a blank attribution on an
      // append-only history row.
      // No type argument: `client` is `any` inside withCompany, and an untyped call cannot take one.
      const actorResult = await client.query(
        `SELECT COALESCE(NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)), ''), email) AS actor_name
         FROM identity.users WHERE id = $1`,
        [user.uuid]
      );
      const actorName = actorResult.rows[0]?.actor_name ?? "";

      const result = await client.query(
        `INSERT INTO maintenance.position_history (
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
      if (!row?.id) throw new Error("maintenance_position_history_insert_failed");
      await appendCrudAudit(
          client,
          user.uuid,
          "maintenance.position_history.created",
          {
            resource_type: "maintenance.position_history",
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
      if (!(await canonicalTableReady(client))) return sendCanonicalTableMissing(reply);
      const result = await client.query(
        `SELECT 
          ph.*,
          u.unit_number as unit_number,
          u.license_plate as unit_license_plate,
          ps.display_name as position_set_name,
          p.name as part_name
        FROM maintenance.position_history ph
        LEFT JOIN mdata.units u ON u.id = ph.unit_id
          AND (u.owner_company_id = $1 OR u.currently_leased_to_company_id = $1)
        LEFT JOIN maint.position_set ps ON ps.id = ph.position_set_id
          AND ps.operating_company_id = $1::uuid
        LEFT JOIN maint.part p ON p.id = ph.part_id
          AND p.tenant_id = $1::uuid
        WHERE ph.operating_company_id = $1::uuid
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

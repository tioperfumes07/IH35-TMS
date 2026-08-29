import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { appendCrudAudit } from "../audit/crud-audit.js";

const companyQuery = z.object({ operating_company_id: z.string().uuid() });
const idParams = z.object({ id: z.string().uuid() });

const partUsedSchema = z.object({
  part_id: z.string().uuid(),
  qty: z.number().int().positive(),
  unit_cost_cents: z.number().int().min(0),
});

const createLaborBody = z.object({
  operating_company_id: z.string().uuid(),
  work_order_id: z.string().uuid(),
  mechanic_user_id: z.string().uuid().optional().nullable(),
  mechanic_employee_id: z.string().uuid().optional().nullable(),
  unit_id: z.string().uuid(),
  start_time: z.string().trim().min(1),
  end_time: z.string().trim().min(1).optional().nullable(),
  hourly_rate_cents: z.number().int().min(0),
  parts_used: z.array(partUsedSchema).default([]),
  notes: z.string().trim().max(4000).optional().nullable(),
});

const closeLaborBody = z.object({
  operating_company_id: z.string().uuid(),
  end_time: z.string().trim().min(1),
  parts_used: z.array(partUsedSchema).optional(),
  notes: z.string().trim().max(4000).optional().nullable(),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return reply;
  return req.user;
}

async function withCompany<T>(userId: string, companyId: string, fn: (client: any) => Promise<T>): Promise<T> {
  await assertCompanyMembership(userId, companyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    return fn(client);
  });
}

function computePartsCost(partsUsed: Array<{ qty: number; unit_cost_cents: number }>) {
  return partsUsed.reduce((sum, p) => sum + p.qty * p.unit_cost_cents, 0);
}

class InternalLaborPartConflictError extends Error {
  constructor(public readonly partId: string) {
    super("internal_labor_part_not_found_or_insufficient_stock");
    this.name = "InternalLaborPartConflictError";
  }
}

export async function internalLaborRoutes(app: FastifyInstance) {
  // GET /api/v1/maintenance/internal-labor?operating_company_id=&work_order_id=
  app.get("/api/v1/maintenance/internal-labor", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const q = z.object({
      operating_company_id: z.string().uuid(),
      work_order_id: z.string().uuid().optional(),
      mechanic_user_id: z.string().uuid().optional(),
      unit_id: z.string().uuid().optional(),
      from_date: z.string().optional(),
      to_date: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
      offset: z.coerce.number().int().min(0).default(0),
    }).parse(req.query);

    const rows = await withCompany(user.uuid, q.operating_company_id, async (client) => {
      const conditions: string[] = ["il.operating_company_id = $1::uuid", "il.is_active = true"];
      const params: unknown[] = [q.operating_company_id];
      let idx = 2;

      if (q.work_order_id) { conditions.push(`il.work_order_id = $${idx++}`); params.push(q.work_order_id); }
      if (q.mechanic_user_id) { conditions.push(`il.mechanic_user_id = $${idx++}`); params.push(q.mechanic_user_id); }
      if (q.unit_id) { conditions.push(`il.unit_id = $${idx++}`); params.push(q.unit_id); }
      if (q.from_date) { conditions.push(`il.start_time >= $${idx++}`); params.push(q.from_date); }
      if (q.to_date) { conditions.push(`il.start_time <= $${idx++}`); params.push(q.to_date); }

      params.push(q.limit, q.offset);

      const { rows } = await client.query(`
        SELECT il.*,
               u.first_name || ' ' || u.last_name AS mechanic_name,
               wo.display_id AS wo_number
        FROM maintenance.internal_labor_log il
        LEFT JOIN identity.users u ON u.id = il.mechanic_user_id
        LEFT JOIN maintenance.work_orders wo ON wo.id = il.work_order_id
                                               AND wo.operating_company_id = il.operating_company_id
        WHERE ${conditions.join(" AND ")}
        ORDER BY il.start_time DESC
        LIMIT $${idx++} OFFSET $${idx++}
      `, params);
      return rows;
    });

    reply.send({ data: rows });
  });

  // GET /api/v1/maintenance/internal-labor/productivity-report
  app.get("/api/v1/maintenance/internal-labor/productivity-report", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const q = z.object({
      operating_company_id: z.string().uuid(),
      from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }).parse(req.query);

    const rows = await withCompany(user.uuid, q.operating_company_id, async (client) => {
      const { rows } = await client.query(`
        SELECT
          il.mechanic_user_id,
          u.first_name || ' ' || u.last_name AS mechanic_name,
          count(il.id) AS job_count,
          round(sum(il.hours), 2) AS total_hours,
          sum(il.labor_cost_cents) AS total_labor_cost_cents,
          sum(il.total_parts_cost_cents) AS total_parts_cost_cents,
          sum(il.labor_cost_cents + il.total_parts_cost_cents) AS total_cost_cents
        FROM maintenance.internal_labor_log il
        LEFT JOIN identity.users u ON u.id = il.mechanic_user_id
        WHERE il.start_time BETWEEN $1 AND $2
          AND il.operating_company_id = $3::uuid
          AND il.is_active = true
          AND il.end_time IS NOT NULL
        GROUP BY il.mechanic_user_id, mechanic_name
        ORDER BY total_hours DESC NULLS LAST
      `, [q.from_date, q.to_date, q.operating_company_id]);
      return rows;
    });

    reply.send({ data: rows });
  });

  // POST /api/v1/maintenance/internal-labor — start labor entry
  app.post("/api/v1/maintenance/internal-labor", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const body = createLaborBody.parse(req.body);
    const totalPartsCost = computePartsCost(body.parts_used);

    const row = await withCompany(user.uuid, body.operating_company_id, async (client) => {
      const linked = await client.query(
        `SELECT wo.id
           FROM maintenance.work_orders wo
           JOIN mdata.units u ON u.id = $3::uuid
          WHERE wo.id = $2::uuid
            AND wo.operating_company_id = $1::uuid
            AND wo.unit_id = u.id
            AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = $1::uuid
            AND u.deactivated_at IS NULL
          LIMIT 1`,
        [body.operating_company_id, body.work_order_id, body.unit_id]
      );
      if (!linked.rows[0]) return null;
      const { rows } = await client.query(`
        INSERT INTO maintenance.internal_labor_log (
          operating_company_id, tenant_id,
          work_order_id, mechanic_user_id, mechanic_employee_id,
          unit_id, start_time, end_time,
          hourly_rate_cents,
          parts_used, total_parts_cost_cents, notes
        ) VALUES ($1,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        RETURNING *
      `, [
        body.operating_company_id,
        body.work_order_id,
        body.mechanic_user_id ?? null,
        body.mechanic_employee_id ?? null,
        body.unit_id,
        body.start_time,
        body.end_time ?? null,
        body.hourly_rate_cents,
        JSON.stringify(body.parts_used),
        totalPartsCost,
        body.notes ?? null,
      ]);
      const createdLabor = rows[0];
      if (!createdLabor?.id) throw new Error("internal_labor_create_returned_no_row");
      await appendCrudAudit(client, user.uuid, "maintenance.internal_labor.created", {
        resource_type: "maintenance.internal_labor_log",
        resource_id: createdLabor.id,
        operating_company_id: body.operating_company_id,
        work_order_id: body.work_order_id,
        unit_id: body.unit_id,
      });
      return createdLabor;
    });

    if (!row) return reply.code(400).send({ error: "linked_entity_not_in_operating_company" });
    reply.code(201).send({ data: row });
  });

  // POST /api/v1/maintenance/internal-labor/:id/close
  // Closes labor entry (sets end_time), decrements parts inventory, posts JE
  app.post("/api/v1/maintenance/internal-labor/:id/close", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const { id } = idParams.parse(req.params);
    const body = closeLaborBody.parse(req.body);

    let result: Record<string, unknown> | null;
    try {
      result = await withCompany(user.uuid, body.operating_company_id, async (client) => {
        // withCurrentUser owns the transaction. Keep the row lock, mutation, inventory decrement,
        // and audit in that single outer transaction so any part conflict rolls the close back.
        const { rows: existing } = await client.query(
          `SELECT *
             FROM maintenance.internal_labor_log
            WHERE id = $1
              AND operating_company_id = $2::uuid
              AND is_active = true
              AND end_time IS NULL
            FOR UPDATE`,
          [id, body.operating_company_id]
        );
        if (!existing[0]) return null;
        const entry = existing[0];
        const partsUsed = body.parts_used ?? entry.parts_used ?? [];
        const totalPartsCost = computePartsCost(partsUsed);

        const { rows: updated } = await client.query(`
          UPDATE maintenance.internal_labor_log
          SET end_time = $2,
              parts_used = $3,
              total_parts_cost_cents = $4,
              notes = COALESCE($5, notes),
              updated_at = now()
          WHERE id = $1
            AND operating_company_id = $6::uuid
            AND is_active = true
            AND end_time IS NULL
          RETURNING *
        `, [id, body.end_time, JSON.stringify(partsUsed), totalPartsCost, body.notes ?? null, body.operating_company_id]);

        const closed = updated[0];
        if (!closed) return null;

        for (const part of partsUsed) {
          const decremented = await client.query(`
            UPDATE maintenance.parts_inventory
            SET on_hand_qty = on_hand_qty - $1,
                updated_at = now()
            WHERE id = $2
              AND operating_company_id = $3::uuid
              AND on_hand_qty >= $1
            RETURNING id
          `, [part.qty, part.part_id, body.operating_company_id]);
          if (!decremented.rows[0]) throw new InternalLaborPartConflictError(part.part_id);
        }

      // 4. GL POSTING — REMOVED (was a DEFECT): this previously INSERTed a `status='posted'`
      // accounting.journal_entries HEADER with NO journal_entry_postings LINES — an unbalanced, empty JE
      // (header total 0, no DR/CR), which corrupts the ledger and can never tie out. Per the void-not-fake
      // and "no new GL math solo / reuse the existing poster" rules, we STOP writing the broken lineless JE
      // rather than post a mis-derived entry. Closing the WO still updates the labor log + decrements parts
      // inventory (above); it simply no longer creates an invalid JE.
      //
      // FOLLOW-UP (build-and-HOLD, owner-reviewed): if internal WO labor/parts should hit the GL, post a
      // BALANCED entry through the EXISTING posting engine — DR Vehicle Maintenance Expense, CR Internal
      // Labor Recovery (labor portion), CR Parts Inventory (parts portion) — behind a default-OFF per-entity
      // flag, with the three accounts resolved via the CoA role resolver (no hardcoded account math here).

        await appendCrudAudit(client, user.uuid, "maintenance.internal_labor.closed", {
          resource_type: "maintenance.internal_labor_log",
          resource_id: id,
          operating_company_id: body.operating_company_id,
          work_order_id: entry.work_order_id,
          unit_id: entry.unit_id,
        });
        return closed;
      });
    } catch (error) {
      if (error instanceof InternalLaborPartConflictError) {
        return reply.code(409).send({ error: error.message, part_id: error.partId });
      }
      throw error;
    }

    if (!result) return reply.code(404).send({ error: "Labor entry not found" });
    reply.send({ data: result });
  });

  // DELETE /api/v1/maintenance/internal-labor/:id
  app.delete("/api/v1/maintenance/internal-labor/:id", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const { id } = idParams.parse(req.params);
    const { operating_company_id } = companyQuery.parse(req.query);

    const archived = await withCompany(user.uuid, operating_company_id, async (client) => {
      const res = await client.query(
        `UPDATE maintenance.internal_labor_log
            SET is_active = false, updated_at = now()
          WHERE id = $1
            AND operating_company_id = $2::uuid
            AND is_active = true
          RETURNING id`,
        [id, operating_company_id]
      );
      if (!res.rows[0]) return false;
      await appendCrudAudit(client, user.uuid, "maintenance.internal_labor.archived", {
        resource_type: "maintenance.internal_labor_log",
        resource_id: id,
        operating_company_id,
      });
      return true;
    });

    if (!archived) return reply.code(404).send({ error: "Labor entry not found" });
    reply.code(204).send();
  });
}

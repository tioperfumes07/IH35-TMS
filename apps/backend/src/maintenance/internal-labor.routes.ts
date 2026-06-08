import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";

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
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

async function withCompany<T>(userId: string, companyId: string, fn: (client: any) => Promise<T>): Promise<T> {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${companyId}'`);
    return fn(client);
  });
}

function computePartsCost(partsUsed: Array<{ qty: number; unit_cost_cents: number }>) {
  return partsUsed.reduce((sum, p) => sum + p.qty * p.unit_cost_cents, 0);
}

export async function internalLaborRoutes(app: FastifyInstance) {
  // GET /api/v1/maintenance/internal-labor?operating_company_id=&work_order_id=
  app.get("/api/v1/maintenance/internal-labor", async (req, reply) => {
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
      const conditions: string[] = ["il.is_active = true"];
      const params: unknown[] = [];
      let idx = 1;

      if (q.work_order_id) { conditions.push(`il.work_order_id = $${idx++}`); params.push(q.work_order_id); }
      if (q.mechanic_user_id) { conditions.push(`il.mechanic_user_id = $${idx++}`); params.push(q.mechanic_user_id); }
      if (q.unit_id) { conditions.push(`il.unit_id = $${idx++}`); params.push(q.unit_id); }
      if (q.from_date) { conditions.push(`il.start_time >= $${idx++}`); params.push(q.from_date); }
      if (q.to_date) { conditions.push(`il.start_time <= $${idx++}`); params.push(q.to_date); }

      params.push(q.limit, q.offset);

      const { rows } = await client.query(`
        SELECT il.*,
               u.first_name || ' ' || u.last_name AS mechanic_name,
               wo.wo_number
        FROM maintenance.internal_labor_log il
        LEFT JOIN identity.users u ON u.id = il.mechanic_user_id
        LEFT JOIN maintenance.work_orders wo ON wo.id = il.work_order_id
        WHERE ${conditions.join(" AND ")}
        ORDER BY il.start_time DESC
        LIMIT $${idx++} OFFSET $${idx++}
      `, params);
      return rows;
    });

    reply.send({ data: rows });
  });

  // GET /api/v1/maintenance/internal-labor/productivity-report
  app.get("/api/v1/maintenance/internal-labor/productivity-report", async (req, reply) => {
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
          AND il.is_active = true
          AND il.end_time IS NOT NULL
        GROUP BY il.mechanic_user_id, mechanic_name
        ORDER BY total_hours DESC NULLS LAST
      `, [q.from_date, q.to_date]);
      return rows;
    });

    reply.send({ data: rows });
  });

  // POST /api/v1/maintenance/internal-labor — start labor entry
  app.post("/api/v1/maintenance/internal-labor", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const body = createLaborBody.parse(req.body);
    const totalPartsCost = computePartsCost(body.parts_used);

    const row = await withCompany(user.uuid, body.operating_company_id, async (client) => {
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
      return rows[0];
    });

    reply.code(201).send({ data: row });
  });

  // POST /api/v1/maintenance/internal-labor/:id/close
  // Closes labor entry (sets end_time), decrements parts inventory, posts JE
  app.post("/api/v1/maintenance/internal-labor/:id/close", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const { id } = idParams.parse(req.params);
    const body = closeLaborBody.parse(req.body);

    const result = await withCompany(user.uuid, body.operating_company_id, async (client) => {
      await client.query("BEGIN");

      // 1. Fetch existing labor entry
      const { rows: existing } = await client.query(
        `SELECT * FROM maintenance.internal_labor_log WHERE id = $1 AND is_active = true FOR UPDATE`,
        [id]
      );
      if (!existing[0]) {
        await client.query("ROLLBACK");
        return null;
      }
      const entry = existing[0];
      const partsUsed = body.parts_used ?? entry.parts_used ?? [];
      const totalPartsCost = computePartsCost(partsUsed);

      // 2. Close the labor entry
      const { rows: updated } = await client.query(`
        UPDATE maintenance.internal_labor_log
        SET end_time = $2,
            parts_used = $3,
            total_parts_cost_cents = $4,
            notes = COALESCE($5, notes),
            updated_at = now()
        WHERE id = $1
        RETURNING *
      `, [id, body.end_time, JSON.stringify(partsUsed), totalPartsCost, body.notes ?? null]);

      const closed = updated[0];

      // 3. Decrement parts inventory for each part used
      for (const part of partsUsed) {
        await client.query(`
          UPDATE maintenance.parts_inventory
          SET on_hand_qty = on_hand_qty - $1
          WHERE id = $2 AND on_hand_qty >= $1
        `, [part.qty, part.part_id]);
      }

      // 4. Post journal entry if labor cost > 0
      // Dr. Vehicle Maintenance Expense
      // Cr. Internal Labor Recovery
      // Cr. Parts Inventory (asset)
      if (closed.labor_cost_cents > 0 || totalPartsCost > 0) {
        const totalCost = (closed.labor_cost_cents ?? 0) + totalPartsCost;

        const { rows: jeRows } = await client.query(`
          INSERT INTO accounting.journal_entries (
            operating_company_id, entry_date, memo, status, source, created_by_user_id
          ) VALUES ($1, current_date, $2, 'posted', 'auto', $3)
          RETURNING id
        `, [
          body.operating_company_id,
          `Internal WO close: WO ${entry.work_order_id} — labor ${closed.labor_cost_cents}¢ + parts ${totalPartsCost}¢`,
          user.uuid,
        ]);
        const jeId = jeRows[0].id;

        // Link JE back to labor log
        await client.query(
          `UPDATE maintenance.internal_labor_log SET journal_entry_id = $1 WHERE id = $2`,
          [jeId, id]
        );
      }

      await client.query("COMMIT");
      return closed;
    });

    if (!result) return reply.code(404).send({ error: "Labor entry not found" });
    reply.send({ data: result });
  });

  // DELETE /api/v1/maintenance/internal-labor/:id
  app.delete("/api/v1/maintenance/internal-labor/:id", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const { id } = idParams.parse(req.params);
    const { operating_company_id } = companyQuery.parse(req.query);

    await withCompany(user.uuid, operating_company_id, async (client) => {
      await client.query(
        `UPDATE maintenance.internal_labor_log SET is_active = false, updated_at = now() WHERE id = $1`,
        [id]
      );
    });

    reply.code(204).send();
  });
}

/**
 * Task routes — W1B-TASKS-MODULE (Fastify)
 * Employee×day planner grid API. NON-FINANCIAL.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

const ListTasksQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  assigned_to: z.string().uuid().optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  category: z.enum(["load", "maintenance", "safety", "dispatch", "admin"]).optional(),
  status: z.enum(["pending", "in_progress", "blocked", "review", "completed", "cancelled"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

const PlannerQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  assigned_to: z.string().uuid().optional(),
});

const CreateTaskBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  category: z.enum(["load", "maintenance", "safety", "dispatch", "admin"]),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  assigned_to_user_id: z.string().uuid(),
  scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  priority: z.coerce.number().int().min(0).max(2).default(0),
  subject_type: z.enum(["load", "unit", "driver", "customer", "maintenance_order"]).optional(),
  subject_id: z.string().uuid().optional(),
  estimated_minutes: z.coerce.number().int().min(0).optional(),
});

const UpdateTaskStatusSchema = z.object({
  status: z.enum(["pending", "in_progress", "blocked", "review", "completed", "cancelled"]),
  reason: z.string().max(500).optional(),
  actual_minutes: z.coerce.number().int().min(0).optional(),
});

const IdParamSchema = z.object({ id: z.string().uuid() });

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user!;
}

export default async function taskRoutes(fastify: FastifyInstance) {
  // GET /tasks — list with filters
  fastify.get("/", async (request, reply) => {
    const user = authUser(request, reply);
    if (!user) return;

    const parsed = ListTasksQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    const input = parsed.data;

    return withCurrentUser(user.uuid, async (client) => {
      await client.query(`SET LOCAL app.operating_company_id = '${input.operating_company_id}'`);

      let sql = `
        SELECT t.task_id, t.category, t.status, t.title, t.description,
          t.priority, t.scheduled_date, t.due_date, t.assigned_to_user_id,
          t.subject_type, t.subject_id, t.estimated_minutes, t.actual_minutes,
          t.started_at, t.completed_at, t.created_at, t.updated_at
        FROM tasks.task t
        WHERE t.operating_company_id = $1 AND t.is_active = true
      `;
      const params: (string | number)[] = [input.operating_company_id];
      let paramIdx = 2;

      if (input.assigned_to) { sql += ` AND t.assigned_to_user_id = $${paramIdx++}`; params.push(input.assigned_to); }
      if (input.category) { sql += ` AND t.category = $${paramIdx++}`; params.push(input.category); }
      if (input.status) { sql += ` AND t.status = $${paramIdx++}`; params.push(input.status); }
      if (input.date_from) { sql += ` AND t.scheduled_date >= $${paramIdx++}`; params.push(input.date_from); }
      if (input.date_to) { sql += ` AND t.scheduled_date <= $${paramIdx++}`; params.push(input.date_to); }

      const countSql = `SELECT COUNT(*) FROM (${sql}) AS filtered`;
      const countResult = await (client as Queryable).query(countSql, params);
      const totalCount = parseInt(String(countResult.rows[0]?.count ?? 0), 10);

      sql += ` ORDER BY t.scheduled_date ASC, t.priority DESC, t.created_at ASC`;
      sql += ` LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
      params.push(input.limit, input.offset);

      const result = await (client as Queryable).query(sql, params);
      return { tasks: result.rows, total_count: totalCount, limit: input.limit, offset: input.offset };
    });
  });

  // GET /tasks/planner — employee×day grid
  fastify.get("/planner", async (request, reply) => {
    const user = authUser(request, reply);
    if (!user) return;

    const parsed = PlannerQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    const query = parsed.data;

    return withCurrentUser(user.uuid, async (client) => {
      await client.query(`SET LOCAL app.operating_company_id = '${query.operating_company_id}'`);

      const sql = `
        SELECT t.task_id, t.category, t.status, t.title, t.priority, t.scheduled_date,
          t.assigned_to_user_id, u.email as assigned_to_email,
          t.subject_type, t.subject_id, t.estimated_minutes, t.actual_minutes
        FROM tasks.task t
        LEFT JOIN users.users u ON u.user_id = t.assigned_to_user_id
        WHERE t.operating_company_id = $1 AND t.is_active = true
          AND t.scheduled_date BETWEEN $2 AND $3
          ${query.assigned_to ? "AND t.assigned_to_user_id = $4" : ""}
        ORDER BY t.scheduled_date ASC, t.priority DESC, t.created_at ASC
      `;
      const params: string[] = [query.operating_company_id, query.date_from, query.date_to];
      if (query.assigned_to) params.push(query.assigned_to);

      const result = await (client as Queryable).query(sql, params);

      const byDate: Record<string, unknown[]> = {};
      for (const task of result.rows) {
        const t = task as { scheduled_date: string };
        const date = t.scheduled_date;
        if (!byDate[date]) byDate[date] = [];
        byDate[date].push(task);
      }

      return { date_from: query.date_from, date_to: query.date_to, tasks: result.rows, by_date: byDate, count: result.rows.length };
    });
  });

  // POST /tasks — create
  fastify.post("/", async (request, reply) => {
    const user = authUser(request, reply);
    if (!user) return;

    const parsed = CreateTaskBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    const input = parsed.data;

    return withCurrentUser(user.uuid, async (client) => {
      await client.query(`SET LOCAL app.operating_company_id = '${input.operating_company_id}'`);

      const sql = `
        INSERT INTO tasks.task (operating_company_id, category, title, description,
          assigned_to_user_id, assigned_by_user_id, scheduled_date, due_date, priority,
          subject_type, subject_id, estimated_minutes)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *
      `;
      const result = await (client as Queryable).query(sql, [
        input.operating_company_id, input.category, input.title, input.description ?? null,
        input.assigned_to_user_id, user.uuid, input.scheduled_date, input.due_date ?? null,
        input.priority, input.subject_type ?? null, input.subject_id ?? null, input.estimated_minutes ?? null,
      ]);

      reply.status(201);
      return { task: result.rows[0] };
    });
  });

  // PATCH /tasks/:id/status
  fastify.patch("/:id/status", async (request, reply) => {
    const user = authUser(request, reply);
    if (!user) return;

    const { id } = IdParamSchema.parse(request.params);
    const parsed = UpdateTaskStatusSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    const input = parsed.data;

    return withCurrentUser(user.uuid, async (client) => {
      const ocRes = await (client as Queryable).query(`SELECT operating_company_id FROM tasks.task WHERE task_id = $1`, [id]);
      if (ocRes.rows.length === 0) { reply.status(404); return { error: "Task not found" }; }
      const ocId = String((ocRes.rows[0] as { operating_company_id: string }).operating_company_id);
      await client.query(`SET LOCAL app.operating_company_id = '${ocId}'`);

      const updates: string[] = ["status = $1"];
      const params: (string | number | null)[] = [input.status, id];
      let paramIdx = 3;

      if (input.status === "in_progress") updates.push("started_at = COALESCE(started_at, NOW())");
      if (input.status === "completed") {
        updates.push("completed_at = COALESCE(completed_at, NOW())");
        if (input.actual_minutes !== undefined) { updates.push(`actual_minutes = $${paramIdx++}`); params.push(input.actual_minutes); }
      }

      const sql = `UPDATE tasks.task SET ${updates.join(", ")} WHERE task_id = $2 RETURNING *`;
      const result = await (client as Queryable).query(sql, params);

      return { task: result.rows[0] };
    });
  });

  // GET /tasks/:id
  fastify.get("/:id", async (request, reply) => {
    const user = authUser(request, reply);
    if (!user) return;

    const { id } = IdParamSchema.parse(request.params);

    return withCurrentUser(user.uuid, async (client) => {
      const ocRes = await (client as Queryable).query(`SELECT operating_company_id FROM tasks.task WHERE task_id = $1`, [id]);
      if (ocRes.rows.length === 0) { reply.status(404); return { error: "Task not found" }; }
      const ocId = String((ocRes.rows[0] as { operating_company_id: string }).operating_company_id);
      await client.query(`SET LOCAL app.operating_company_id = '${ocId}'`);

      const sql = `
        SELECT t.*, u.email as assigned_to_email, ab.email as assigned_by_email
        FROM tasks.task t
        LEFT JOIN users.users u ON u.user_id = t.assigned_to_user_id
        LEFT JOIN users.users ab ON ab.user_id = t.assigned_by_user_id
        WHERE t.task_id = $1 AND t.is_active = true
      `;
      const result = await (client as Queryable).query(sql, [id]);

      if (result.rows.length === 0) { reply.status(404); return { error: "Task not found" }; }
      return { task: result.rows[0] };
    });
  });
}


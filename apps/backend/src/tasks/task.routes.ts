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

// Tasks RLS scope. The W1B tasks.* tables (task/status_history/note) gate on the LEGACY
// `app.current_operating_company_id` GUC, while tasks.task_type uses the STANDARD
// `app.operating_company_id`. Set BOTH (transaction-local, parameterized) so every tasks.* policy
// resolves on the same connection — otherwise INSERT into tasks.task fails WITH CHECK (RLS 42501)
// because the GUC the policy reads is empty. (Follow-up: a gated migration could standardize the
// tasks.task policy onto `app.operating_company_id`; until then we set both here.)
const SET_TASK_SCOPE_SQL =
  `SELECT set_config('app.operating_company_id', $1::text, true), set_config('app.current_operating_company_id', $1::text, true)`;

// TASKS-PLANNER-V2-CONNECTIVITY — polymorphic record link kinds (mirror tasks.task_link CHECK).
const TARGET_TYPES = [
  "vendor", "customer", "unit", "driver", "expense", "bill", "bill_payment",
  "purchase", "work_order", "policy", "load", "settlement", "document",
] as const;
const TargetTypeEnum = z.enum(TARGET_TYPES);

const ListTasksQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  assigned_to: z.string().uuid().optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  category: z.enum(["load", "maintenance", "safety", "dispatch", "admin"]).optional(),
  status: z.enum(["pending", "in_progress", "blocked", "review", "completed", "cancelled"]).optional(),
  // Reverse lookup (per-entity Tasks tab): tasks linked to a given record via tasks.task_link.
  target_type: TargetTypeEnum.optional(),
  target_id: z.string().uuid().optional(),
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
  progress_pct: z.coerce.number().int().min(0).max(100).default(0),
  task_type_id: z.string().uuid().optional(),
  start_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  location: z.string().max(300).optional(),
  checkin_cadence_minutes: z.coerce.number().int().min(1).optional(),
  escalate_to_user_id: z.string().uuid().optional(),
  notes: z.string().max(5000).optional(),
  // TASKS-PLANNER-V2-CONNECTIVITY
  alarm_at: z.string().datetime({ offset: true }).optional(),
  anticipated_category: z.string().max(200).optional(),
  links: z
    .array(
      z.object({
        role: z.enum(["about", "result"]).default("about"),
        target_type: TargetTypeEnum,
        target_id: z.string().uuid(),
        note: z.string().max(500).optional(),
      })
    )
    .max(20)
    .optional(),
});

// TASKS-PLANNER-V2-CONNECTIVITY — task_type is now a PROFILE (category/description/alarm-lead/default kinds).
const CreateTaskTypeSchema = z.object({
  operating_company_id: z.string().uuid(),
  name: z.string().min(1).max(100),
  category: z.string().max(100).optional(),
  description: z.string().max(2000).optional(),
  default_link_kinds: z.array(TargetTypeEnum).max(13).optional(),
  alarm_lead_days: z.coerce.number().int().min(0).max(3650).optional(),
});

// POST /tasks/:id/links body — link a record to a task. role='result' also CLOSES the task
// (transaction-side completion: the new expense/bill/policy that fulfils the request).
const CreateTaskLinkSchema = z.object({
  role: z.enum(["about", "result"]).default("result"),
  target_type: TargetTypeEnum,
  target_id: z.string().uuid(),
  note: z.string().max(500).optional(),
});

const UpdateProgressSchema = z.object({
  progress_pct: z.coerce.number().int().min(0).max(100),
});

const UpdateTaskStatusSchema = z.object({
  status: z.enum(["pending", "in_progress", "blocked", "review", "completed", "cancelled"]),
  reason: z.string().max(500).optional(),
  actual_minutes: z.coerce.number().int().min(0).optional(),
});

const IdParamSchema = z.object({ id: z.string().uuid() });

// TASK-ID-SCOPE-FIX: every :id-scoped route below needs `operating_company_id` to set the RLS GUC
// BEFORE it can even see the task row (tasks.task is FORCE RLS on `app.current_operating_company_id`,
// see SET_TASK_SCOPE_SQL above). The prior pattern tried to bootstrap scope by reading the task
// UNSCOPED first — but FORCE RLS blocks that same read, so it always returned zero rows and every
// one of these routes 404'd "Task not found" for every real task, always (measured live: GET/POST
// .../comments, GET .../activity, and GET /:id all 404 on a task visible on the Task Board).
// Trusting a client-supplied operating_company_id here is the SAME pattern already used by every
// other route in this file (ListTasksQuerySchema, PlannerQuerySchema, CreateTaskBodySchema, etc.):
// RLS — not the app layer — is what actually enforces it, so a caller passing a company the task
// doesn't belong to still gets a correct 404, not cross-tenant access.
const TaskScopeQuerySchema = z.object({ operating_company_id: z.string().uuid() });

// TASK-3 Team Chat — threaded comments + @mentions body.
const CreateCommentSchema = z.object({
  body: z.string().min(1).max(5000),
  mentions: z.array(z.string().uuid()).max(50).default([]),
});

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
      await client.query(SET_TASK_SCOPE_SQL, [input.operating_company_id]);

      let sql = `
        SELECT t.task_id, t.category, t.status, t.title, t.description,
          t.priority, t.scheduled_date, t.due_date, t.assigned_to_user_id,
          coalesce(u.first_name || ' ' || u.last_name, u.email) as assigned_to_name,
          t.subject_type, t.subject_id,
          CASE t.subject_type
            WHEN 'load' THEN subject_load.load_number
            WHEN 'unit' THEN subject_unit.unit_number
            WHEN 'driver' THEN NULLIF(TRIM(CONCAT_WS(' ', subject_driver.first_name, subject_driver.last_name)), '')
            WHEN 'customer' THEN subject_customer.customer_name
            WHEN 'maintenance_order' THEN subject_wo.display_id
            WHEN 'work_order' THEN subject_wo.display_id
            ELSE NULL
          END AS subject_label,
          t.estimated_minutes, t.actual_minutes,
          t.started_at, t.completed_at, t.created_at, t.updated_at,
          t.alarm_at, t.anticipated_category, t.task_type_id
        FROM tasks.task t
        LEFT JOIN identity.users u ON u.id = t.assigned_to_user_id
        LEFT JOIN mdata.loads subject_load ON t.subject_type = 'load'
          AND subject_load.id = t.subject_id AND subject_load.operating_company_id = t.operating_company_id
        LEFT JOIN mdata.units subject_unit ON t.subject_type = 'unit'
          AND subject_unit.id = t.subject_id
          AND COALESCE(subject_unit.currently_leased_to_company_id, subject_unit.owner_company_id) = t.operating_company_id
        LEFT JOIN mdata.drivers subject_driver ON t.subject_type = 'driver'
          AND subject_driver.id = t.subject_id
          AND (
            subject_driver.operating_company_id = t.operating_company_id
            OR EXISTS (
              SELECT 1
              FROM mdata.driver_company_authorizations task_list_subject_dca
              WHERE task_list_subject_dca.driver_id = subject_driver.id
                AND task_list_subject_dca.company_id = t.operating_company_id
                AND task_list_subject_dca.is_authorized = true
                AND task_list_subject_dca.deactivated_at IS NULL
            )
          )
        LEFT JOIN mdata.customers subject_customer ON t.subject_type = 'customer'
          AND subject_customer.id = t.subject_id AND subject_customer.operating_company_id = t.operating_company_id
        LEFT JOIN maintenance.work_orders subject_wo ON t.subject_type IN ('maintenance_order', 'work_order')
          AND subject_wo.id = t.subject_id AND subject_wo.operating_company_id = t.operating_company_id
        WHERE t.operating_company_id = $1::uuid AND t.is_active = true
      `;
      const params: (string | number)[] = [input.operating_company_id];
      let paramIdx = 2;

      if (input.assigned_to) { sql += ` AND t.assigned_to_user_id = $${paramIdx++}`; params.push(input.assigned_to); }
      if (input.category) { sql += ` AND t.category = $${paramIdx++}`; params.push(input.category); }
      if (input.status) { sql += ` AND t.status = $${paramIdx++}`; params.push(input.status); }
      if (input.date_from) { sql += ` AND t.scheduled_date >= $${paramIdx++}`; params.push(input.date_from); }
      if (input.date_to) { sql += ` AND t.scheduled_date <= $${paramIdx++}`; params.push(input.date_to); }
      // Reverse lookup for the per-entity Tasks tab: tasks that link to a given record.
      if (input.target_type && input.target_id) {
        sql += ` AND EXISTS (
          SELECT 1 FROM tasks.task_link tl
          WHERE tl.task_id = t.task_id AND tl.is_active = true
            AND tl.target_type = $${paramIdx++} AND tl.target_id = $${paramIdx++}
        )`;
        params.push(input.target_type, input.target_id);
      }

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
      await client.query(SET_TASK_SCOPE_SQL, [query.operating_company_id]);

      const sql = `
        SELECT t.task_id, t.category, t.status, t.title, t.priority, t.scheduled_date,
          t.assigned_to_user_id, u.email as assigned_to_email,
          coalesce(u.first_name || ' ' || u.last_name, u.email) as assigned_to_name,
          COALESCE(t.subject_type, primary_link.subject_type) AS subject_type,
          COALESCE(t.subject_id, primary_link.subject_id) AS subject_id,
          CASE COALESCE(t.subject_type, primary_link.subject_type)
            WHEN 'load' THEN subject_load.load_number
            WHEN 'unit' THEN subject_unit.unit_number
            WHEN 'driver' THEN NULLIF(TRIM(CONCAT_WS(' ', subject_driver.first_name, subject_driver.last_name)), '')
            WHEN 'customer' THEN subject_customer.customer_name
            WHEN 'maintenance_order' THEN subject_wo.display_id
            WHEN 'work_order' THEN subject_wo.display_id
            ELSE NULL
          END AS subject_label,
          t.estimated_minutes, t.actual_minutes,
          t.progress_pct, t.task_type_id, tt.name as task_type_name,
          t.start_time, t.location, t.notes
        FROM tasks.task t
        LEFT JOIN identity.users u ON u.id = t.assigned_to_user_id
        LEFT JOIN tasks.task_type tt ON tt.id = t.task_type_id
        LEFT JOIN LATERAL (
          SELECT CASE tl.target_type WHEN 'work_order' THEN 'maintenance_order' ELSE tl.target_type END AS subject_type,
                 tl.target_id AS subject_id
          FROM tasks.task_link tl
          WHERE tl.task_id = t.task_id
            AND tl.operating_company_id = t.operating_company_id
            AND tl.role = 'about'
            AND tl.target_type IN ('load', 'unit', 'driver', 'customer', 'work_order')
          ORDER BY tl.created_at ASC, tl.id ASC
          LIMIT 1
        ) primary_link ON t.subject_id IS NULL
        LEFT JOIN mdata.loads subject_load ON COALESCE(t.subject_type, primary_link.subject_type) = 'load'
          AND subject_load.id = COALESCE(t.subject_id, primary_link.subject_id) AND subject_load.operating_company_id = t.operating_company_id
        LEFT JOIN mdata.units subject_unit ON COALESCE(t.subject_type, primary_link.subject_type) = 'unit'
          AND subject_unit.id = COALESCE(t.subject_id, primary_link.subject_id)
          AND COALESCE(subject_unit.currently_leased_to_company_id, subject_unit.owner_company_id) = t.operating_company_id
        LEFT JOIN mdata.drivers subject_driver ON COALESCE(t.subject_type, primary_link.subject_type) = 'driver'
          AND subject_driver.id = COALESCE(t.subject_id, primary_link.subject_id)
          AND (
            subject_driver.operating_company_id = t.operating_company_id
            OR EXISTS (
              SELECT 1
              FROM mdata.driver_company_authorizations task_calendar_subject_dca
              WHERE task_calendar_subject_dca.driver_id = subject_driver.id
                AND task_calendar_subject_dca.company_id = t.operating_company_id
                AND task_calendar_subject_dca.is_authorized = true
                AND task_calendar_subject_dca.deactivated_at IS NULL
            )
          )
        LEFT JOIN mdata.customers subject_customer ON COALESCE(t.subject_type, primary_link.subject_type) = 'customer'
          AND subject_customer.id = COALESCE(t.subject_id, primary_link.subject_id) AND subject_customer.operating_company_id = t.operating_company_id
        LEFT JOIN maintenance.work_orders subject_wo ON COALESCE(t.subject_type, primary_link.subject_type) IN ('maintenance_order', 'work_order')
          AND subject_wo.id = COALESCE(t.subject_id, primary_link.subject_id) AND subject_wo.operating_company_id = t.operating_company_id
        WHERE t.operating_company_id = $1::uuid AND t.is_active = true
          AND (
            t.scheduled_date BETWEEN $2 AND $3
            OR (
              t.scheduled_date < $2
              AND t.status::text NOT IN ('completed', 'cancelled')
            )
          )
          ${query.assigned_to ? "AND t.assigned_to_user_id = $4" : ""}
        ORDER BY t.scheduled_date ASC, t.priority DESC, t.created_at ASC
      `;
      // Overdue open tasks (scheduled before date_from) are included so the planner default
      // "This Week" does not hide work that is still open — Cascade FAIL-TSK1 overdue-rollover.
      const params: string[] = [query.operating_company_id, query.date_from, query.date_to];
      if (query.assigned_to) params.push(query.assigned_to);

      const result = await (client as Queryable).query(sql, params);

      const byEmployee: Record<string, unknown[]> = {};
      for (const task of result.rows) {
        const t = task as { assigned_to_user_id: string };
        const uid = t.assigned_to_user_id;
        if (!byEmployee[uid]) byEmployee[uid] = [];
        byEmployee[uid].push(task);
      }

      return { date_from: query.date_from, date_to: query.date_to, tasks: result.rows, by_employee: byEmployee, count: result.rows.length };
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
      await client.query(SET_TASK_SCOPE_SQL, [input.operating_company_id]);

      // `links` is the canonical polymorphic create contract. Keep the legacy subject columns in
      // sync with its first supported "about" link so every list/drawer can resolve the same human
      // record immediately; the planner's lateral fallback above also repairs older link-only rows.
      const primaryAboutLink = input.links?.find(
        (link) => link.role === "about" && ["load", "unit", "driver", "customer", "work_order"].includes(link.target_type)
      );
      const linkedSubjectType = primaryAboutLink?.target_type === "work_order" ? "maintenance_order" : primaryAboutLink?.target_type;
      const subjectType = input.subject_type ?? linkedSubjectType ?? null;
      const subjectId = input.subject_id ?? primaryAboutLink?.target_id ?? null;

      const sql = `
        INSERT INTO tasks.task (operating_company_id, category, title, description,
          assigned_to_user_id, assigned_by_user_id, scheduled_date, due_date, priority,
          subject_type, subject_id, estimated_minutes,
          progress_pct, task_type_id, start_time, location,
          checkin_cadence_minutes, escalate_to_user_id, notes,
          alarm_at, anticipated_category)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
        RETURNING *
      `;
      const result = await (client as Queryable).query<{ task_id: string }>(sql, [
        input.operating_company_id, input.category, input.title, input.description ?? null,
        input.assigned_to_user_id, user.uuid, input.scheduled_date, input.due_date ?? null,
        input.priority, subjectType, subjectId, input.estimated_minutes ?? null,
        input.progress_pct, input.task_type_id ?? null, input.start_time ?? null, input.location ?? null,
        input.checkin_cadence_minutes ?? null, input.escalate_to_user_id ?? null, input.notes ?? null,
        input.alarm_at ?? null, input.anticipated_category ?? null,
      ]);
      const created = result.rows[0];

      // Insert optional record links (polymorphic pointers — NO accounting write).
      if (created && input.links && input.links.length > 0) {
        for (const link of input.links) {
          await (client as Queryable).query(
            `INSERT INTO tasks.task_link
               (task_id, operating_company_id, role, target_type, target_id, note, created_by_user_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [created.task_id, input.operating_company_id, link.role, link.target_type, link.target_id, link.note ?? null, user.uuid]
          );
          // Per-task activity trail (also carries the mutation's audit trail alongside the DB spine triggers).
          await (client as Queryable).query(
            `INSERT INTO tasks.task_activity (operating_company_id, task_id, actor_user_id, event_type, payload)
             VALUES ($1,$2,$3,'link_added',$4::jsonb)`,
            [input.operating_company_id, created.task_id, user.uuid, JSON.stringify({ role: link.role, target_type: link.target_type, target_id: link.target_id })]
          );
        }
      }

      reply.status(201);
      return { task: created };
    });
  });

  // PATCH /tasks/:id/status
  fastify.patch("/:id/status", async (request, reply) => {
    const user = authUser(request, reply);
    if (!user) return;

    const { id } = IdParamSchema.parse(request.params);
    const scopeParsed = TaskScopeQuerySchema.safeParse(request.query ?? {});
    if (!scopeParsed.success) return reply.code(400).send({ error: "validation_error", details: scopeParsed.error.flatten() });
    const parsed = UpdateTaskStatusSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    const input = parsed.data;

    return withCurrentUser(user.uuid, async (client) => {
      const ocId = scopeParsed.data.operating_company_id;
      await client.query(SET_TASK_SCOPE_SQL, [ocId]);
      // TASK-XTENANT-SCOPE: tasks.task has NO RLS (never ENABLE ROW LEVEL SECURITY'd — confirmed
      // against every migration that touches this schema) — the SET_TASK_SCOPE_SQL GUCs above are a
      // no-op for this table. operating_company_id in the WHERE clause is the ONLY isolation.
      const existsRes = await (client as Queryable).query(
        `SELECT task_id FROM tasks.task WHERE task_id = $1 AND operating_company_id = $2::uuid`,
        [id, ocId]
      );
      if (existsRes.rows.length === 0) { reply.status(404); return { error: "Task not found" }; }

      const updates: string[] = ["status = $1"];
      const params: (string | number | null)[] = [input.status, id, ocId];
      let paramIdx = 4;

      if (input.status === "in_progress") updates.push("started_at = COALESCE(started_at, NOW())");
      if (input.status === "completed") {
        updates.push("completed_at = COALESCE(completed_at, NOW())");
        if (input.actual_minutes !== undefined) { updates.push(`actual_minutes = $${paramIdx++}`); params.push(input.actual_minutes); }
      }

      const sql = `UPDATE tasks.task SET ${updates.join(", ")} WHERE task_id = $2 AND operating_company_id = $3::uuid RETURNING *`;
      const result = await (client as Queryable).query(sql, params);
      if (result.rows.length === 0) { reply.status(404); return { error: "Task not found" }; }

      return { task: result.rows[0] };
    });
  });

  // GET /tasks/:id
  fastify.get("/:id", async (request, reply) => {
    const user = authUser(request, reply);
    if (!user) return;

    const { id } = IdParamSchema.parse(request.params);
    const scopeParsed = TaskScopeQuerySchema.safeParse(request.query ?? {});
    if (!scopeParsed.success) return reply.code(400).send({ error: "validation_error", details: scopeParsed.error.flatten() });

    return withCurrentUser(user.uuid, async (client) => {
      const ocId = scopeParsed.data.operating_company_id;
      await client.query(SET_TASK_SCOPE_SQL, [ocId]);

      // TASK-XTENANT-SCOPE: tasks.task has NO RLS — operating_company_id must be filtered here.
      const sql = `
        SELECT t.*, u.email as assigned_to_email, ab.email as assigned_by_email
        FROM tasks.task t
        LEFT JOIN identity.users u ON u.id = t.assigned_to_user_id
        LEFT JOIN identity.users ab ON ab.id = t.assigned_by_user_id
        WHERE t.task_id = $1 AND t.operating_company_id = $2::uuid AND t.is_active = true
      `;
      const result = await (client as Queryable).query(sql, [id, ocId]);

      if (result.rows.length === 0) { reply.status(404); return { error: "Task not found" }; }
      return { task: result.rows[0] };
    });
  });

  // GET /tasks/types — list task types for company
  fastify.get("/types", async (request, reply) => {
    const user = authUser(request, reply);
    if (!user) return;
    const parsed = z.object({ operating_company_id: z.string().uuid() }).safeParse(request.query ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    return withCurrentUser(user.uuid, async (client) => {
      await client.query(SET_TASK_SCOPE_SQL, [parsed.data.operating_company_id]);
      const res = await (client as Queryable).query(
        `SELECT id, name, is_active, category, description, default_link_kinds, alarm_lead_days
         FROM tasks.task_type WHERE operating_company_id = $1::uuid AND is_active = true ORDER BY name`,
        [parsed.data.operating_company_id]
      );
      return { types: res.rows };
    });
  });

  // POST /tasks/types — create task PROFILE (name + category/description/default kinds/alarm lead)
  fastify.post("/types", async (request, reply) => {
    const user = authUser(request, reply);
    if (!user) return;
    const parsed = CreateTaskTypeSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    const input = parsed.data;
    return withCurrentUser(user.uuid, async (client) => {
      await client.query(SET_TASK_SCOPE_SQL, [input.operating_company_id]);
      const res = await (client as Queryable).query(
        `INSERT INTO tasks.task_type (operating_company_id, name, category, description, default_link_kinds, alarm_lead_days)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6)
         ON CONFLICT (operating_company_id, name) DO UPDATE SET
           is_active = true,
           category = COALESCE(EXCLUDED.category, tasks.task_type.category),
           description = COALESCE(EXCLUDED.description, tasks.task_type.description),
           default_link_kinds = EXCLUDED.default_link_kinds,
           alarm_lead_days = COALESCE(EXCLUDED.alarm_lead_days, tasks.task_type.alarm_lead_days)
         RETURNING id, name, is_active, category, description, default_link_kinds, alarm_lead_days`,
        [
          input.operating_company_id, input.name, input.category ?? null, input.description ?? null,
          JSON.stringify(input.default_link_kinds ?? []), input.alarm_lead_days ?? null,
        ]
      );
      reply.status(201);
      return { type: res.rows[0] };
    });
  });

  // ── TASKS-PLANNER-V2-CONNECTIVITY: record links + transaction-side completion ──────────────────
  // GET /tasks/:id/links — active links for a task (about + result), record-side pointers.
  fastify.get("/:id/links", async (request, reply) => {
    const user = authUser(request, reply);
    if (!user) return;
    const { id } = IdParamSchema.parse(request.params);
    const scopeParsed = TaskScopeQuerySchema.safeParse(request.query ?? {});
    if (!scopeParsed.success) return reply.code(400).send({ error: "validation_error", details: scopeParsed.error.flatten() });
    return withCurrentUser(user.uuid, async (client) => {
      const ocId = scopeParsed.data.operating_company_id;
      await client.query(SET_TASK_SCOPE_SQL, [ocId]);
      // TASK-XTENANT-SCOPE: tasks.task has NO RLS — operating_company_id must be filtered here.
      const existsRes = await (client as Queryable).query(
        `SELECT task_id FROM tasks.task WHERE task_id = $1 AND operating_company_id = $2::uuid`,
        [id, ocId]
      );
      if (existsRes.rows.length === 0) { reply.status(404); return { error: "Task not found" }; }
      const res = await (client as Queryable).query(
        `SELECT id, task_id, role, target_type, target_id, note, created_at, created_by_user_id
         FROM tasks.task_link WHERE task_id = $1 AND operating_company_id = $2::uuid AND is_active = true ORDER BY created_at ASC`,
        [id, ocId]
      );
      return { links: res.rows };
    });
  });

  // POST /tasks/:id/links — link a record to a task. role='result' also CLOSES the task
  // (the David example: creating the Expense/Bill/Policy that fulfils the request completes it).
  // Pure pointer — NEVER an accounting write.
  fastify.post("/:id/links", async (request, reply) => {
    const user = authUser(request, reply);
    if (!user) return;
    const { id } = IdParamSchema.parse(request.params);
    const scopeParsed = TaskScopeQuerySchema.safeParse(request.query ?? {});
    if (!scopeParsed.success) return reply.code(400).send({ error: "validation_error", details: scopeParsed.error.flatten() });
    const parsed = CreateTaskLinkSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    const input = parsed.data;

    return withCurrentUser(user.uuid, async (client) => {
      const ocId = scopeParsed.data.operating_company_id;
      await client.query(SET_TASK_SCOPE_SQL, [ocId]);
      // TASK-XTENANT-SCOPE: tasks.task has NO RLS — operating_company_id must be filtered here.
      const existsRes = await (client as Queryable).query(
        `SELECT task_id FROM tasks.task WHERE task_id = $1 AND operating_company_id = $2::uuid AND is_active = true`,
        [id, ocId]
      );
      if (existsRes.rows.length === 0) { reply.status(404); return { error: "Task not found" }; }

      const linkRes = await (client as Queryable).query(
        `INSERT INTO tasks.task_link
           (task_id, operating_company_id, role, target_type, target_id, note, created_by_user_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING id, task_id, role, target_type, target_id, note, created_at`,
        [id, ocId, input.role, input.target_type, input.target_id, input.note ?? null, user.uuid]
      );

      await (client as Queryable).query(
        `INSERT INTO tasks.task_activity (operating_company_id, task_id, actor_user_id, event_type, payload)
         VALUES ($1,$2,$3,'link_added',$4::jsonb)`,
        [ocId, id, user.uuid, JSON.stringify({ role: input.role, target_type: input.target_type, target_id: input.target_id })]
      );

      // Completion: a 'result' link closes the task (status → completed). The DB status trigger
      // logs the change to the event spine; completion_confirmed_by records who closed it.
      let task: unknown = null;
      if (input.role === "result") {
        const upd = await (client as Queryable).query(
          `UPDATE tasks.task
             SET status = 'completed',
                 completed_at = COALESCE(completed_at, NOW()),
                 completion_confirmed_by = $2,
                 progress_pct = 100
           WHERE task_id = $1 AND operating_company_id = $3::uuid AND status <> 'completed'
           RETURNING *`,
          [id, user.uuid, ocId]
        );
        task = upd.rows[0] ?? null;
      }

      reply.status(201);
      return { link: linkRes.rows[0], task };
    });
  });

  // PATCH /tasks/:id/progress
  fastify.patch("/:id/progress", async (request, reply) => {
    const user = authUser(request, reply);
    if (!user) return;
    const { id } = IdParamSchema.parse(request.params);
    const scopeParsed = TaskScopeQuerySchema.safeParse(request.query ?? {});
    if (!scopeParsed.success) return reply.code(400).send({ error: "validation_error", details: scopeParsed.error.flatten() });
    const parsed = UpdateProgressSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    return withCurrentUser(user.uuid, async (client) => {
      const ocId = scopeParsed.data.operating_company_id;
      await client.query(SET_TASK_SCOPE_SQL, [ocId]);
      // TASK-XTENANT-SCOPE: tasks.task has NO RLS — operating_company_id must be filtered here.
      const res = await (client as Queryable).query(
        `UPDATE tasks.task SET progress_pct = $1, updated_at = NOW() WHERE task_id = $2 AND operating_company_id = $3::uuid RETURNING task_id, progress_pct`,
        [parsed.data.progress_pct, id, ocId]
      );
      if (res.rows.length === 0) { reply.status(404); return { error: "Task not found" }; }
      return { task: res.rows[0] };
    });
  });

  // ── TASK-3 Team Chat (task-scoped collaboration) ──────────────────────────────────────────────
  // Entity-scoped threaded comments + @mentions + a per-task activity feed. NON-FINANCIAL.
  // opco is resolved FROM the task (never trusted from the client) then set as the RLS GUC.

  // GET /tasks/:id/comments — threaded comments for a task (oldest → newest), author enriched.
  fastify.get("/:id/comments", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (request, reply) => {
    const user = authUser(request, reply);
    if (!user) return;
    const { id } = IdParamSchema.parse(request.params);
    const scopeParsed = TaskScopeQuerySchema.safeParse(request.query ?? {});
    if (!scopeParsed.success) return reply.code(400).send({ error: "validation_error", details: scopeParsed.error.flatten() });

    return withCurrentUser(user.uuid, async (client) => {
      const ocId = scopeParsed.data.operating_company_id;
      await client.query(SET_TASK_SCOPE_SQL, [ocId]);
      // TASK-XTENANT-SCOPE: tasks.task has NO RLS — operating_company_id must be filtered here.
      const existsRes = await (client as Queryable).query(
        `SELECT task_id FROM tasks.task WHERE task_id = $1 AND operating_company_id = $2::uuid`,
        [id, ocId]
      );
      if (existsRes.rows.length === 0) { reply.status(404); return { error: "Task not found" }; }

      const res = await (client as Queryable).query(
        `SELECT c.id, c.task_id, c.author_user_id, c.body, c.mentions, c.created_at,
                u.email AS author_email,
                COALESCE(u.first_name || ' ' || u.last_name, u.email) AS author_name
         FROM tasks.task_comments c
         LEFT JOIN identity.users u ON u.id = c.author_user_id
         WHERE c.task_id = $1 AND c.operating_company_id = $2::uuid AND c.deleted_at IS NULL
         ORDER BY c.created_at ASC`,
        [id, ocId]
      );
      return { comments: res.rows };
    });
  });

  // POST /tasks/:id/comments — add a comment (+ @mentions); also writes a 'comment' activity row.
  fastify.post("/:id/comments", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (request, reply) => {
    const user = authUser(request, reply);
    if (!user) return;
    const { id } = IdParamSchema.parse(request.params);
    const scopeParsed = TaskScopeQuerySchema.safeParse(request.query ?? {});
    if (!scopeParsed.success) return reply.code(400).send({ error: "validation_error", details: scopeParsed.error.flatten() });
    const parsed = CreateCommentSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    const input = parsed.data;

    return withCurrentUser(user.uuid, async (client) => {
      const ocId = scopeParsed.data.operating_company_id;
      await client.query(SET_TASK_SCOPE_SQL, [ocId]);
      // TASK-XTENANT-SCOPE: tasks.task has NO RLS — operating_company_id must be filtered here.
      const existsRes = await (client as Queryable).query(
        `SELECT task_id FROM tasks.task WHERE task_id = $1 AND operating_company_id = $2::uuid`,
        [id, ocId]
      );
      if (existsRes.rows.length === 0) { reply.status(404); return { error: "Task not found" }; }

      const ins = await (client as Queryable).query(
        `INSERT INTO tasks.task_comments (operating_company_id, task_id, author_user_id, body, mentions)
         VALUES ($1, $2, $3, $4, $5::uuid[])
         RETURNING id, task_id, author_user_id, body, mentions, created_at`,
        [ocId, id, user.uuid, input.body, input.mentions]
      );
      const comment = ins.rows[0] as { id: string; body: string; mentions: string[] };

      // Append the unified activity-feed row for this comment.
      await (client as Queryable).query(
        `INSERT INTO tasks.task_activity (operating_company_id, task_id, actor_user_id, event_type, payload)
         VALUES ($1, $2, $3, 'comment', $4::jsonb)`,
        [ocId, id, user.uuid, JSON.stringify({ comment_id: comment.id, mentions: input.mentions })]
      );

      // Enrich author for immediate render.
      const authorRes = await (client as Queryable).query(
        `SELECT email AS author_email, COALESCE(first_name || ' ' || last_name, email) AS author_name
         FROM identity.users WHERE id = $1`,
        [user.uuid]
      );
      const author = (authorRes.rows[0] ?? {}) as { author_email?: string; author_name?: string };

      reply.status(201);
      return { comment: { ...comment, author_email: author.author_email ?? null, author_name: author.author_name ?? null } };
    });
  });

  // GET /tasks/:id/activity — unified per-task activity feed (newest → oldest), actor enriched.
  fastify.get("/:id/activity", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (request, reply) => {
    const user = authUser(request, reply);
    if (!user) return;
    const { id } = IdParamSchema.parse(request.params);
    const scopeParsed = TaskScopeQuerySchema.safeParse(request.query ?? {});
    if (!scopeParsed.success) return reply.code(400).send({ error: "validation_error", details: scopeParsed.error.flatten() });

    return withCurrentUser(user.uuid, async (client) => {
      const ocId = scopeParsed.data.operating_company_id;
      await client.query(SET_TASK_SCOPE_SQL, [ocId]);
      // TASK-XTENANT-SCOPE: tasks.task has NO RLS — operating_company_id must be filtered here.
      const existsRes = await (client as Queryable).query(
        `SELECT task_id FROM tasks.task WHERE task_id = $1 AND operating_company_id = $2::uuid`,
        [id, ocId]
      );
      if (existsRes.rows.length === 0) { reply.status(404); return { error: "Task not found" }; }

      const res = await (client as Queryable).query(
        `SELECT a.id, a.task_id, a.actor_user_id, a.event_type, a.payload, a.created_at,
                COALESCE(u.first_name || ' ' || u.last_name, u.email) AS actor_name
         FROM tasks.task_activity a
         LEFT JOIN identity.users u ON u.id = a.actor_user_id
         WHERE a.task_id = $1 AND a.operating_company_id = $2::uuid
         ORDER BY a.created_at DESC`,
        [id, ocId]
      );
      return { activity: res.rows };
    });
  });
}

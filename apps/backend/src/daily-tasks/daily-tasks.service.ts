import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";

export type QueryableClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

const TASK_STATUSES = ["created", "accepted", "completed", "cancelled"] as const;
const TASK_PRIORITIES = ["low", "normal", "high", "urgent"] as const;

export const createDailyTaskBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(4000).optional().nullable(),
  assigned_to_user_id: z.string().uuid(),
  priority: z.enum(TASK_PRIORITIES).default("normal"),
  due_at: z.string().datetime({ offset: true }).optional().nullable(),
});

export const listDailyTasksQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  assignee: z.string().uuid().optional(),
  created_by: z.string().uuid().optional(),
  team: z.string().trim().min(1).max(40).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  overdue: z.coerce.boolean().optional(),
});

export const taskIdParamsSchema = z.object({
  id: z.string().uuid(),
});

export const reassignBodySchema = z.object({
  assigned_to_user_id: z.string().uuid(),
});

export const cancelBodySchema = z.object({
  cancellation_reason: z.string().trim().min(1).max(1000),
});

function asIsoOrNull(raw: unknown): string | null {
  if (!raw) return null;
  const d = new Date(String(raw));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

async function assertCompanyAccess(client: QueryableClient, userId: string, role: string, companyId: string): Promise<boolean> {
  if (role === "Owner") return true;
  const r = await client.query<{ ok: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM org.user_company_access a
        WHERE a.user_id = $1::uuid
          AND a.company_id = $2::uuid
          AND a.deactivated_at IS NULL
      ) AS ok
    `,
    [userId, companyId]
  );
  return Boolean(r.rows[0]?.ok);
}

async function userEmail(client: QueryableClient, userId: string): Promise<string | null> {
  const r = await client.query<{ email: string | null }>(`SELECT email::text AS email FROM identity.users WHERE id = $1::uuid LIMIT 1`, [
    userId,
  ]);
  return r.rows[0]?.email ? String(r.rows[0].email) : null;
}

type AlertType = "assigned" | "nearing_due" | "overdue" | "completed";

async function enqueueAlertAndEmail(
  client: QueryableClient,
  args: {
    operatingCompanyId: string;
    taskId: string;
    alertType: AlertType;
    targetUserId: string;
    actorUserId: string | null;
    title: string;
    bodyText: string;
    payload?: Record<string, unknown>;
  }
) {
  await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
  await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [args.operatingCompanyId]);

  await client.query(
    `
      INSERT INTO ops.daily_task_alerts (
        operating_company_id,
        daily_task_id,
        alert_type,
        target_user_id,
        channel,
        payload
      ) VALUES ($1::uuid, $2::uuid, $3, $4::uuid, 'email', $5::jsonb)
      ON CONFLICT (daily_task_id, alert_type, target_user_id, channel) DO NOTHING
    `,
    [args.operatingCompanyId, args.taskId, args.alertType, args.targetUserId, JSON.stringify(args.payload ?? {})]
  );

  const to = await userEmail(client, args.targetUserId);
  if (!to) return;

  const queueRes = await client.query<{ id: string }>(
    `
      INSERT INTO email.email_queue (
        operating_company_id,
        to_addresses,
        subject,
        template_key,
        template_vars,
        status,
        queued_by_user_id
      )
      VALUES ($1::uuid, $2::text[], $3, 'notification-dispatch', $4::jsonb, 'queued', $5::uuid)
      RETURNING id
    `,
    [args.operatingCompanyId, [to], args.title, JSON.stringify({ title: args.title, bodyText: args.bodyText }), args.actorUserId]
  );

  const queueId = String(queueRes.rows[0]?.id ?? "");
  if (!queueId) return;
}

async function appendTaskEvent(
  client: QueryableClient,
  args: {
    operatingCompanyId: string;
    taskId: string;
    eventType: "created" | "accepted" | "completed" | "cancelled" | "reassigned" | "comment";
    actorUserId: string;
    payload?: Record<string, unknown>;
  }
) {
  await client.query(
    `
      INSERT INTO ops.daily_task_events (
        operating_company_id,
        daily_task_id,
        event_type,
        actor_user_id,
        payload
      ) VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5::jsonb)
    `,
    [args.operatingCompanyId, args.taskId, args.eventType, args.actorUserId, JSON.stringify(args.payload ?? {})]
  );
}

export async function createTask(
  client: QueryableClient,
  args: {
    actorUserId: string;
    actorRole: string;
    body: z.infer<typeof createDailyTaskBodySchema>;
  }
) {
  const input = createDailyTaskBodySchema.parse(args.body);
  const allowed = await assertCompanyAccess(client, args.actorUserId, args.actorRole, input.operating_company_id);
  if (!allowed) return { error: "forbidden_company" as const };

  const insert = await client.query<Record<string, unknown>>(
    `
      INSERT INTO ops.daily_tasks (
        operating_company_id,
        title,
        description,
        created_by_user_id,
        assigned_to_user_id,
        status,
        priority,
        due_at
      ) VALUES ($1::uuid,$2,$3,$4::uuid,$5::uuid,'created',$6,$7::timestamptz)
      RETURNING *
    `,
    [
      input.operating_company_id,
      input.title,
      input.description ?? null,
      args.actorUserId,
      input.assigned_to_user_id,
      input.priority,
      input.due_at ?? null,
    ]
  );
  const row = insert.rows[0]!;
  const taskId = String(row.id);

  await appendTaskEvent(client, {
    operatingCompanyId: input.operating_company_id,
    taskId,
    eventType: "created",
    actorUserId: args.actorUserId,
    payload: {
      assigned_to_user_id: input.assigned_to_user_id,
      priority: input.priority,
      due_at: input.due_at ?? null,
    },
  });

  await appendCrudAudit(
    client,
    args.actorUserId,
    "ops.daily_task.created",
    { task_id: taskId, operating_company_id: input.operating_company_id, assigned_to_user_id: input.assigned_to_user_id },
    "info",
    "P0-DAILY-TASKS"
  );

  await enqueueAlertAndEmail(client, {
    operatingCompanyId: input.operating_company_id,
    taskId,
    alertType: "assigned",
    targetUserId: input.assigned_to_user_id,
    actorUserId: args.actorUserId,
    title: `Daily Task assigned: ${input.title}`,
    bodyText: `You have a new daily task assigned${input.due_at ? ` (due ${new Date(input.due_at).toLocaleString()})` : ""}.`,
    payload: { task_id: taskId, title: input.title, due_at: input.due_at ?? null },
  });

  return { task: row };
}

async function loadTaskById(client: QueryableClient, id: string): Promise<Record<string, unknown> | null> {
  const r = await client.query<Record<string, unknown>>(`SELECT * FROM ops.daily_tasks WHERE id = $1::uuid LIMIT 1`, [id]);
  return r.rows[0] ?? null;
}

function canManageTask(actorRole: string, actorUserId: string, task: Record<string, unknown>): boolean {
  if (actorRole === "Owner" || actorRole === "Administrator" || actorRole === "Manager") return true;
  return String(task.created_by_user_id ?? "") === actorUserId || String(task.assigned_to_user_id ?? "") === actorUserId;
}

export async function acceptTask(
  client: QueryableClient,
  args: { actorUserId: string; actorRole: string; taskId: string }
) {
  const task = await loadTaskById(client, args.taskId);
  if (!task) return { error: "not_found" as const };
  if (String(task.assigned_to_user_id ?? "") !== args.actorUserId) return { error: "forbidden" as const };
  if (String(task.status ?? "") !== "created") return { error: "invalid_status" as const };

  const updated = await client.query<Record<string, unknown>>(
    `
      UPDATE ops.daily_tasks
      SET status = 'accepted',
          accepted_at = now(),
          updated_at = now()
      WHERE id = $1::uuid
      RETURNING *
    `,
    [args.taskId]
  );
  const row = updated.rows[0]!;

  await appendTaskEvent(client, {
    operatingCompanyId: String(row.operating_company_id),
    taskId: String(row.id),
    eventType: "accepted",
    actorUserId: args.actorUserId,
  });
  await appendCrudAudit(
    client,
    args.actorUserId,
    "ops.daily_task.accepted",
    { task_id: String(row.id) },
    "info",
    "P0-DAILY-TASKS"
  );
  return { task: row };
}

export async function completeTask(
  client: QueryableClient,
  args: { actorUserId: string; actorRole: string; taskId: string }
) {
  const task = await loadTaskById(client, args.taskId);
  if (!task) return { error: "not_found" as const };
  if (String(task.assigned_to_user_id ?? "") !== args.actorUserId) return { error: "forbidden" as const };
  if (String(task.status ?? "") !== "accepted") return { error: "invalid_status" as const };

  const updated = await client.query<Record<string, unknown>>(
    `
      UPDATE ops.daily_tasks
      SET status = 'completed',
          completed_at = now(),
          updated_at = now()
      WHERE id = $1::uuid
      RETURNING *
    `,
    [args.taskId]
  );
  const row = updated.rows[0]!;

  await appendTaskEvent(client, {
    operatingCompanyId: String(row.operating_company_id),
    taskId: String(row.id),
    eventType: "completed",
    actorUserId: args.actorUserId,
  });
  await appendCrudAudit(
    client,
    args.actorUserId,
    "ops.daily_task.completed",
    { task_id: String(row.id) },
    "info",
    "P0-DAILY-TASKS"
  );

  await enqueueAlertAndEmail(client, {
    operatingCompanyId: String(row.operating_company_id),
    taskId: String(row.id),
    alertType: "completed",
    targetUserId: String(row.created_by_user_id),
    actorUserId: args.actorUserId,
    title: `Daily Task completed: ${String(row.title ?? "")}`,
    bodyText: `${String(row.title ?? "Task")} was completed.`,
    payload: { task_id: String(row.id), completed_at: asIsoOrNull(row.completed_at) },
  });

  return { task: row };
}

export async function reassignTask(
  client: QueryableClient,
  args: { actorUserId: string; actorRole: string; taskId: string; body: z.infer<typeof reassignBodySchema> }
) {
  const body = reassignBodySchema.parse(args.body);
  const task = await loadTaskById(client, args.taskId);
  if (!task) return { error: "not_found" as const };
  if (!canManageTask(args.actorRole, args.actorUserId, task)) return { error: "forbidden" as const };
  const status = String(task.status ?? "");
  if (status === "completed" || status === "cancelled") return { error: "invalid_status" as const };

  const updated = await client.query<Record<string, unknown>>(
    `
      UPDATE ops.daily_tasks
      SET assigned_to_user_id = $2::uuid,
          status = 'created',
          accepted_at = NULL,
          updated_at = now()
      WHERE id = $1::uuid
      RETURNING *
    `,
    [args.taskId, body.assigned_to_user_id]
  );
  const row = updated.rows[0]!;
  await appendTaskEvent(client, {
    operatingCompanyId: String(row.operating_company_id),
    taskId: String(row.id),
    eventType: "reassigned",
    actorUserId: args.actorUserId,
    payload: { assigned_to_user_id: body.assigned_to_user_id },
  });
  await appendCrudAudit(
    client,
    args.actorUserId,
    "ops.daily_task.reassigned",
    { task_id: String(row.id), assigned_to_user_id: body.assigned_to_user_id },
    "info",
    "P0-DAILY-TASKS"
  );

  await enqueueAlertAndEmail(client, {
    operatingCompanyId: String(row.operating_company_id),
    taskId: String(row.id),
    alertType: "assigned",
    targetUserId: body.assigned_to_user_id,
    actorUserId: args.actorUserId,
    title: `Daily Task reassigned: ${String(row.title ?? "")}`,
    bodyText: `${String(row.title ?? "Task")} was reassigned to you.`,
    payload: { task_id: String(row.id), reassigned_at: new Date().toISOString() },
  });
  return { task: row };
}

export async function cancelTask(
  client: QueryableClient,
  args: { actorUserId: string; actorRole: string; taskId: string; body: z.infer<typeof cancelBodySchema> }
) {
  const body = cancelBodySchema.parse(args.body);
  const task = await loadTaskById(client, args.taskId);
  if (!task) return { error: "not_found" as const };
  if (!canManageTask(args.actorRole, args.actorUserId, task)) return { error: "forbidden" as const };
  const status = String(task.status ?? "");
  if (status === "completed" || status === "cancelled") return { error: "invalid_status" as const };

  const updated = await client.query<Record<string, unknown>>(
    `
      UPDATE ops.daily_tasks
      SET status = 'cancelled',
          cancelled_at = now(),
          cancellation_reason = $2,
          updated_at = now()
      WHERE id = $1::uuid
      RETURNING *
    `,
    [args.taskId, body.cancellation_reason]
  );
  const row = updated.rows[0]!;
  await appendTaskEvent(client, {
    operatingCompanyId: String(row.operating_company_id),
    taskId: String(row.id),
    eventType: "cancelled",
    actorUserId: args.actorUserId,
    payload: { cancellation_reason: body.cancellation_reason },
  });
  await appendCrudAudit(
    client,
    args.actorUserId,
    "ops.daily_task.cancelled",
    { task_id: String(row.id), cancellation_reason: body.cancellation_reason },
    "warning",
    "P0-DAILY-TASKS"
  );
  return { task: row };
}

export async function getTask(
  client: QueryableClient,
  args: { actorUserId: string; actorRole: string; taskId: string }
) {
  const task = await loadTaskById(client, args.taskId);
  if (!task) return { error: "not_found" as const };
  if (!canManageTask(args.actorRole, args.actorUserId, task)) return { error: "forbidden" as const };
  return { task };
}

export async function listTasks(
  client: QueryableClient,
  args: { actorUserId: string; actorRole: string; query: z.infer<typeof listDailyTasksQuerySchema> }
) {
  const q = listDailyTasksQuerySchema.parse(args.query);
  const allowed = await assertCompanyAccess(client, args.actorUserId, args.actorRole, q.operating_company_id);
  if (!allowed) return { error: "forbidden_company" as const };

  const rows = await client.query<Record<string, unknown>>(
    `
      SELECT
        t.*,
        (t.due_at IS NOT NULL AND t.due_at < now() AND t.status NOT IN ('completed','cancelled')) AS is_overdue,
        assignee.email::text AS assigned_to_email,
        creator.email::text AS created_by_email
      FROM ops.daily_tasks t
      LEFT JOIN identity.users assignee ON assignee.id = t.assigned_to_user_id
      LEFT JOIN identity.users creator ON creator.id = t.created_by_user_id
      WHERE t.operating_company_id = $1::uuid
        AND ($2::uuid IS NULL OR t.assigned_to_user_id = $2::uuid)
        AND ($3::uuid IS NULL OR t.created_by_user_id = $3::uuid)
        AND ($4::text IS NULL OR t.status = $4::text)
        AND (
          $5::text IS NULL
          OR assignee.role::text = $5::text
        )
        AND (
          $6::date IS NULL
          OR (t.due_at IS NOT NULL AND (t.due_at AT TIME ZONE 'UTC')::date = $6::date)
        )
        AND (
          $7::boolean IS NULL
          OR $7::boolean = false
          OR (t.due_at IS NOT NULL AND t.due_at < now() AND t.status NOT IN ('completed','cancelled'))
        )
      ORDER BY
        CASE WHEN t.status IN ('completed','cancelled') THEN 1 ELSE 0 END ASC,
        t.due_at NULLS LAST,
        t.created_at DESC
      LIMIT 200
    `,
    [
      q.operating_company_id,
      q.assignee ?? null,
      q.created_by ?? null,
      q.status ?? null,
      q.team ?? null,
      q.date ?? null,
      q.overdue ?? null,
    ]
  );
  return { tasks: rows.rows };
}

export async function listTaskEvents(
  client: QueryableClient,
  args: { actorUserId: string; actorRole: string; taskId: string }
) {
  const task = await loadTaskById(client, args.taskId);
  if (!task) return { error: "not_found" as const };
  if (!canManageTask(args.actorRole, args.actorUserId, task)) return { error: "forbidden" as const };

  const events = await client.query<Record<string, unknown>>(
    `
      SELECT e.*
      FROM ops.daily_task_events e
      WHERE e.daily_task_id = $1::uuid
      ORDER BY e.created_at ASC
    `,
    [args.taskId]
  );
  return { events: events.rows };
}

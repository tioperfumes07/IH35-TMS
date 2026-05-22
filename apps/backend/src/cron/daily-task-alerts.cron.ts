import type { FastifyInstance } from "fastify";
import { withLuciaBypass } from "../auth/db.js";
import { assertTenantContext } from "./_helpers/tenant-context-guard.js";

let timer: NodeJS.Timeout | undefined;
const CRON_NAME = "daily.task_alerts_cron";

function intervalMs(): number {
  const raw = Number(process.env.DAILY_TASK_ALERTS_INTERVAL_MS ?? "60000");
  return Number.isFinite(raw) && raw >= 10000 ? raw : 60000;
}

async function enqueueAlertAndEmail(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> },
  args: {
    taskId: string;
    operatingCompanyId: string;
    targetUserId: string;
    title: string;
    bodyText: string;
    alertType: "nearing_due" | "overdue";
  }
) {
  assertTenantContext(args.operatingCompanyId, CRON_NAME);
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
    [args.operatingCompanyId, args.taskId, args.alertType, args.targetUserId, JSON.stringify({ task_id: args.taskId })]
  );

  const emailRes = await client.query(`SELECT email::text AS email FROM identity.users WHERE id = $1::uuid LIMIT 1`, [
    args.targetUserId,
  ]);
  const to = emailRes.rows[0]?.email ? String(emailRes.rows[0].email) : "";
  if (!to) return;

  const queueRes = await client.query(
    `
      INSERT INTO email.email_queue (
        operating_company_id,
        to_addresses,
        subject,
        template_key,
        template_vars,
        status
      )
      VALUES ($1::uuid, $2::text[], $3, 'notification-dispatch', $4::jsonb, 'queued')
      RETURNING id
    `,
    [args.operatingCompanyId, [to], args.title, JSON.stringify({ title: args.title, bodyText: args.bodyText })]
  );

  const queueId = String(queueRes.rows[0]?.id ?? "");
  if (!queueId) return;
}

export function initializeDailyTaskAlertsCron(app: FastifyInstance) {
  if (process.env.DAILY_TASK_ALERTS_ENABLED === "false") {
    app.log.info("[daily-task-alerts] disabled via DAILY_TASK_ALERTS_ENABLED=false");
    return;
  }
  const ms = intervalMs();

  const tick = async () => {
    try {
      await withLuciaBypass(async (client) => {
        const reg = await client.query<{ ok: boolean }>(`SELECT to_regclass('ops.daily_tasks') IS NOT NULL AS ok`);
        if (!reg.rows[0]?.ok) return;

        const nearing = await client.query<{
          id: string;
          operating_company_id: string;
          assigned_to_user_id: string;
          title: string;
          due_at: string | null;
        }>(
          `
            SELECT t.id, t.operating_company_id::text, t.assigned_to_user_id::text, t.title::text, t.due_at::text
            FROM ops.daily_tasks t
            WHERE t.status IN ('created', 'accepted')
              AND t.due_at IS NOT NULL
              AND t.due_at > now()
              AND t.due_at <= now() + interval '2 hours'
              AND NOT EXISTS (
                SELECT 1
                FROM ops.daily_task_alerts a
                WHERE a.daily_task_id = t.id
                  AND a.alert_type = 'nearing_due'
                  AND a.target_user_id = t.assigned_to_user_id
              )
            LIMIT 100
          `
        );

        for (const t of nearing.rows) {
          await enqueueAlertAndEmail(client, {
            taskId: String(t.id),
            operatingCompanyId: String(t.operating_company_id),
            targetUserId: String(t.assigned_to_user_id),
            title: `Daily Task nearing due: ${String(t.title ?? "")}`,
            bodyText: `Task is due soon (${String(t.due_at ?? "")}).`,
            alertType: "nearing_due",
          });
        }

        const overdue = await client.query<{
          id: string;
          operating_company_id: string;
          assigned_to_user_id: string;
          title: string;
          due_at: string | null;
        }>(
          `
            SELECT t.id, t.operating_company_id::text, t.assigned_to_user_id::text, t.title::text, t.due_at::text
            FROM ops.daily_tasks t
            WHERE t.status IN ('created', 'accepted')
              AND t.due_at IS NOT NULL
              AND t.due_at < now()
              AND NOT EXISTS (
                SELECT 1
                FROM ops.daily_task_alerts a
                WHERE a.daily_task_id = t.id
                  AND a.alert_type = 'overdue'
                  AND a.target_user_id = t.assigned_to_user_id
              )
            LIMIT 100
          `
        );

        for (const t of overdue.rows) {
          await enqueueAlertAndEmail(client, {
            taskId: String(t.id),
            operatingCompanyId: String(t.operating_company_id),
            targetUserId: String(t.assigned_to_user_id),
            title: `Daily Task overdue: ${String(t.title ?? "")}`,
            bodyText: `Task is overdue (due ${String(t.due_at ?? "")}).`,
            alertType: "overdue",
          });
        }
      });
    } catch (err) {
      app.log.error({ err }, "[daily-task-alerts] tick failed");
    }
  };

  void tick();
  timer = setInterval(() => {
    void tick();
  }, ms);
  app.log.info({ ms }, "[daily-task-alerts] started");
}

export function stopDailyTaskAlertsCron() {
  if (timer) clearInterval(timer);
  timer = undefined;
}

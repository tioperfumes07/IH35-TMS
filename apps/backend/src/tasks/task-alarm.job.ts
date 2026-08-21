// TASKS-PLANNER-V2-CONNECTIVITY — task alarm reminders.
// Reuses the existing notification center (notifications.user_notifications via createNotification).
// Scans tasks whose alarm_at has arrived, are still actionable, and have not yet been notified;
// creates an in-app notification for the assignee and stamps alarm_notified_at so it fires once.
// NON-FINANCIAL. Additive cron mirroring compliance-reminder.job.ts.
import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { assertTenantContext } from "../cron/_helpers/tenant-context-guard.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { createNotification } from "../notifications/notification.service.js";

let initialized = false;

// Set BOTH GUCs: tasks.task RLS gates on app.current_operating_company_id, createNotification uses
// app.operating_company_id. (Same dual-scope the tasks routes set.)
const SET_TASK_SCOPE_SQL =
  `SELECT set_config('app.operating_company_id', $1::text, true), set_config('app.current_operating_company_id', $1::text, true)`;

export async function runTaskAlarmTick(operatingCompanyId: string): Promise<number> {
  return withLuciaBypass(async (client) => {
    await client.query(SET_TASK_SCOPE_SQL, [operatingCompanyId]);

    const due = await client.query<{
      task_id: string;
      title: string;
      assigned_to_user_id: string;
      due_date: string | null;
      alarm_at: string;
    }>(
      `SELECT task_id::text, title, assigned_to_user_id::text, due_date, alarm_at
         FROM tasks.task
        WHERE operating_company_id = $1::uuid
          AND is_active = true
          AND alarm_at IS NOT NULL
          AND alarm_at <= now()
          AND alarm_notified_at IS NULL
          AND status NOT IN ('completed', 'cancelled')
        ORDER BY alarm_at ASC
        LIMIT 500`,
      [operatingCompanyId]
    );

    let fired = 0;
    for (const task of due.rows) {
      try {
        await createNotification(
          {
            operating_company_id: operatingCompanyId,
            user_id: task.assigned_to_user_id,
            type: "system",
            severity: "medium",
            title: `Task reminder: ${task.title}`,
            body: task.due_date ? `Due ${task.due_date}.` : "This task needs attention.",
            action_link: `/tasks`,
            entity_type: "task",
            entity_id: task.task_id,
            source_block: "task_alarm",
          },
          client
        );
        // Re-assert scope (createNotification set app.operating_company_id only) before the tasks UPDATE.
        await client.query(SET_TASK_SCOPE_SQL, [operatingCompanyId]);
        await client.query(
          `UPDATE tasks.task SET alarm_notified_at = now() WHERE task_id = $1::uuid`,
          [task.task_id]
        );
        fired++;
      } catch {
        // best-effort per task; a failure leaves alarm_notified_at NULL so the next tick retries.
      }
    }
    return fired;
  });
}

export function initializeTaskAlarmCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;
  if (process.env.ENABLE_TASK_ALARM_CRON === "false") {
    app.log.info("Task alarm cron disabled via ENABLE_TASK_ALARM_CRON=false");
    return;
  }

  // Every 15 minutes — alarms are minute-granular, this keeps them timely without hammering.
  cron.schedule(
    "*/15 * * * *",
    async () => {
      await wrapBackgroundJobTick(
        "tasks.alarm_cron",
        async () => {
          await withLuciaBypass(async (client) => {
            const companies = await client.query<{ id: string }>(`SELECT id::text FROM org.companies WHERE is_active = true`);
            for (const company of companies.rows) {
              assertTenantContext(company.id, "tasks.alarm_cron");
              await runTaskAlarmTick(company.id);
            }
          });
        },
        app.log
      );
    },
    {
      maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */, timezone: "America/Chicago" }
  );
  app.log.info("Task alarm cron scheduled (every 15 minutes, America/Chicago)");
}

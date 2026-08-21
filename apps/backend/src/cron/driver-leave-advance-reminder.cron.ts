// P8C-K — Driver Scheduler advance-reminder cron (GAP 1a).
// Notifies the driver (web push) + the scheduler office reviewers (in-app notification) 14 / 7 / 3 days
// before an APPROVED leave start. Fires ONCE per (leave_request, threshold): idempotency is derived
// from safety.driver_leave_audit_log — a `leave_advance_reminder` event carrying the threshold_days is
// appended after each fire, and the NOT-EXISTS check on that marker excludes already-notified thresholds.
// No schema change / no migration — the append-only audit log doubles as the notified-at ledger.
//
// Cross-tenant sweep runs under withLuciaBypass; each candidate row carries its own operating_company_id
// which is validated (assertTenantContext) before it is set as DB context + used as the notification scope.
// Default OFF: set DRIVER_LEAVE_ADVANCE_REMINDER_CRON_ENABLED=true to arm it.
import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { assertTenantContext } from "./_helpers/tenant-context-guard.js";
import { createNotification, listCompanyNotifyUserIds } from "../notifications/notification.service.js";
import { dispatchDriverWebPush } from "../notifications/web-push-dispatcher.js";

const CRON_NAME = "safety.driver_leave_advance_reminder";
const REMINDER_THRESHOLDS = [14, 7, 3] as const;
// Reviewer audience = the scheduler office roles (mirror isSchedulerOfficeRole in the routes).
const REVIEWER_ROLES = ["Owner", "Administrator", "Safety", "Dispatcher"];

let initialized = false;

type QueryClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

type ReminderRow = {
  leave_request_id: string;
  operating_company_id: string;
  driver_id: string;
  request_number: string;
  leave_type: string;
  effective_start_date: string;
  days_out: number;
  driver_name: string;
};

/** Approved, upcoming leave requests whose effective start is exactly a reminder threshold away. */
async function loadDueReminders(client: QueryClient): Promise<ReminderRow[]> {
  const res = await client.query<ReminderRow>(
    `
      SELECT
        r.id::text AS leave_request_id,
        r.operating_company_id::text AS operating_company_id,
        r.driver_id::text AS driver_id,
        r.request_number,
        r.leave_type,
        COALESCE(r.approved_start_date, r.start_date)::text AS effective_start_date,
        (COALESCE(r.approved_start_date, r.start_date) - CURRENT_DATE)::int AS days_out,
        concat_ws(' ', d.first_name, d.last_name) AS driver_name
      FROM safety.driver_leave_requests r
      JOIN mdata.drivers d ON d.id = r.driver_id AND d.operating_company_id = r.operating_company_id
      WHERE r.status = 'approved'
        AND r.voided_at IS NULL
        AND (COALESCE(r.approved_start_date, r.start_date) - CURRENT_DATE) = ANY($1::int[])
      ORDER BY r.operating_company_id, effective_start_date
      LIMIT 1000
    `,
    [REMINDER_THRESHOLDS]
  );
  return res.rows;
}

/** Has this threshold already been reminded for this request? (append-only audit log = notified ledger). */
async function alreadyReminded(
  client: QueryClient,
  leaveRequestId: string,
  thresholdDays: number
): Promise<boolean> {
  const res = await client.query(
    `
      SELECT 1
      FROM safety.driver_leave_audit_log
      WHERE leave_request_id = $1
        AND event_type = 'leave_advance_reminder'
        AND (event_payload->>'threshold_days')::int = $2
      LIMIT 1
    `,
    [leaveRequestId, thresholdDays]
  );
  return res.rows.length > 0;
}

/** One tick: fire driver + reviewer reminders for each due (request, threshold) not yet notified. */
export async function runDriverLeaveAdvanceReminderTick(): Promise<number> {
  let fired = 0;
  const rows = await withLuciaBypass((client) => loadDueReminders(client));

  for (const row of rows) {
    assertTenantContext(row.operating_company_id, CRON_NAME);
    const threshold = row.days_out;

    const seen = await withLuciaBypass((client) => alreadyReminded(client, row.leave_request_id, threshold));
    if (seen) continue;

    // Driver-facing web push (best-effort; a missing subscription must not block the reviewer alert).
    await dispatchDriverWebPush({
      operatingCompanyId: row.operating_company_id,
      driverId: row.driver_id,
      title: "Upcoming time off",
      body: `Your ${row.leave_type} leave (${row.request_number}) starts in ${threshold} day${threshold === 1 ? "" : "s"} on ${row.effective_start_date}.`,
      tag: `leave-reminder-${row.leave_request_id}`,
      data: {
        kind: "leave_advance_reminder",
        leave_request_id: row.leave_request_id,
        threshold_days: String(threshold),
      },
    });

    // Reviewer in-app notifications (scheduler office roles for this tenant).
    const reviewerIds = await withLuciaBypass((client) =>
      listCompanyNotifyUserIds(client, row.operating_company_id, REVIEWER_ROLES)
    );
    for (const userId of reviewerIds) {
      await createNotification({
        operating_company_id: row.operating_company_id,
        user_id: userId,
        type: "driver_alert",
        severity: "info",
        title: "Driver time off approaching",
        body: `${row.driver_name} — ${row.leave_type} leave (${row.request_number}) starts in ${threshold} day${threshold === 1 ? "" : "s"} on ${row.effective_start_date}.`,
        entity_type: "driver_leave_request",
        entity_id: row.leave_request_id,
        source_block: "P8C-K",
      });
    }

    // Append the audit event — records the mutation AND arms the per-threshold idempotency marker.
    assertTenantContext(row.operating_company_id, CRON_NAME);
    await withLuciaBypass(async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [row.operating_company_id]);
      await client.query(
        `
          INSERT INTO safety.driver_leave_audit_log (
            operating_company_id, leave_request_id, event_type, event_payload, actor_name
          ) VALUES ($1, $2, 'leave_advance_reminder', $3::jsonb, 'system:advance-reminder-cron')
        `,
        [
          row.operating_company_id,
          row.leave_request_id,
          JSON.stringify({
            threshold_days: threshold,
            effective_start_date: row.effective_start_date,
            reviewer_recipients: reviewerIds.length,
          }),
        ]
      );
    });
    fired += 1;
  }
  return fired;
}

export function initializeDriverLeaveAdvanceReminderCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;

  if ((process.env.DRIVER_LEAVE_ADVANCE_REMINDER_CRON_ENABLED ?? "false").trim() !== "true") {
    app.log.info(
      "Driver leave advance-reminder cron disabled (set DRIVER_LEAVE_ADVANCE_REMINDER_CRON_ENABLED=true to enable)"
    );
    return;
  }

  // Daily at 07:00 America/Chicago — one pass covers each of the 14/7/3-day thresholds as they land.
  cron.schedule(
    "0 7 * * *",
    async () => {
      await wrapBackgroundJobTick(
        CRON_NAME,
        async () => {
          const fired = await runDriverLeaveAdvanceReminderTick();
          if (fired > 0) app.log.info({ fired }, "driver leave advance reminders sent");
        },
        app.log
      );
    },
    {
      maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */, timezone: "America/Chicago" }
  );

  app.log.info("Driver leave advance-reminder cron scheduled (daily 07:00 America/Chicago)");
}

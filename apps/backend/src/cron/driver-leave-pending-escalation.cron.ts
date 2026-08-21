// P8C-K — Driver Scheduler pending-request escalation cron (GAP 1c).
// Escalates leave requests still in `pending_review` more than 5 days after creation by notifying the
// escalation target (scheduler office reviewers) so a stale request never sits unreviewed. Fires ONCE per
// request: idempotency is derived from safety.driver_leave_audit_log — a `leave_pending_escalated` event is
// appended after escalation and the NOT-EXISTS check on that marker excludes already-escalated requests.
// No schema change / no migration — the append-only audit log doubles as the escalated-at ledger.
//
// Cross-tenant sweep under withLuciaBypass; each candidate carries its own operating_company_id, validated
// (assertTenantContext) before it is set as DB context + used as the notification scope.
// Default OFF: set DRIVER_LEAVE_PENDING_ESCALATION_CRON_ENABLED=true to arm it.
import type { FastifyInstance } from "fastify";
import cron from "node-cron";
import { withLuciaBypass } from "../auth/db.js";
import { wrapBackgroundJobTick } from "../lib/background-jobs.js";
import { assertTenantContext } from "./_helpers/tenant-context-guard.js";
import { createNotification, listCompanyNotifyUserIds } from "../notifications/notification.service.js";

const CRON_NAME = "safety.driver_leave_pending_escalation";
const STALE_AFTER_DAYS = 5;
// Escalation target = the scheduler office roles (mirror isSchedulerOfficeRole in the routes).
const ESCALATION_ROLES = ["Owner", "Administrator", "Safety", "Dispatcher"];

let initialized = false;

type QueryClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

type StaleRow = {
  leave_request_id: string;
  operating_company_id: string;
  request_number: string;
  leave_type: string;
  start_date: string;
  days_pending: number;
  driver_name: string;
};

/** Pending-review requests older than the stale threshold that have NOT been escalated yet. */
async function loadStalePending(client: QueryClient): Promise<StaleRow[]> {
  const res = await client.query<StaleRow>(
    `
      SELECT
        r.id::text AS leave_request_id,
        r.operating_company_id::text AS operating_company_id,
        r.request_number,
        r.leave_type,
        r.start_date::text AS start_date,
        (CURRENT_DATE - r.created_at::date)::int AS days_pending,
        concat_ws(' ', d.first_name, d.last_name) AS driver_name
      FROM safety.driver_leave_requests r
      JOIN mdata.drivers d ON d.id = r.driver_id AND d.operating_company_id = r.operating_company_id
      WHERE r.status = 'pending_review'
        AND r.voided_at IS NULL
        AND r.created_at < now() - ($1 * interval '1 day')
        AND NOT EXISTS (
          SELECT 1 FROM safety.driver_leave_audit_log a
          WHERE a.leave_request_id = r.id
            AND a.event_type = 'leave_pending_escalated'
        )
      ORDER BY r.operating_company_id, r.created_at ASC
      LIMIT 1000
    `,
    [STALE_AFTER_DAYS]
  );
  return res.rows;
}

/** One tick: escalate each stale pending request to its tenant's reviewers, once. */
export async function runDriverLeavePendingEscalationTick(): Promise<number> {
  let fired = 0;
  const rows = await withLuciaBypass((client) => loadStalePending(client));

  for (const row of rows) {
    assertTenantContext(row.operating_company_id, CRON_NAME);

    const reviewerIds = await withLuciaBypass((client) =>
      listCompanyNotifyUserIds(client, row.operating_company_id, ESCALATION_ROLES)
    );
    for (const userId of reviewerIds) {
      await createNotification({
        operating_company_id: row.operating_company_id,
        user_id: userId,
        type: "driver_alert",
        severity: "high",
        title: "Leave request awaiting review",
        body: `${row.driver_name} — ${row.leave_type} leave (${row.request_number}) has been pending review for ${row.days_pending} days (starts ${row.start_date}).`,
        entity_type: "driver_leave_request",
        entity_id: row.leave_request_id,
        source_block: "P8C-K",
      });
    }

    // Append the audit event — records the mutation AND arms the once-per-request idempotency marker.
    await withLuciaBypass(async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [row.operating_company_id]);
      await client.query(
        `
          INSERT INTO safety.driver_leave_audit_log (
            operating_company_id, leave_request_id, event_type, event_payload, actor_name
          ) VALUES ($1, $2, 'leave_pending_escalated', $3::jsonb, 'system:pending-escalation-cron')
        `,
        [
          row.operating_company_id,
          row.leave_request_id,
          JSON.stringify({ days_pending: row.days_pending, escalated_recipients: reviewerIds.length }),
        ]
      );
    });
    fired += 1;
  }
  return fired;
}

export function initializeDriverLeavePendingEscalationCron(app: FastifyInstance) {
  if (initialized) return;
  initialized = true;

  if ((process.env.DRIVER_LEAVE_PENDING_ESCALATION_CRON_ENABLED ?? "false").trim() !== "true") {
    app.log.info(
      "Driver leave pending-escalation cron disabled (set DRIVER_LEAVE_PENDING_ESCALATION_CRON_ENABLED=true to enable)"
    );
    return;
  }

  // Daily at 07:30 America/Chicago — just after the advance-reminder pass.
  cron.schedule(
    "30 7 * * *",
    async () => {
      await wrapBackgroundJobTick(
        CRON_NAME,
        async () => {
          const fired = await runDriverLeavePendingEscalationTick();
          if (fired > 0) app.log.info({ fired }, "driver leave pending requests escalated");
        },
        app.log
      );
    },
    {
      maxRandomDelay: 20000 /* cron-stagger (code only) — see PROD-OUTAGE-STEADY-STATE-CRON-PILEUP-CONFIRMED */, timezone: "America/Chicago" }
  );

  app.log.info("Driver leave pending-escalation cron scheduled (daily 07:30 America/Chicago)");
}

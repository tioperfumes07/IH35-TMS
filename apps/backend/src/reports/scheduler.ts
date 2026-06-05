import type { FastifyInstance } from "fastify";
import { withLuciaBypass } from "../auth/db.js";
import { runScheduledReport, type ScheduledReportId } from "./scheduled-report-runner.js";

const TIMEZONE = "America/Chicago";
const POLL_MS = 5 * 60 * 1000;

function addCadence(from: Date, cadence: string): Date {
  const next = new Date(from);
  if (cadence === "daily") {
    next.setUTCDate(next.getUTCDate() + 1);
    return next;
  }
  if (cadence === "weekly") {
    next.setUTCDate(next.getUTCDate() + 7);
    return next;
  }
  if (cadence === "monthly") {
    next.setUTCMonth(next.getUTCMonth() + 1);
    return next;
  }
  if (cadence === "quarterly") {
    next.setUTCMonth(next.getUTCMonth() + 3);
    return next;
  }
  next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

async function processDueSchedules(log: FastifyInstance["log"]) {
  if (process.env.ENABLE_REPORTS_ROLE_SCHEDULER === "false") return;

  await withLuciaBypass(async (client) => {
    const dueRes = await client.query(
      `
        SELECT id, operating_company_id, report_id, cadence, recipient_roles, send_at_local_time
        FROM reports.scheduled_reports
        WHERE enabled = true
          AND is_active = true
          AND (next_due_at IS NULL OR next_due_at <= now())
        ORDER BY next_due_at NULLS FIRST
        LIMIT 50
      `
    );

    for (const row of dueRes.rows) {
      const reportId = String(row.report_id) as ScheduledReportId;
      const operatingCompanyId = String(row.operating_company_id);
      const cadence = String(row.cadence ?? "daily");
      const recipientRoles = Array.isArray(row.recipient_roles) ? (row.recipient_roles as string[]) : [];

      try {
        await runScheduledReport({
          reportId,
          operatingCompanyId,
          recipientRoles,
          trigger: "scheduled",
        });

        const nextDue = addCadence(new Date(), cadence);
        await client.query(
          `
            UPDATE reports.scheduled_reports
            SET last_sent_at = now(), next_due_at = $2
            WHERE id = $1::uuid
          `,
          [row.id, nextDue.toISOString()]
        );
      } catch (error) {
        log.error({ err: error, reportId, operatingCompanyId }, "reports role scheduler run failed");
      }
    }
  });
}

let timer: NodeJS.Timeout | undefined;

export function initializeReportsRoleScheduler(app: FastifyInstance) {
  if (timer) return;
  if (process.env.ENABLE_REPORTS_ROLE_SCHEDULER === "false") {
    app.log.info("Reports role scheduler disabled via ENABLE_REPORTS_ROLE_SCHEDULER=false");
    return;
  }

  timer = setInterval(() => {
    void processDueSchedules(app.log);
  }, POLL_MS);

  setTimeout(() => void processDueSchedules(app.log), 15_000);
  app.log.info(`Reports role scheduler initialized (poll every ${POLL_MS / 1000}s, tz=${TIMEZONE})`);
}

export function stopReportsRoleScheduler() {
  if (timer) clearInterval(timer);
  timer = undefined;
}

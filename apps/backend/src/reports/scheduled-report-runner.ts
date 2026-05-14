import { withLuciaBypass } from "../auth/db.js";
import { enqueueEmail } from "../email/queue.service.js";
import { cashArDailyHtml, cashArDailyText } from "../notifications/templates/reports/cash-ar-daily.js";
import { dispatchBoardDailyHtml, dispatchBoardDailyText } from "../notifications/templates/reports/dispatch-board-daily.js";
import { driverSettlementsWeeklyHtml, driverSettlementsWeeklyText } from "../notifications/templates/reports/driver-settlements-weekly.js";
import { iftaQuarterlyHtml, iftaQuarterlyText } from "../notifications/templates/reports/ifta-quarterly.js";
import { maintenanceWeeklyHtml, maintenanceWeeklyText } from "../notifications/templates/reports/maintenance-weekly.js";
import { profitPerTruckWeeklyHtml, profitPerTruckWeeklyText } from "../notifications/templates/reports/profit-per-truck-weekly.js";
import { cashArDailyQuery } from "./queries/cash-ar-daily.js";
import { dispatchBoardDailyQuery } from "./queries/dispatch-board-daily.js";
import { driverSettlementsWeeklyQuery } from "./queries/driver-settlements-weekly.js";
import { iftaQuarterlyQuery } from "./queries/ifta-quarterly.js";
import { maintenanceWeeklyQuery } from "./queries/maintenance-weekly.js";
import { profitPerTruckWeeklyQuery } from "./queries/profit-per-truck-weekly.js";
import { type ReportDataEnvelope } from "./queries/shared.js";

export type ScheduledReportId =
  | "dispatch-board"
  | "cash-position-ar"
  | "profit-per-truck-week"
  | "settlements-ready"
  | "maintenance-open-wos"
  | "ifta-quarterly-state";

type RecipientRole = "Owner" | "Accountant" | "Safety";

type RunnerResult = {
  status: "sent" | "skipped_empty" | "skipped_duplicate";
  report_id: ScheduledReportId;
  operating_company_id: string;
  sent_to: string[];
  queue_id: string | null;
  report_data_summary: string;
};

type RunnerContext = {
  reportId: ScheduledReportId;
  operatingCompanyId: string;
  recipientRoles: string[];
  trigger: "scheduled" | "manual";
  actorUserId?: string | null;
};

const RECIPIENT_BY_ROLE: Record<RecipientRole, string> = {
  // TODO(T11.16.4): move recipient groups to DB-backed schema.
  Owner: "tioperfumes07@gmail.com",
  Accountant: "tioperfumes07@gmail.com",
  Safety: "tioperfumes07@gmail.com",
};

function ctDateStamp(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function ctSubjectDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(date);
}

async function appendAuditEvent(
  eventClass: string,
  severity: "info" | "warning" | "critical",
  payload: Record<string, unknown>,
  actorUserId?: string | null
) {
  await withLuciaBypass(async (client) => {
    await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, $4::uuid, $5)`, [
      eventClass,
      severity,
      JSON.stringify(payload),
      actorUserId ?? null,
      "P3-T11.16.3-SCHEDULED-REPORTS",
    ]);
  });
}

async function alreadySentToday(reportId: ScheduledReportId, operatingCompanyId: string) {
  const runDateCt = ctDateStamp();
  return withLuciaBypass(async (client) => {
    const res = await client.query(
      `
        SELECT EXISTS(
          SELECT 1
          FROM audit.audit_events
          WHERE event_class = 'reports.scheduled.sent'
            AND payload->>'report_id' = $1
            AND payload->>'operating_company_id' = $2
            AND payload->>'run_date_ct' = $3
        ) AS exists
      `,
      [reportId, operatingCompanyId, runDateCt]
    );
    return Boolean(res.rows[0]?.exists);
  });
}

async function executeReport(reportId: ScheduledReportId, operatingCompanyId: string) {
  const common = { operatingCompanyId };
  if (reportId === "dispatch-board") {
    const payload = await dispatchBoardDailyQuery(common);
    return {
      envelope: payload,
      subject: `Daily Dispatch Board — ${ctSubjectDate()}`,
      html: dispatchBoardDailyHtml(payload),
      text: dispatchBoardDailyText(payload),
    };
  }
  if (reportId === "cash-position-ar") {
    const payload = await cashArDailyQuery(common);
    return {
      envelope: payload,
      subject: `Daily Cash Position + AR Aging — ${ctSubjectDate()}`,
      html: cashArDailyHtml(payload),
      text: cashArDailyText(payload),
    };
  }
  if (reportId === "profit-per-truck-week") {
    const payload = await profitPerTruckWeeklyQuery(common);
    return {
      envelope: payload,
      subject: `Weekly Profit per Truck — ${ctSubjectDate()}`,
      html: profitPerTruckWeeklyHtml(payload),
      text: profitPerTruckWeeklyText(payload),
    };
  }
  if (reportId === "settlements-ready") {
    const payload = await driverSettlementsWeeklyQuery(common);
    return {
      envelope: payload,
      subject: `Weekly Driver Settlements — ${ctSubjectDate()}`,
      html: driverSettlementsWeeklyHtml(payload),
      text: driverSettlementsWeeklyText(payload),
    };
  }
  if (reportId === "maintenance-open-wos") {
    const payload = await maintenanceWeeklyQuery(common);
    return {
      envelope: payload,
      subject: `Weekly Maintenance + Open WOs — ${ctSubjectDate()}`,
      html: maintenanceWeeklyHtml(payload),
      text: maintenanceWeeklyText(payload),
    };
  }
  const payload = await iftaQuarterlyQuery(common);
  return {
    envelope: payload,
    subject: `Quarterly IFTA State-by-State — ${ctSubjectDate()}`,
    html: iftaQuarterlyHtml(payload),
    text: iftaQuarterlyText(payload),
  };
}

function resolveRecipients(recipientRoles: string[]): string[] {
  const recipients = new Set<string>();
  for (const rawRole of recipientRoles) {
    const role = rawRole as RecipientRole;
    if (role in RECIPIENT_BY_ROLE) recipients.add(RECIPIENT_BY_ROLE[role]);
  }
  return [...recipients];
}

function hasMeaningfulData(envelope: ReportDataEnvelope<unknown>): boolean {
  return envelope.rowCount > 0;
}

export async function runScheduledReport(ctx: RunnerContext): Promise<RunnerResult> {
  const recipients = resolveRecipients(ctx.recipientRoles);
  try {
    if (recipients.length === 0) {
      await appendAuditEvent(
        "reports.scheduled.skipped",
        "warning",
        {
          report_id: ctx.reportId,
          operating_company_id: ctx.operatingCompanyId,
          reason: "no_recipients",
          trigger: ctx.trigger,
        },
        ctx.actorUserId ?? null
      );
      return {
        status: "skipped_empty",
        report_id: ctx.reportId,
        operating_company_id: ctx.operatingCompanyId,
        sent_to: [],
        queue_id: null,
        report_data_summary: "No recipients",
      };
    }

    if (await alreadySentToday(ctx.reportId, ctx.operatingCompanyId)) {
      await appendAuditEvent(
        "reports.scheduled.skipped",
        "info",
        {
          report_id: ctx.reportId,
          operating_company_id: ctx.operatingCompanyId,
          reason: "already_sent_today",
          trigger: ctx.trigger,
        },
        ctx.actorUserId ?? null
      );
      return {
        status: "skipped_duplicate",
        report_id: ctx.reportId,
        operating_company_id: ctx.operatingCompanyId,
        sent_to: recipients,
        queue_id: null,
        report_data_summary: "Already sent today",
      };
    }

    const reportOutput = await executeReport(ctx.reportId, ctx.operatingCompanyId);
    if (!hasMeaningfulData(reportOutput.envelope)) {
      await appendAuditEvent(
        "reports.scheduled.skipped",
        "info",
        {
          report_id: ctx.reportId,
          operating_company_id: ctx.operatingCompanyId,
          reason: "empty_data",
          row_count: reportOutput.envelope.rowCount,
          summary: reportOutput.envelope.summary,
          trigger: ctx.trigger,
        },
        ctx.actorUserId ?? null
      );
      return {
        status: "skipped_empty",
        report_id: ctx.reportId,
        operating_company_id: ctx.operatingCompanyId,
        sent_to: recipients,
        queue_id: null,
        report_data_summary: reportOutput.envelope.summary,
      };
    }

    const queued = await enqueueEmail({
      operatingCompanyId: ctx.operatingCompanyId,
      toAddresses: recipients,
      subject: reportOutput.subject,
      templateKey: "report-cadence",
      templateVars: {
        subject: reportOutput.subject,
        htmlBody: reportOutput.html,
        textBody: reportOutput.text,
      },
      queuedByUserId: ctx.actorUserId ?? null,
    });

    await appendAuditEvent(
      "reports.scheduled.sent",
      "info",
      {
        report_id: ctx.reportId,
        operating_company_id: ctx.operatingCompanyId,
        run_date_ct: ctDateStamp(),
        row_count: reportOutput.envelope.rowCount,
        summary: reportOutput.envelope.summary,
        queue_id: queued.queueId,
        trigger: ctx.trigger,
        generated_at: reportOutput.envelope.generatedAt,
      },
      ctx.actorUserId ?? null
    );

    return {
      status: "sent",
      report_id: ctx.reportId,
      operating_company_id: ctx.operatingCompanyId,
      sent_to: recipients,
      queue_id: queued.queueId,
      report_data_summary: reportOutput.envelope.summary,
    };
  } catch (error) {
    await appendAuditEvent(
      "reports.scheduled.failed",
      "warning",
      {
        report_id: ctx.reportId,
        operating_company_id: ctx.operatingCompanyId,
        trigger: ctx.trigger,
        error: error instanceof Error ? error.message : "unknown_error",
      },
      ctx.actorUserId ?? null
    );
    throw error;
  }
}

export async function renderLegacyScheduledReportForDelivery(reportId: ScheduledReportId, operatingCompanyId: string) {
  return executeReport(reportId, operatingCompanyId);
}

export async function loadEnabledSchedules(reportId: ScheduledReportId) {
  return withLuciaBypass(async (client) => {
    const res = await client.query(
      `
        SELECT operating_company_id, recipient_roles
        FROM reports.scheduled_reports
        WHERE report_id = $1
          AND enabled = true
      `,
      [reportId]
    );
    return res.rows as Array<{ operating_company_id: string; recipient_roles: string[] | null }>;
  });
}


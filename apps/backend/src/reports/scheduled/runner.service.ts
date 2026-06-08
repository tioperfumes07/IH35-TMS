import { enqueueEmail } from "../../email/queue.service.js";
import type { EmailAttachment } from "../../email/provider.js";
import { getArAgingReport } from "../../accounting/ar-aging.service.js";
import { getProfitLossReport } from "../../accounting/profit-loss.service.js";
import { renderStatementPdf } from "../../accounting/statement-export-pdf.service.js";
import { renderStatementXlsx } from "../../accounting/statement-export-xlsx.service.js";
import { cashArDailyHtml, cashArDailyText } from "../../notifications/templates/reports/cash-ar-daily.js";
import { driverSettlementsWeeklyHtml, driverSettlementsWeeklyText } from "../../notifications/templates/reports/driver-settlements-weekly.js";
import { iftaQuarterlyHtml, iftaQuarterlyText } from "../../notifications/templates/reports/ifta-quarterly.js";
import { cashArDailyQuery } from "../queries/cash-ar-daily.js";
import { driverSettlementsWeeklyQuery } from "../queries/driver-settlements-weekly.js";
import { iftaQuarterlyQuery } from "../queries/ifta-quarterly.js";
import { buildScheduledReportFile } from "../../scheduled-reports/report-file-builder.js";
import type { ScheduledReportId } from "../scheduled-report-runner.js";
import { Q8_REPORT_LABELS, type CadenceInput } from "./cadence.js";
import {
  appendDeliveryLog,
  listDueSubscriptions,
  markSubscriptionSent,
  type ScheduledSubscription,
} from "./subscription.service.js";

const SYSTEM_ACTOR_ID = process.env.SYSTEM_ACTOR_USER_ID ?? "00000000-0000-0000-0000-000000000001";

const SLUG_TO_LEGACY: Partial<Record<string, ScheduledReportId>> = {
  "weekly-cash-position": "cash-position-ar",
  "weekly-driver-settlement-preview": "settlements-ready",
  "quarterly-ifta-preview": "ifta-quarterly-state",
};

function ctSubjectDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(date);
}

function uniqueRecipients(emails: string[]): string[] {
  return [...new Set(emails.map((v) => String(v).trim()).filter(Boolean))];
}

type GeneratedBundle = {
  subject: string;
  html: string;
  text: string;
  attachments?: EmailAttachment[] | null;
  summary: string;
};

async function generateWeeklyArAging60(operatingCompanyId: string): Promise<GeneratedBundle> {
  const asOf = new Date().toISOString().slice(0, 10);
  const report = await getArAgingReport({
    userId: SYSTEM_ACTOR_ID,
    operating_company_id: operatingCompanyId,
    as_of_date: asOf,
  });
  const rows = report.customers.filter((row) => row.d61_90 + row.d90_plus > 0);
  const lines = rows.map(
    (row) =>
      `${row.customer_name}: 61-90=$${(row.d61_90 / 100).toFixed(2)} 91+=$${(row.d90_plus / 100).toFixed(2)}`
  );
  const html = `<h1>A/R Aging &gt; 60 days</h1><p>As of ${asOf}</p><ul>${lines.map((l) => `<li>${l}</li>`).join("")}</ul>`;
  const text = `A/R Aging > 60 days as of ${asOf}\n${lines.join("\n")}`;
  return {
    subject: `Weekly A/R Aging > 60 Days — ${ctSubjectDate()}`,
    html,
    text,
    summary: `${rows.length} customers with balances over 60 days`,
  };
}

async function generateMonthlyPnl(
  operatingCompanyId: string,
  format: "pdf" | "xlsx" | "html"
): Promise<GeneratedBundle> {
  const end = new Date();
  const start = new Date(end.getFullYear(), end.getMonth() - 1, 1);
  const startIso = start.toISOString().slice(0, 10);
  const endIso = new Date(end.getFullYear(), end.getMonth(), 0).toISOString().slice(0, 10);
  const report = await getProfitLossReport({
    userId: SYSTEM_ACTOR_ID,
    operating_company_id: operatingCompanyId,
    from_date: startIso,
    to_date: endIso,
  });

  const summaryLine = `Net income: $${(report.net_income / 100).toFixed(2)}`;

  if (format === "html") {
    const html = `<h1>Monthly P&amp;L</h1><p>${startIso} to ${endIso}</p><p>${summaryLine}</p>`;
    return {
      subject: `Monthly P&L — ${ctSubjectDate()}`,
      html,
      text: `Monthly P&L ${startIso} to ${endIso}\n${summaryLine}`,
      summary: `P&L for ${startIso} to ${endIso}`,
    };
  }

  const buffer =
    format === "pdf"
      ? await renderStatementPdf({
          templateName: "profit-loss",
          viewModel: {
            title: "Profit and Loss",
            company_code: "COMPANY",
            period_label: `${startIso} to ${endIso}`,
            revenue_lines: report.revenue.lines,
            cogs_lines: report.cogs.lines,
            operating_expense_lines: report.operating_expenses.lines,
            gross_profit: report.gross_profit,
            net_income: report.net_income,
          },
        })
      : await renderStatementXlsx({
          sheetName: "P&L",
          rows: [
            ["Account", "Amount"],
            ...report.revenue.lines.map((line) => [line.account_name, line.amount / 100]),
            ["Net income", report.net_income / 100],
          ],
        });

  return {
    subject: `Monthly P&L — ${ctSubjectDate()}`,
    html: `<p>Monthly P&amp;L attached (${startIso} to ${endIso}).</p>`,
    text: `Monthly P&L attached (${startIso} to ${endIso}).`,
    summary: `P&L for ${startIso} to ${endIso}`,
    attachments: [
      {
        filename: `monthly-pnl.${format === "pdf" ? "pdf" : "xlsx"}`,
        contentBase64: buffer.toString("base64"),
        contentType: format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    ],
  };
}

async function generateSafetyDigest(operatingCompanyId: string): Promise<GeneratedBundle> {
  const { withLuciaBypass } = await import("../../auth/db.js");
  const rows = await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    const res = await client.query<{ title: string; severity: string; created_at: string }>(
      `
        SELECT title, severity, created_at::text
        FROM safety.integrity_alerts
        WHERE operating_company_id = $1::uuid
          AND created_at >= now() - interval '24 hours'
        ORDER BY created_at DESC
        LIMIT 50
      `,
      [operatingCompanyId]
    );
    return res.rows;
  });

  const lines = rows.map((row) => `[${row.severity}] ${row.title}`);
  const html = `<h1>Daily Safety Alerts Digest</h1><ul>${lines.map((l) => `<li>${l}</li>`).join("") || "<li>No alerts in the last 24 hours</li>"}</ul>`;
  return {
    subject: `Daily Safety Alerts Digest — ${ctSubjectDate()}`,
    html,
    text: lines.join("\n") || "No alerts in the last 24 hours",
    summary: `${rows.length} safety alerts in the last 24 hours`,
  };
}

async function generateFromLegacySlug(
  slug: string,
  operatingCompanyId: string,
  format: "pdf" | "xlsx" | "html"
): Promise<GeneratedBundle> {
  const legacyId = SLUG_TO_LEGACY[slug];
  if (!legacyId) throw new Error(`unsupported_report_slug:${slug}`);

  if (format === "html") {
    const common = { operatingCompanyId };
    if (legacyId === "cash-position-ar") {
      const payload = await cashArDailyQuery(common);
      return {
        subject: `Weekly Cash Position — ${ctSubjectDate()}`,
        html: cashArDailyHtml(payload),
        text: cashArDailyText(payload),
        summary: payload.summary,
      };
    }
    if (legacyId === "settlements-ready") {
      const payload = await driverSettlementsWeeklyQuery(common);
      return {
        subject: `Weekly Driver Settlement Preview — ${ctSubjectDate()}`,
        html: driverSettlementsWeeklyHtml(payload),
        text: driverSettlementsWeeklyText(payload),
        summary: payload.summary,
      };
    }
    const payload = await iftaQuarterlyQuery(common);
    return {
      subject: `Quarterly IFTA Preview — ${ctSubjectDate()}`,
      html: iftaQuarterlyHtml(payload),
      text: iftaQuarterlyText(payload),
      summary: payload.summary,
    };
  }

  const file = await buildScheduledReportFile(legacyId, operatingCompanyId, format === "xlsx" ? "xlsx" : "pdf");
  return {
    subject: file.subject,
    html: `<p>${Q8_REPORT_LABELS[slug as keyof typeof Q8_REPORT_LABELS] ?? slug} attached.</p>`,
    text: file.summary,
    summary: file.summary,
    attachments: [
      {
        filename: `${slug}.${file.extension}`,
        contentBase64: file.buffer.toString("base64"),
        contentType: file.contentType,
      },
    ],
  };
}

async function generateReportBundle(sub: ScheduledSubscription): Promise<GeneratedBundle> {
  const format = sub.delivery_format;
  if (sub.report_slug === "weekly-ar-aging-60") return generateWeeklyArAging60(sub.operating_company_id);
  if (sub.report_slug === "monthly-pnl") return generateMonthlyPnl(sub.operating_company_id, format);
  if (sub.report_slug === "daily-safety-alerts-digest") return generateSafetyDigest(sub.operating_company_id);
  return generateFromLegacySlug(sub.report_slug, sub.operating_company_id, format);
}

export async function deliverSubscription(sub: ScheduledSubscription): Promise<void> {
  const recipients = uniqueRecipients(sub.recipient_emails);
  if (recipients.length === 0) {
    await appendDeliveryLog({
      subscriptionUuid: sub.uuid,
      operatingCompanyId: sub.operating_company_id,
      status: "failed",
      errorMessage: "no_recipients",
      recipients: [],
    });
    return;
  }

  const cadence: CadenceInput = {
    cadence: sub.cadence,
    dayOfWeek: sub.day_of_week,
    dayOfMonth: sub.day_of_month,
    timeOfDay: sub.time_of_day,
    timezone: sub.timezone,
  };

  try {
    const bundle = await generateReportBundle(sub);
    await enqueueEmail({
      operatingCompanyId: sub.operating_company_id,
      toAddresses: recipients,
      subject: bundle.subject,
      templateKey: "report-cadence",
      templateVars: {
        subject: bundle.subject,
        htmlBody: bundle.html,
        textBody: bundle.text,
      },
      attachments: bundle.attachments ?? null,
      queuedByUserId: SYSTEM_ACTOR_ID,
    });

    const sentAt = new Date();
    await markSubscriptionSent(sub.uuid, sub.operating_company_id, cadence, sentAt);
    await appendDeliveryLog({
      subscriptionUuid: sub.uuid,
      operatingCompanyId: sub.operating_company_id,
      status: "success",
      recipients,
    });
  } catch (error) {
    await appendDeliveryLog({
      subscriptionUuid: sub.uuid,
      operatingCompanyId: sub.operating_company_id,
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "unknown_error",
      recipients,
    });
    throw error;
  }
}

export type RunDueSummary = {
  processed: number;
  succeeded: number;
  failed: number;
};

export async function runDue(now: Date = new Date()): Promise<RunDueSummary> {
  const due = await listDueSubscriptions(now);
  let succeeded = 0;
  let failed = 0;

  for (const sub of due) {
    try {
      await deliverSubscription(sub);
      succeeded += 1;
    } catch {
      failed += 1;
    }
  }

  return { processed: due.length, succeeded, failed };
}

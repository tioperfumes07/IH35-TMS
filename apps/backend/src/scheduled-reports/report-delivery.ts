import { enqueueEmail } from "../email/queue.service.js";
import { renderEmailTemplate } from "../email/render.js";
import { generatePresignedDownloadUrl, isR2Configured, putObjectBytes } from "../storage/r2-client.js";
import { computeDeliveryPeriod, type ScheduleFrequency } from "./next-run.js";
import { buildScheduledReportFile } from "./report-file-builder.js";

function renderSubjectTemplate(template: string, vars: Record<string, string>) {
  return template.replace(/\{([\w_]+)\}/g, (_, key: string) => vars[key] ?? `{${key}}`);
}

export type ScheduledReportDeliveryResult = {
  email_queue_id: string;
  generated_file_r2_path: string;
  file_size_bytes: number;
  subject: string;
  period_label: string;
  summary: string;
};

export async function deliverScheduledReportToEmail(opts: {
  operatingCompanyId: string;
  reportId: string;
  format: "pdf" | "xlsx" | "csv";
  recipientsTo: string[];
  cc?: string[] | null;
  bcc?: string[] | null;
  subjectTemplate: string;
  timezone: string;
  frequency: ScheduleFrequency;
  actorUserId: string | null;
  pathSegment: string;
}): Promise<ScheduledReportDeliveryResult> {
  if (!isR2Configured()) {
    throw new Error("r2_not_configured");
  }

  const period = computeDeliveryPeriod(opts.frequency, opts.timezone);
  const generated = await buildScheduledReportFile(opts.reportId, opts.operatingCompanyId, opts.format);
  const reportName = opts.reportId;
  const subject = renderSubjectTemplate(opts.subjectTemplate, {
    report_name: reportName,
    period: period.label,
    period_start: period.startIso,
    period_end: period.endIso,
  });

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const objectKey = `scheduled-reports/${opts.operatingCompanyId}/${opts.pathSegment}/${ts}.${generated.extension}`;
  await putObjectBytes(objectKey, generated.buffer, generated.contentType);
  const metaUrl = await generatePresignedDownloadUrl(objectKey, 60 * 60 * 24 * 7);

  const rendered = renderEmailTemplate("scheduled-report-file", {
    subject,
    reportName,
    periodLabel: period.label,
    summary: generated.summary,
    downloadUrl: metaUrl.url,
    format: opts.format.toUpperCase(),
  });

  const queued = await enqueueEmail({
    operatingCompanyId: opts.operatingCompanyId,
    toAddresses: opts.recipientsTo,
    ccAddresses: opts.cc?.length ? opts.cc : undefined,
    bccAddresses: opts.bcc?.length ? opts.bcc : undefined,
    subject,
    templateKey: "scheduled-report-file",
    templateVars: {
      subject,
      htmlBody: rendered.html,
      textBody: rendered.text,
      reportName,
      periodLabel: period.label,
      summary: generated.summary,
      downloadUrl: metaUrl.url,
      format: opts.format.toUpperCase(),
    },
    queuedByUserId: opts.actorUserId,
  });

  return {
    email_queue_id: queued.queueId,
    generated_file_r2_path: objectKey,
    file_size_bytes: generated.buffer.length,
    subject,
    period_label: period.label,
    summary: generated.summary,
  };
}

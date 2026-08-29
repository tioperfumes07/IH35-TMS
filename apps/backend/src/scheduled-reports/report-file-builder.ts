import puppeteer from "puppeteer";
import ExcelJS from "exceljs";
import { addArrayWorksheet, writeWorkbookBuffer } from "../lib/exceljs-workbook.js";
import type { ReportDataEnvelope } from "../reports/queries/shared.js";
import type { ScheduledReportId } from "../reports/scheduled-report-runner.js";
import { renderLegacyScheduledReportForDelivery } from "../reports/scheduled-report-runner.js";

const LEGACY_IDS = new Set<string>([
  "dispatch-board",
  "cash-position-ar",
  "profit-per-truck-week",
  "settlements-ready",
  "maintenance-open-wos",
  "ifta-quarterly-state",
]);

// GO-0045-SCHEDULED-REPORTS-UNSUPPORTED-REPORT-ID-SILENT-NEVER-SENDS: buildScheduledReportFile()
// can only actually generate these 6 legacy ids -- but the "Schedule a new report" picker
// (ScheduleReportModal.tsx) offers the full 19-entry apps/backend/src/reports/shared.ts
// REPORT_LIBRARY catalog, a completely disjoint namespace, with NO whitelist check on create/
// PATCH. A schedule created for any of those 19 ids inserted successfully (status='active') and
// only failed 3 delivery cycles later (up to 3 weeks for a weekly cadence) before flipping to
// 'failed' -- recipients silently never received anything the whole time, with no error shown
// anywhere in the UI. Exported so the create/PATCH routes can reject an unsupported id up front,
// and the frontend catalog can offer only ids that actually work.
export const LEGACY_SCHEDULED_REPORT_IDS: readonly string[] = Array.from(LEGACY_IDS);

export function isLegacyScheduledReportId(id: string): id is ScheduledReportId {
  return LEGACY_IDS.has(id);
}

export type GeneratedReportFile = {
  buffer: Buffer;
  contentType: string;
  extension: "pdf" | "xlsx" | "csv";
  summary: string;
  envelope: ReportDataEnvelope<unknown>;
  subject: string;
};

function csvEscape(value: string) {
  const needsQuotes = /[",\n\r]/.test(value);
  const escaped = value.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

function envelopeToRows(envelope: ReportDataEnvelope<unknown>): Array<[string, string]> {
  return [
    ["generatedAt", envelope.generatedAt],
    ["rowCount", String(envelope.rowCount)],
    ["summary", envelope.summary],
    ["data_json", JSON.stringify(envelope.data)],
  ];
}

// PROD-OUTAGE-SCHEDULED-REPORTS-PUPPETEER-ROOT-CAUSE-CONFIRMED (2026-08-21) — a stuck
// reporting.scheduled_reports row drove this function into a state that killed the whole Node
// process rather than throwing a catchable exception, and the worker's own next_run_at bookkeeping
// only advances on a JS-catchable failure — so the SAME poisoned row retried every tick forever,
// crash-looping production. Two independent hardenings, since either alone leaves a gap:
//   1. Container-safe launch args — headless Chrome commonly SIGSEGVs (not throws) on a
//      resource-constrained host without --disable-dev-shm-usage (tiny /dev/shm) or a sandbox that
//      the container's seccomp profile refuses; both are unrelated to this app's own code.
//   2. A hard wall-clock timeout via Promise.race — a hang (not a crash) inside Puppeteer would
//      otherwise block this call, and the process-level bookkeeping fix in
//      scheduled-reports-worker.ts's pessimistic next_run_at bump is the actual backstop for the
//      "kills the process outright" case this timeout cannot catch by definition.
const PDF_GENERATION_TIMEOUT_MS = 25_000;

export async function htmlToPdfBuffer(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  let timeoutHandle: NodeJS.Timeout | undefined;
  try {
    const generate = (async () => {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "load" });
      const pdf = await page.pdf({ format: "Letter", printBackground: true });
      return Buffer.from(pdf);
    })();
    const timeout = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(
        () => reject(new Error(`pdf_generation_timeout_after_${PDF_GENERATION_TIMEOUT_MS}ms`)),
        PDF_GENERATION_TIMEOUT_MS
      );
    });
    return await Promise.race([generate, timeout]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    await browser.close().catch(() => undefined);
  }
}

export async function buildScheduledReportFile(
  reportId: string,
  operatingCompanyId: string,
  format: "pdf" | "xlsx" | "csv"
): Promise<GeneratedReportFile> {
  if (!isLegacyScheduledReportId(reportId)) {
    throw new Error(`unsupported_report_id:${reportId}`);
  }

  const bundle = await renderLegacyScheduledReportForDelivery(reportId, operatingCompanyId);
  const envelope = bundle.envelope;

  if (format === "pdf") {
    const buffer = await htmlToPdfBuffer(bundle.html);
    return {
      buffer,
      contentType: "application/pdf",
      extension: "pdf",
      summary: envelope.summary,
      envelope,
      subject: bundle.subject,
    };
  }

  const rows = envelopeToRows(envelope);

  if (format === "csv") {
    const lines = rows.map(([k, v]) => `${csvEscape(k)},${csvEscape(v)}`);
    const buffer = Buffer.from(lines.join("\n"), "utf8");
    return {
      buffer,
      contentType: "text/csv",
      extension: "csv",
      summary: envelope.summary,
      envelope,
      subject: bundle.subject,
    };
  }

  const workbook = new ExcelJS.Workbook();
  addArrayWorksheet(workbook, "Report", rows);
  const buffer = await writeWorkbookBuffer(workbook);
  return {
    buffer,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    extension: "xlsx",
    summary: envelope.summary,
    envelope,
    subject: bundle.subject,
  };
}

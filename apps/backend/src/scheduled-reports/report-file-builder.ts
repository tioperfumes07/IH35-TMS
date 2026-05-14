import puppeteer from "puppeteer";
import * as XLSX from "xlsx";
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

export async function htmlToPdfBuffer(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({ format: "Letter", printBackground: true });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
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

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Report");
  const buffer = Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as ArrayBuffer);
  return {
    buffer,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    extension: "xlsx",
    summary: envelope.summary,
    envelope,
    subject: bundle.subject,
  };
}

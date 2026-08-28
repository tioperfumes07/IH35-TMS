import puppeteer from "puppeteer";
import type { DotAuditPdfPayload } from "./viewer.service.js";
import { companyBusinessDate } from "../../lib/company-business-date.js";

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatIsoDate(value: string): string {
  if (!value) return "—";
  // Keep YYYY-MM-DD as-is; longer ISO timestamps show date+time UTC label for DOT printouts.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return escapeHtml(value);
  return `${dt.toISOString().slice(0, 19).replace("T", " ")} UTC`;
}

/** Pure HTML builder — unit-tested without launching Chromium. */
export function buildEldAuditPdfHtml(payload: DotAuditPdfPayload): string {
  const rows =
    payload.edits.length === 0
      ? `<tr><td colspan="6">No ELD log edits in this period.</td></tr>`
      : payload.edits
          .map(
            (edit) => `
          <tr>
            <td>${escapeHtml(formatIsoDate(edit.edited_at))}</td>
            <td>${escapeHtml(edit.field_name)}</td>
            <td>${escapeHtml(edit.before_state)}</td>
            <td>${escapeHtml(edit.after_state)}</td>
            <td>${escapeHtml(edit.edited_by)}</td>
            <td>${escapeHtml(edit.reason)}</td>
          </tr>`
          )
          .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(payload.title)}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 11px; color: #111; margin: 24px; }
    h1 { font-size: 18px; margin: 0 0 8px; }
    .meta { color: #334155; margin: 4px 0; }
    .notice { margin: 12px 0 16px; padding: 8px; border: 1px solid #cbd5e1; background: #f8fafc; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #94a3b8; padding: 6px; text-align: left; vertical-align: top; }
    th { background: #e2e8f0; font-weight: 600; }
  </style>
</head>
<body>
  <h1>${escapeHtml(payload.title)}</h1>
  <p class="meta">Driver: ${escapeHtml(payload.driver_name ?? payload.driver_uuid)}</p>
  <p class="meta">Period: ${escapeHtml(payload.period.from)} to ${escapeHtml(payload.period.to)}</p>
  <p class="meta">Generated: ${escapeHtml(formatIsoDate(payload.generated_at))}</p>
  <p class="notice">${escapeHtml(payload.fmcsa_notice)}</p>
  <table>
    <thead>
      <tr>
        <th>Edited At</th>
        <th>Field</th>
        <th>Before</th>
        <th>After</th>
        <th>Edited By</th>
        <th>Reason</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
}

export async function renderEldAuditPdf(payload: DotAuditPdfPayload) {
  const html = buildEldAuditPdfHtml(payload);
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({ format: "Letter", printBackground: true });
    const pdfBuffer = Buffer.from(pdf);
    const driverSlug = String(payload.driver_name ?? payload.driver_uuid)
      .replace(/[^A-Za-z0-9_-]+/g, "_")
      .slice(0, 40);
    const date = payload.period.to || companyBusinessDate();
    return {
      pdfBuffer,
      filename: `ELD_Edit_History_${driverSlug}_${date}.pdf`,
      mimeType: "application/pdf" as const,
    };
  } finally {
    await browser.close();
  }
}

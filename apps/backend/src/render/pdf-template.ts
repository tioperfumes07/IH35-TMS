import { PDF_BASE_STYLES } from "./pdf-styles.inline.js";

export { PDF_BASE_STYLES };

export function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** Currency formatter — amounts are stored as integer cents. */
export function formatMoney(cents: number): string {
  const safe = Number.isFinite(cents) ? cents / 100 : 0;
  return safe.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function formatDate(value: Date | string | number | null | undefined, timeZone = "America/Chicago"): string {
  if (value === null || value === undefined) return "—";
  const dt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dt.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(dt);
}

export function formatDateTime(value: Date | string | number | null | undefined, timeZone = "America/Chicago"): string {
  if (value === null || value === undefined) return "—";
  const dt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dt.getTime())) return "—";
  const date = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", month: "short", day: "numeric" }).format(dt);
  const time = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit", hour12: true }).format(dt);
  const tzShort = timeZone === "America/Chicago" ? "CT" : "";
  return tzShort ? `${date} · ${time} ${tzShort}` : `${date} · ${time}`;
}

export function joinBrandAddrLines(lines: string[]): string {
  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => escapeHtml(line))
    .join("<br/>");
}

export function docIdFromLoadNumber(prefix: string, loadNumber: string | null | undefined): string | null {
  const raw = String(loadNumber ?? "").trim();
  const match = raw.match(/^L-(.+)$/i);
  if (!match) return null;
  return `${prefix}-${match[1]}`;
}

export function wrapPdfDocument(opts: { title: string; body: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(opts.title)}</title>
<style>${PDF_BASE_STYLES}</style>
</head>
<body>
<div class="scene">${opts.body}</div>
</body>
</html>`;
}

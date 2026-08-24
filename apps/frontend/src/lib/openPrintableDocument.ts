import { resolveApiUrl } from "../api/client";

/**
 * Open a canonical backend letter HTML document (wrapPdfDocument) and trigger print.
 * Never call window.print() on the SPA shell for invoices / settlements / dispatch sheets.
 */
export function openPrintableDocument(pathWithQuery: string): void {
  const absolute = resolveApiUrl(pathWithQuery);
  let url: URL;
  try {
    url = new URL(absolute);
  } catch {
    url = new URL(absolute, typeof window !== "undefined" ? window.location.origin : "http://localhost");
  }
  url.searchParams.set("print", "1");
  window.open(url.toString(), "_blank", "noopener,noreferrer");
}

/** Open letter HTML for viewing without auto-print (still canonical — no SPA chrome). */
export function openCanonicalDocument(pathWithQuery: string): void {
  window.open(resolveApiUrl(pathWithQuery), "_blank", "noopener,noreferrer");
}

/**
 * Client-built letter (cash-advance receipt, confirmations without a backend .html route yet).
 * Opens a blank document window — never window.print() on the SPA shell.
 */
export function printLetterHtml(opts: {
  title: string;
  bodyHtml: string;
  /** Optional @page size for wide tables (banking recon / register). */
  orientation?: "portrait" | "landscape";
}): boolean {
  const title = escapeHtml(opts.title);
  const pageSize = opts.orientation === "landscape" ? "landscape" : "portrait";
  const maxWidth = opts.orientation === "landscape" ? "1100px" : "720px";
  const doc = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${title}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Inter, Helvetica, Arial, sans-serif; font-size: 12px; color: #1a1a1a; background: #fff; }
  .doc { max-width: ${maxWidth}; margin: 24px auto; padding: 28px 32px; border: 1px solid #d0d0d0; }
  h1 { font-size: 16px; margin: 0 0 4px; }
  .meta { color: #555; font-size: 11px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 6px 4px; border-bottom: 1px solid #e5e5e5; font-size: 11px; }
  th { color: #555; font-weight: 600; }
  @page { size: ${pageSize}; margin: 0.4in; }
  @media print { .doc { border: none; margin: 0; padding: 12px; max-width: none; } }
</style>
</head>
<body>
<div class="doc">${opts.bodyHtml}</div>
<script>
(function () {
  window.addEventListener("load", function () {
    setTimeout(function () { window.print(); }, 200);
  });
})();
</script>
</body>
</html>`;
  const blob = new Blob([doc], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank", "noopener,noreferrer");
  if (!win) {
    URL.revokeObjectURL(url);
    return false;
  }
  // Revoke after the new window has a chance to load the blob.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

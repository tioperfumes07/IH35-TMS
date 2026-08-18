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

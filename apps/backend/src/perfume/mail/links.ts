/**
 * PERFUME mail engine — price lists sent as a DOWNLOAD LINK instead of an attachment (owner 2026-11-25 23:09 CT: "Check all
 * Emails mtz sends daily elegance as well … The engine is supposed to get the Lists automatically").
 *
 * Measured on the Mac Mail database, last 45 days: MTZ 163 emails, Nandansons 176, Classic 69, Elegance 68, Gift Express 41,
 * M&R 29 — all with NO attachment. Their emails (Constant Contact) carry a button "Download Excel PriceList" / "Download
 * PriceList in Excel" / "Complete Wholesale List in .xls format" whose link redirects to the file (Outlook may wrap it in a
 * safelinks URL). For a sender the owner set up as a vendor, the engine opens that link and saves the file exactly like an
 * attachment (same reader, same import, same holds). Only https, never an IP address or a local host, at most 3 links per
 * email, 20 MB, 30 s; a link that lands on a web page instead of a file is recorded as held with that reason.
 */
import type { GmailMessage, GmailPart } from "./gmail.js";

export const LINK_PREFIX = "Link · ";
export const MAX_LINKS_PER_EMAIL = 3;
export const LINK_TIMEOUT_MS = 30_000;
export type DownloadLink = { label: string; url: string; kind: "excel" | "csv" | "pdf" };

const decodeEntities = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&nbsp;|&#160;|&#xa0;/gi, " ").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));

/** The HTML body of a Gmail message (all text/html parts, nested multiparts included). */
export function htmlOf(m: GmailMessage): string {
  let out = "";
  const walk = (p: GmailPart | undefined) => {
    if (!p) return;
    if ((p.mimeType ?? "").toLowerCase() === "text/html" && p.body?.data) out += Buffer.from(p.body.data, "base64url").toString("utf8");
    for (const c of p.parts ?? []) walk(c);
  };
  walk(m.payload);
  return out;
}

/** Outlook "safelinks" wraps the real link in ?url=…; the real one is what the vendor sent. */
export function unwrapLink(href: string): string {
  try {
    const u = new URL(href);
    if (/\.safelinks\.protection\.outlook\.com$/i.test(u.hostname) && u.searchParams.get("url")) return u.searchParams.get("url")!;
  } catch { /* not a URL — returned as is and refused by safeUrl */ }
  return href;
}

/** Only a public https address: no IP literal, no localhost / .local / .internal. */
export function safeUrl(href: string): URL | null {
  try {
    const u = new URL(href);
    if (u.protocol !== "https:") return null;
    const h = u.hostname.toLowerCase();
    if (!h.includes(".") || /^[\d.]+$/.test(h) || h.includes(":") || /(^|\.)(localhost|local|internal|lan)$/.test(h)) return null;
    return u;
  } catch {
    return null;
  }
}

/** The price-list download buttons of an email, Excel / CSV first; a PDF only when no spreadsheet link is offered. */
export function downloadLinksOf(html: string): DownloadLink[] {
  const found: DownloadLink[] = [];
  const seen = new Set<string>();
  for (const [, href, inner] of html.matchAll(/<a\b[^>]*\bhref\s*=\s*"([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const label = decodeEntities(inner.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim().slice(0, 120);
    if (!label) continue;
    const kind: DownloadLink["kind"] | null = /excel|\bxlsx?\b|\.xlsx?\b/i.test(label) ? "excel" : /\bcsv\b/i.test(label) ? "csv"
      : /\bpdf\b/i.test(label) && /price|list|stock|inventory|catalog/i.test(label) ? "pdf" : null;
    if (!kind) continue;
    const url = unwrapLink(decodeEntities(href));
    if (!safeUrl(url) || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    found.push({ label, url, kind });
  }
  const sheets = found.filter((l) => l.kind !== "pdf");
  return (sheets.length ? sheets : found.filter((l) => /price|wholesale|stock|list/i.test(l.label))).slice(0, MAX_LINKS_PER_EMAIL);
}

/** What the bytes are, whatever the link or its headers call them. */
export function extensionOf(buf: Buffer, contentType: string): ".xlsx" | ".xls" | ".pdf" | ".csv" | null {
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b) return ".xlsx";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) return ".xls";
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return ".pdf";
  if (/text\/csv|application\/csv/i.test(contentType)) return ".csv";
  return null;
}

/** The file name a link is recorded under: "Link · Download Excel PriceList.xlsx" (stable per email, so never saved twice). */
export function linkFileName(label: string, ext: string): string {
  return `${LINK_PREFIX}${label.replace(/[\\/:*?"<>|]+/g, " ").trim()}${ext}`.slice(0, 300);
}

export type Downloaded = { ok: true; buf: Buffer; ext: ".xlsx" | ".xls" | ".pdf" | ".csv" } | { ok: false; reason: string };
export type DownloadImpl = (url: string) => Promise<{ status: number; contentType: string; finalUrl: string; buf: Buffer }>;

const defaultDownload: DownloadImpl = async (url) => {
  const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(LINK_TIMEOUT_MS), headers: { "User-Agent": "TIO-Perfumes-price-desk/1.0" } });
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, contentType: res.headers.get("content-type") ?? "", finalUrl: res.url || url, buf };
};

export async function downloadLink(link: DownloadLink, maxBytes: number, impl: DownloadImpl = defaultDownload): Promise<Downloaded> {
  let r: Awaited<ReturnType<DownloadImpl>>;
  try {
    r = await impl(link.url);
  } catch (e) {
    return { ok: false, reason: `The download link did not answer (${String((e as Error)?.message ?? e).slice(0, 120)}).` };
  }
  if (!safeUrl(r.finalUrl)) return { ok: false, reason: "The download link sent us to an address the desk does not open (not https or not public)." };
  if (r.status >= 400) return { ok: false, reason: `The download link answered ${r.status} — the vendor's file may have expired.` };
  if (r.buf.length > maxBytes) return { ok: false, reason: "The linked file is larger than 20 MB." };
  const ext = extensionOf(r.buf, r.contentType);
  if (!ext) return { ok: false, reason: "The download link opened a web page, not a price-list file — open it from the email and add the file on the Lists tab." };
  return { ok: true, buf: r.buf, ext };
}

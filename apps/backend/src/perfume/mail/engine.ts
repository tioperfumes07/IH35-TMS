/**
 * PERFUME mail price-list engine (owner 2026-11-25 17:29 CT): "AN ENGINE THAT AUTOMATICALLY GOES TO MY MAIL APP, GETS ALL
 * THE PRICE LISTS DAILY AND UPDATES THE APP WITH THE NEW PRICES … FROM TIOPERFUMES07@GMAIL.COM AND FROM JPM@TIOPERFUMES.COM."
 *
 * One run, per connected mailbox:
 *   1. Gmail search: mail with an .xlsx / .xls / .csv / .pdf attachment received in the window (default 3 days, so a missed
 *      morning is caught the next day; every file is recorded once, so the overlap never imports twice).
 *   2. Each attached file is matched to the owner's mail rules (sender address or @domain, optional file-name text).
 *      No rule → recorded as "from a sender not set up" (nothing downloaded); the owner assigns the vendor on the desk.
 *      An "ignore" rule → skipped.
 *   3. With a rule: download, read on the server (readers.ts — the Lists tab's own rules), pick the vendor's saved
 *      columns or the Lists tab's guess, and save through importList — the SAME import the Lists tab calls: the
 *      to-the-cent file-total check, a full list replaces the vendor's old one, a special list is kept next to it.
 *   4. HELD, never guessed: old .xls, a scanned PDF, no description / price column, no priced line, a list under half the
 *      size of the vendor's list in use (a partial list must not replace the whole one), a total that does not match.
 *      A held file stays on the desk with its reason; "Import anyway" / "Use this vendor" re-runs that one file.
 *
 * Runs as the desk owner (perfume.desk_users), so RLS perfume.is_owner() applies to every read and write.
 */
import crypto from "node:crypto";
import type { PoolClient } from "pg";
import { withCurrentUser, withLuciaBypass } from "../../auth/db.js";
import { decrypt } from "../../lib/encryption.js";
import { ImportCheckFailed, importList, invalidateGridCache, type ImportCheck } from "../desk.service.js";
import { accessTokenFor, attachmentsOf, Gmail, header, MailReconnectError, senderAddress, type Attachment, type FetchLike, type GmailMessage } from "./gmail.js";
import { chooseReading, PRICE_FILE_EXT, readPriceFile, savedColumnsOf, SPECIAL_LIST_RE, UnreadableFileError, type Choice } from "./readers.js";
import { downloadLink, downloadLinksOf, htmlOf, LINK_PREFIX, linkFileName, type DownloadImpl } from "./links.js";

export const PERFUME_MAIL_JOB = "perfume.mail_price_lists_cron";
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
/** A list under this share of the vendor's list in use is held, not saved over it. */
export const MIN_SHARE_OF_CURRENT = 0.5;

export type MailRule = { id: string; from_address: string; file_text: string | null; vendor_id: string | null; special: boolean; ignore: boolean };
export type FileStatus = "imported" | "held" | "unassigned" | "duplicate" | "failed";

/** The rule for one attached file: an exact address beats an @domain rule; a rule naming a file-name text beats one
 *  that does not (Elegance sends its list and its ARABIC list from the same address). */
export function ruleFor(rules: MailRule[], sender: string, fileName: string): MailRule | null {
  const addr = sender.toLowerCase();
  const domain = addr.includes("@") ? `@${addr.split("@")[1]}` : "";
  const name = fileName.toLowerCase();
  const fits = rules.filter((r) => (r.from_address === addr || (domain && r.from_address === domain))
    && (!r.file_text || name.includes(r.file_text.toLowerCase())));
  if (!fits.length) return null;
  const score = (r: MailRule) => (r.from_address === addr ? 2 : 0) + (r.file_text ? 1 : 0);
  return fits.sort((a, b) => score(b) - score(a))[0];
}

/** A received-at instant → the list date in Laredo (America/Chicago), YYYY-MM-DD. */
export function listDateOf(receivedAt: Date): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(receivedAt);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}`;
}

/** The Gmail search for one run: price-list attachments received in the last `days` days, not sent by the owner. */
export function searchQuery(days: number): string {
  return `has:attachment newer_than:${Math.max(1, Math.min(60, Math.floor(days)))}d -in:sent -in:drafts {filename:xlsx filename:xls filename:csv filename:pdf filename:xlsm}`;
}

/** Mail from the senders set up as vendors (address or @domain) — for lists sent as a download link, not an attachment. */
export function linkSearchQuery(days: number, fromAddresses: string[]): string | null {
  const froms = [...new Set(fromAddresses.map((a) => a.trim().toLowerCase().replace(/^@/, "")).filter(Boolean))];
  if (!froms.length) return null;
  return `newer_than:${Math.max(1, Math.min(60, Math.floor(days)))}d -in:sent -in:drafts from:(${froms.join(" OR ")})`;
}

export type HoldReason =
  | "old_xls" | "scanned_pdf" | "unsupported_type" | "unreadable" | "too_large"
  | "columns_not_found" | "no_prices_found" | "much_smaller_than_current" | "totals_not_matching" | "vendor_missing";

export const HOLD_TEXT: Record<HoldReason, string> = {
  old_xls: "Old Excel format (.xls) — open it on the Lists tab.",
  scanned_pdf: "Scanned PDF (no text) — open it on the Lists tab; the picture reader reads it.",
  unsupported_type: "Not a price-list file type.",
  unreadable: "The file could not be opened.",
  too_large: "File over 20 MB.",
  columns_not_found: "No description and price columns found — open it on the Lists tab and pick the columns once; next time it is read by mail.",
  no_prices_found: "No priced line found in the file.",
  much_smaller_than_current: "Less than half the lines of this vendor's list in use — not saved over it. Use \"Import anyway\" if it is the full list.",
  totals_not_matching: "The saved total did not match the file total to the cent — nothing saved.",
  vendor_missing: "The vendor of this rule is archived.",
};

type Ctx = { ownerUid: string; runId: string | null; account: string };
type FileMeta = { messageId: string; fileName: string; sender: string; subject: string; receivedAt: Date };
type Outcome = { status: FileStatus; reason?: string | null; listId?: string | null; rowsRead?: number | null; rowsSaved?: number | null;
  totalCents?: number | null; check?: ImportCheck | null; sha?: string | null; ruleId?: string | null; vendorId?: string | null };

async function recordFile(c: PoolClient, ctx: Ctx, f: FileMeta, o: Outcome, replace = false): Promise<void> {
  await c.query(
    `INSERT INTO perfume.mail_files (account_email, external_gmail_message_id, file_name, sender, subject, received_at, sha256, status, reason, rule_id, vendor_id,
       list_id, rows_read, rows_saved, file_total_cents, import_check, run_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17)
     ON CONFLICT (account_email, external_gmail_message_id, file_name) DO ${replace ? `UPDATE SET sha256 = EXCLUDED.sha256, status = EXCLUDED.status,
       reason = EXCLUDED.reason, rule_id = EXCLUDED.rule_id, vendor_id = EXCLUDED.vendor_id, list_id = EXCLUDED.list_id, rows_read = EXCLUDED.rows_read,
       rows_saved = EXCLUDED.rows_saved, file_total_cents = EXCLUDED.file_total_cents, import_check = EXCLUDED.import_check,
       run_id = EXCLUDED.run_id, processed_at = now()` : "NOTHING"}`,
    [ctx.account, f.messageId, f.fileName.slice(0, 300), f.sender, f.subject?.slice(0, 500) || null, f.receivedAt.toISOString(), o.sha ?? null, o.status,
      o.reason ?? null, o.ruleId ?? null, o.vendorId ?? null, o.listId ?? null, o.rowsRead ?? null, o.rowsSaved ?? null, o.totalCents ?? null,
      o.check ? JSON.stringify(o.check) : null, ctx.runId]);
}

/** Read one downloaded file and save it as the vendor's list (or hold it). Runs inside the owner's transaction. */
export async function importMailFile(c: PoolClient, ctx: Ctx, f: FileMeta, buf: Buffer, rule: { id: string | null; vendor_id: string; special: boolean },
  opts: { force?: boolean } = {}): Promise<Outcome> {
  const sha = crypto.createHash("sha256").update(buf).digest("hex");
  const base = { sha, ruleId: rule.id, vendorId: rule.vendor_id };
  const v = (await c.query<{ id: string; name: string; column_mapping: Record<string, unknown> }>(
    `SELECT id, name, column_mapping FROM perfume.vendors WHERE id = $1 AND archived_at IS NULL`, [rule.vendor_id])).rows[0];
  if (!v) return { ...base, status: "held", reason: HOLD_TEXT.vendor_missing };
  if (!opts.force) {
    const dup = (await c.query<{ list_id: string }>(
      `SELECT f.list_id FROM perfume.mail_files f JOIN perfume.price_lists l ON l.id = f.list_id
        WHERE f.vendor_id = $1 AND f.sha256 = $2 AND f.status = 'imported' AND l.voided_at IS NULL LIMIT 1`, [v.id, sha])).rows[0];
    if (dup) return { ...base, status: "duplicate", reason: "Same file as the list already in use for this vendor.", listId: dup.list_id };
  }
  if (buf.length > MAX_FILE_BYTES) return { ...base, status: "held", reason: HOLD_TEXT.too_large };
  let choice: Choice | null;
  try {
    choice = chooseReading(await readPriceFile(buf, f.fileName), savedColumnsOf(v.column_mapping));
  } catch (e) {
    if (e instanceof UnreadableFileError) return { ...base, status: "held", reason: HOLD_TEXT[e.reason] };
    return { ...base, status: "held", reason: `${HOLD_TEXT.unreadable} ${String((e as Error)?.message ?? e).slice(0, 160)}` };
  }
  if (!choice) return { ...base, status: "held", reason: HOLD_TEXT.columns_not_found };
  const ex = choice.extracted;
  if (!ex.rowsRead) return { ...base, status: "held", reason: HOLD_TEXT.no_prices_found };
  const special = rule.special || SPECIAL_LIST_RE.test(f.fileName) || SPECIAL_LIST_RE.test(f.subject ?? "");
  if (!special && !opts.force) {
    const cur = (await c.query<{ rows_saved: number }>(
      `SELECT rows_saved FROM perfume.price_lists WHERE vendor_id = $1 AND voided_at IS NULL ORDER BY (label IS NULL) DESC, imported_at DESC LIMIT 1`,
      [v.id])).rows[0];
    if (cur && cur.rows_saved > 0 && ex.rowsRead < cur.rows_saved * MIN_SHARE_OF_CURRENT) {
      return { ...base, status: "held", rowsRead: ex.rowsRead, totalCents: ex.fileTotalCents,
        reason: `${HOLD_TEXT.much_smaller_than_current} (${ex.rowsRead.toLocaleString("en-US")} lines vs ${cur.rows_saved.toLocaleString("en-US")})` };
    }
  }
  const kind = choice.how === "pdf" ? "pdf_text" : f.fileName.toLowerCase().endsWith(".csv") ? "csv" : "xlsx";
  try {
    const r = await importList(c, ctx.ownerUid, {
      vendor_id: v.id, list_date: listDateOf(f.receivedAt),
      label: special ? (f.subject?.trim() || f.fileName).slice(0, 200) : null,
      file_name: `${f.fileName} · mail ${f.sender}`.slice(0, 300), source_kind: kind,
      rows_read: ex.rowsRead, file_price_total_cents: ex.fileTotalCents, rows: ex.rows, replaces_current: !special,
    });
    return { ...base, status: "imported", listId: r.list_id, rowsRead: ex.rowsRead, rowsSaved: r.check.rows_saved, totalCents: ex.fileTotalCents, check: r.check,
      reason: `${choice.how === "saved_columns" ? "Read with this vendor's saved columns" : choice.how === "pdf" ? "Read as a text PDF" : "Columns guessed as on the Lists tab"}${special ? " · kept next to the vendor's list (special)" : " · replaced the vendor's list"}` };
  } catch (e) {
    if (e instanceof ImportCheckFailed) return { ...base, status: "held", reason: HOLD_TEXT.totals_not_matching, check: e.check, rowsRead: ex.rowsRead, totalCents: ex.fileTotalCents };
    throw e;
  }
}

/** The desk owner (perfume.desk_users ∩ Owner role) — the user the engine acts as. */
export async function deskOwnerUid(): Promise<string | null> {
  const r = await withLuciaBypass((c) => c.query<{ user_id: string }>(
    `SELECT d.user_id FROM perfume.desk_users d JOIN identity.users u ON u.id = d.user_id
      WHERE u.role::text = 'Owner' AND u.deactivated_at IS NULL ORDER BY d.added_at LIMIT 1`));
  return r.rows[0]?.user_id ?? null;
}

export type RunSummary = { run_id: string; accounts: number; messages_seen: number; imported: number; held: number; unassigned: number; failed: number; errors: string[] };

let running = false;
export function mailRunInProgress(): boolean { return running; }

/** One run over every connected mailbox. */
export async function runMailImport(opts: { trigger: "schedule" | "manual"; startedBy?: string | null; days?: number; fetchImpl?: FetchLike;
  downloadImpl?: DownloadImpl }): Promise<RunSummary | null> {
  if (running) return null;
  running = true;
  try {
    const ownerUid = opts.startedBy ?? (await deskOwnerUid());
    if (!ownerUid) return null;
    const runId = await withCurrentUser(ownerUid, async (c) => (await c.query<{ id: string }>(
      `INSERT INTO perfume.mail_runs (trigger, started_by) VALUES ($1, $2) RETURNING id`, [opts.trigger, opts.startedBy ?? null])).rows[0].id);
    const sum: RunSummary = { run_id: runId, accounts: 0, messages_seen: 0, imported: 0, held: 0, unassigned: 0, failed: 0, errors: [] };
    const accounts = await withCurrentUser(ownerUid, async (c) => (await c.query<{ email: string; refresh_token_enc: Buffer; last_checked_at: string | null }>(
      `SELECT email, refresh_token_enc, last_checked_at FROM perfume.mail_accounts WHERE status = 'connected' ORDER BY email`)).rows);
    for (const acct of accounts) {
      sum.accounts++;
      const ctx: Ctx = { ownerUid, runId, account: acct.email };
      try {
        const token = await accessTokenFor(decrypt(acct.refresh_token_enc) ?? "", opts.fetchImpl);
        const gmail = new Gmail(token, opts.fetchImpl);
        // First run of a mailbox looks back 14 days; then the run window (3 days by default).
        const days = opts.days ?? (acct.last_checked_at ? 3 : 14);
        const ids = await gmail.listIds(searchQuery(days), 300);
        const withFiles = new Set<string>();
        const rules = await withCurrentUser(ownerUid, async (c) => (await c.query<MailRule>(
          `SELECT id, from_address, file_text, vendor_id, special, ignore FROM perfume.mail_rules WHERE active`)).rows);
        for (const id of ids) {
          sum.messages_seen++;
          const seen = await withCurrentUser(ownerUid, async (c) => new Set((await c.query<{ file_name: string }>(
            `SELECT file_name FROM perfume.mail_files WHERE account_email = $1 AND external_gmail_message_id = $2`, [acct.email, id])).rows.map((r) => r.file_name)));
          let msg: GmailMessage;
          try { msg = await gmail.message(id); } catch (e) { if (e instanceof MailReconnectError) throw e; sum.failed++; sum.errors.push(String((e as Error)?.message ?? e).slice(0, 200)); continue; }
          if (attachmentsOf(msg).some((a) => PRICE_FILE_EXT.test(a.fileName))) withFiles.add(id);
          const files = attachmentsOf(msg).filter((a) => PRICE_FILE_EXT.test(a.fileName) && !seen.has(a.fileName.slice(0, 300)));
          if (!files.length) continue;
          const meta = (a: Attachment): FileMeta => ({ messageId: id, fileName: a.fileName, sender: senderAddress(header(msg, "From")),
            subject: header(msg, "Subject"), receivedAt: new Date(Number(msg.internalDate ?? Date.now())) });
          for (const a of files) {
            const f = meta(a);
            const rule = ruleFor(rules, f.sender, f.fileName);
            if (rule?.ignore) continue;
            if (!rule || !rule.vendor_id) {
              await withCurrentUser(ownerUid, (c) => recordFile(c, ctx, f, { status: "unassigned", reason: "Sender not set up — pick the vendor on the desk." }));
              sum.unassigned++;
              continue;
            }
            try {
              const buf = await gmail.attachment(id, a);
              const o = await withCurrentUser(ownerUid, async (c) => {
                const out = await importMailFile(c, ctx, f, buf, { id: rule.id, vendor_id: rule.vendor_id!, special: rule.special });
                await recordFile(c, ctx, f, out);
                return out;
              });
              if (o.status === "imported") sum.imported++;
              else if (o.status === "held") sum.held++;
            } catch (e) {
              if (e instanceof MailReconnectError) throw e;
              sum.failed++;
              const msgText = String((e as Error)?.message ?? e).slice(0, 300);
              sum.errors.push(`${f.fileName}: ${msgText}`);
              await withCurrentUser(ownerUid, (c) => recordFile(c, ctx, f, { status: "failed", reason: msgText, ruleId: rule.id, vendorId: rule.vendor_id }));
            }
          }
        }
        // Lists sent as a "Download Excel PriceList" link (MTZ, Elegance, Nandansons, Classic, Gift Express, M&R measured
        // 2026-11-25: no attachment, a Constant Contact link). Only for senders the owner set up as a vendor.
        const lq = linkSearchQuery(days, rules.filter((r) => r.vendor_id && !r.ignore).map((r) => r.from_address));
        const linkIds = lq ? (await gmail.listIds(lq, 200)).filter((x) => !withFiles.has(x)) : [];
        for (const id of linkIds) {
          sum.messages_seen++;
          let msg: GmailMessage;
          try { msg = await gmail.message(id); } catch (e) { if (e instanceof MailReconnectError) throw e; sum.failed++; sum.errors.push(String((e as Error)?.message ?? e).slice(0, 200)); continue; }
          if (attachmentsOf(msg).some((a) => PRICE_FILE_EXT.test(a.fileName))) continue;
          const links = downloadLinksOf(htmlOf(msg));
          if (!links.length) continue;
          const sender = senderAddress(header(msg, "From"));
          const seenNames = await withCurrentUser(ownerUid, async (c) => (await c.query<{ file_name: string }>(
            `SELECT file_name FROM perfume.mail_files WHERE account_email = $1 AND external_gmail_message_id = $2`, [acct.email, id])).rows.map((r) => r.file_name));
          for (const link of links) {
            if (seenNames.some((n) => n.startsWith(linkFileName(link.label, "")))) continue;
            // A link has no file name of its own: the subject carries which list it is (Elegance "Arabic Perfumes Price List").
            const rule = ruleFor(rules, sender, `${header(msg, "Subject")} ${link.label}`);
            if (!rule || !rule.vendor_id || rule.ignore) continue;
            const got = await downloadLink(link, MAX_FILE_BYTES, opts.downloadImpl);
            const f: FileMeta = { messageId: id, fileName: linkFileName(link.label, got.ok ? got.ext : ""), sender, subject: header(msg, "Subject"),
              receivedAt: new Date(Number(msg.internalDate ?? Date.now())) };
            try {
              const o = await withCurrentUser(ownerUid, async (c) => {
                const out: Outcome = got.ok
                  ? await importMailFile(c, ctx, f, got.buf, { id: rule.id, vendor_id: rule.vendor_id!, special: rule.special })
                  : { status: "held", reason: got.reason, ruleId: rule.id, vendorId: rule.vendor_id };
                await recordFile(c, ctx, f, out);
                return out;
              });
              if (o.status === "imported") sum.imported++;
              else if (o.status === "held") sum.held++;
            } catch (e) {
              sum.failed++;
              const msgText = String((e as Error)?.message ?? e).slice(0, 300);
              sum.errors.push(`${f.fileName}: ${msgText}`);
              await withCurrentUser(ownerUid, (c) => recordFile(c, ctx, f, { status: "failed", reason: msgText, ruleId: rule.id, vendorId: rule.vendor_id }));
            }
          }
        }
        await withCurrentUser(ownerUid, (c) => c.query(
          `UPDATE perfume.mail_accounts SET last_checked_at = now(), last_error = NULL, updated_at = now() WHERE email = $1`, [acct.email]));
      } catch (e) {
        const text = String((e as Error)?.message ?? e).slice(0, 300);
        sum.errors.push(`${acct.email}: ${text}`);
        sum.failed++;
        await withCurrentUser(ownerUid, (c) => c.query(
          `UPDATE perfume.mail_accounts SET status = CASE WHEN $3 THEN 'reconnect' ELSE status END, last_error = $2, updated_at = now() WHERE email = $1`,
          [acct.email, text, e instanceof MailReconnectError]));
      }
    }
    await withCurrentUser(ownerUid, (c) => c.query(
      `UPDATE perfume.mail_runs SET finished_at = now(), accounts = $2, messages_seen = $3, imported = $4, held = $5, unassigned = $6, failed = $7, error = $8
        WHERE id = $1`,
      [runId, sum.accounts, sum.messages_seen, sum.imported, sum.held, sum.unassigned, sum.failed, sum.errors.length ? sum.errors.join("\n").slice(0, 4000) : null]));
    if (sum.imported) invalidateGridCache();
    return sum;
  } finally {
    running = false;
  }
}

/** The owner's answer to one recorded file: "this sender is <vendor>" (creates the rule) and/or "import anyway". */
export async function reprocessMailFile(ownerUid: string, fileId: string, opts: { vendorId?: string; special?: boolean; fileText?: string | null; force?: boolean;
  fetchImpl?: FetchLike; downloadImpl?: DownloadImpl }): Promise<Outcome & { file_id: string }> {
  const f = await withCurrentUser(ownerUid, async (c) => (await c.query<{ account_email: string; external_gmail_message_id: string; file_name: string; sender: string; subject: string | null;
    received_at: Date; rule_id: string | null; vendor_id: string | null; refresh_token_enc: Buffer | null; status: string }>(
    `SELECT f.account_email, f.external_gmail_message_id, f.file_name, f.sender, f.subject, f.received_at, f.rule_id, f.vendor_id, a.refresh_token_enc, f.status
       FROM perfume.mail_files f JOIN perfume.mail_accounts a ON a.email = f.account_email WHERE f.id = $1`, [fileId])).rows[0]);
  if (!f) throw new MailFileError("file_not_found");
  if (f.status === "imported" && !opts.force) throw new MailFileError("already_imported");
  let ruleId = f.rule_id;
  let vendorId = f.vendor_id;
  let special = opts.special ?? false;
  if (opts.vendorId) {
    const r = await withCurrentUser(ownerUid, async (c) => (await c.query<{ id: string; special: boolean }>(
      `INSERT INTO perfume.mail_rules (from_address, file_text, vendor_id, special, created_by) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (from_address, lower(coalesce(file_text, ''))) WHERE active
       DO UPDATE SET vendor_id = EXCLUDED.vendor_id, special = EXCLUDED.special, ignore = false, updated_at = now()
       RETURNING id, special`, [f.sender, opts.fileText?.trim() || null, opts.vendorId, special, ownerUid])).rows[0]);
    ruleId = r.id; vendorId = opts.vendorId; special = r.special;
  } else if (ruleId) {
    special = opts.special ?? (await withCurrentUser(ownerUid, async (c) => (await c.query<{ special: boolean }>(
      `SELECT special FROM perfume.mail_rules WHERE id = $1`, [ruleId])).rows[0]?.special ?? false));
  }
  if (!vendorId) throw new MailFileError("vendor_required");
  const token = await accessTokenFor(decrypt(f.refresh_token_enc) ?? "", opts.fetchImpl);
  const gmail = new Gmail(token, opts.fetchImpl);
  const buf = await fileBytes(gmail, f.external_gmail_message_id, f.file_name, opts.downloadImpl);
  const ctx: Ctx = { ownerUid, runId: null, account: f.account_email };
  const meta: FileMeta = { messageId: f.external_gmail_message_id, fileName: f.file_name, sender: f.sender, subject: f.subject ?? "", receivedAt: new Date(f.received_at) };
  const o = await withCurrentUser(ownerUid, async (c) => {
    const out = await importMailFile(c, ctx, meta, buf, { id: ruleId, vendor_id: vendorId!, special }, { force: opts.force });
    await recordFile(c, ctx, meta, out, true);
    return out;
  });
  if (o.status === "imported") invalidateGridCache();
  return { ...o, file_id: fileId };
}

/** The original attachment, for the owner to open on the Lists tab (held files). */
export async function downloadMailFile(ownerUid: string, fileId: string, fetchImpl?: FetchLike): Promise<{ fileName: string; buf: Buffer }> {
  const f = await withCurrentUser(ownerUid, async (c) => (await c.query<{ account_email: string; external_gmail_message_id: string; file_name: string; refresh_token_enc: Buffer | null }>(
    `SELECT f.account_email, f.external_gmail_message_id, f.file_name, a.refresh_token_enc FROM perfume.mail_files f
       JOIN perfume.mail_accounts a ON a.email = f.account_email WHERE f.id = $1`, [fileId])).rows[0]);
  if (!f) throw new MailFileError("file_not_found");
  const gmail = new Gmail(await accessTokenFor(decrypt(f.refresh_token_enc) ?? "", fetchImpl), fetchImpl);
  return { fileName: f.file_name, buf: await fileBytes(gmail, f.external_gmail_message_id, f.file_name) };
}

/** The bytes of a recorded file: the attachment, or — for a "Link · …" file — the email's download link opened again. */
async function fileBytes(gmail: Gmail, messageId: string, fileName: string, downloadImpl?: DownloadImpl): Promise<Buffer> {
  const msg = await gmail.message(messageId);
  if (fileName.startsWith(LINK_PREFIX)) {
    const link = downloadLinksOf(htmlOf(msg)).find((l) => fileName.startsWith(linkFileName(l.label, "")));
    if (!link) throw new MailFileError("attachment_gone");
    const got = await downloadLink(link, MAX_FILE_BYTES, downloadImpl);
    if (!got.ok) throw new MailFileError(got.reason);
    return got.buf;
  }
  const a = attachmentsOf(msg).find((x) => x.fileName.slice(0, 300) === fileName);
  if (!a) throw new MailFileError("attachment_gone");
  return gmail.attachment(messageId, a);
}

export class MailFileError extends Error {}

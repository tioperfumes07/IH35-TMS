/**
 * PERFUME mail engine — one mailbox, whichever service holds it: Gmail (tioperfumes07@gmail.com, jpm@tioperfumes.com) or
 * Microsoft (tio-perfumes@hotmail.com, owner 2026-11-25 23:25 CT). The engine asks only these four things, so its rules,
 * holds, download-link reading and import are the same code for every mailbox.
 */
import { withCurrentUser } from "../../auth/db.js";
import { decrypt, encrypt } from "../../lib/encryption.js";
import { accessTokenFor, Gmail, type Attachment, type FetchLike, type GmailMessage } from "./gmail.js";
import { Outlook, refreshMicrosoft } from "./outlook.js";

export type MailProvider = "google" | "microsoft";

export interface MailSource {
  /** Messages in the window that carry a price-list file (.xlsx/.xls/.csv/.pdf/.xlsm). */
  priceFileIds(days: number): Promise<string[]>;
  /** Messages in the window from these senders (address or @domain) — for lists sent as a download link. */
  fromIds(days: number, froms: string[]): Promise<string[]>;
  message(id: string): Promise<GmailMessage>;
  attachment(messageId: string, a: Attachment): Promise<Buffer>;
}

const PRICE_FILE_SEARCH = "{filename:xlsx filename:xls filename:csv filename:pdf filename:xlsm}";
const dayWindow = (days: number) => Math.max(1, Math.min(60, Math.floor(days)));

export function gmailSearchQuery(days: number): string {
  return `has:attachment newer_than:${dayWindow(days)}d -in:sent -in:drafts ${PRICE_FILE_SEARCH}`;
}
export function gmailFromQuery(days: number, froms: string[]): string | null {
  const list = [...new Set(froms.map((a) => a.trim().toLowerCase().replace(/^@/, "")).filter(Boolean))];
  return list.length ? `newer_than:${dayWindow(days)}d -in:sent -in:drafts from:(${list.join(" OR ")})` : null;
}

/** Does this sender fit one of the rule addresses (exact address, or "@domain")? */
export function senderFits(sender: string, froms: string[]): boolean {
  const s = sender.toLowerCase();
  const domain = s.includes("@") ? `@${s.split("@")[1]}` : "";
  return froms.some((f) => { const r = f.trim().toLowerCase(); return r === s || (domain !== "" && r === domain) || (!r.startsWith("@") && !r.includes("@") && `@${r}` === domain); });
}

export function gmailSource(g: Gmail): MailSource {
  return {
    priceFileIds: (days) => g.listIds(gmailSearchQuery(days), 300),
    fromIds: async (days, froms) => { const q = gmailFromQuery(days, froms); return q ? g.listIds(q, 200) : []; },
    message: (id) => g.message(id),
    attachment: (id, a) => g.attachment(id, a),
  };
}

const PRICE_EXT = /\.(xlsx|xlsm|xls|csv|pdf)$/i;

export function outlookSource(o: Outlook): MailSource {
  let cache: { days: number; rows: Awaited<ReturnType<Outlook["window"]>> } | null = null;
  const win = async (days: number) => {
    if (!cache || cache.days !== days) cache = { days, rows: await o.window(days) };
    return cache.rows;
  };
  return {
    // Graph cannot search by attachment file name: every message with attachments in the window is opened and the
    // engine keeps only the price-list files (same filter as Gmail's).
    priceFileIds: async (days) => (await win(days)).filter((m) => m.hasAttachments).map((m) => m.id),
    fromIds: async (days, froms) => (froms.length ? (await win(days)).filter((m) => senderFits(m.from?.emailAddress?.address ?? "", froms)).map((m) => m.id) : []),
    message: (id) => o.message(id),
    attachment: async (id, a) => {
      if (!a.attachmentId) throw new Error(`attachment ${a.fileName} has no id`);
      return o.attachment(id, a.attachmentId);
    },
  };
}

export { PRICE_EXT };

/** The mailbox as a source, signed in from its stored grant. Microsoft's rotated refresh token is stored at once. */
export async function openSource(ownerUid: string, acct: { email: string; provider: MailProvider | null; refresh_token_enc: Buffer | null },
  fetchImpl?: FetchLike): Promise<MailSource> {
  const refresh = decrypt(acct.refresh_token_enc ?? null) ?? "";
  if (acct.provider === "microsoft") {
    const t = await refreshMicrosoft(refresh, fetchImpl);
    if (t.refreshToken && t.refreshToken !== refresh) {
      await withCurrentUser(ownerUid, (c) => c.query(
        `UPDATE perfume.mail_accounts SET refresh_token_enc = $2, updated_at = now() WHERE email = $1`, [acct.email, encrypt(t.refreshToken!)]));
    }
    return outlookSource(new Outlook(t.accessToken, acct.email, fetchImpl));
  }
  return gmailSource(new Gmail(await accessTokenFor(refresh, fetchImpl), fetchImpl));
}

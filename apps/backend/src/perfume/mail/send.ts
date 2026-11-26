/**
 * PERFUME — send the owner's lists from jpm@tioperfumes.com (owner 2026-11-25 22:50 CT: "WE NEED TO ACTIVATE THE OUTGOING
 * EMAILS WITH JPM@TIOPERFUMES.COM SO I CAN SEND THE LISTS FROM THE APP").
 *
 * NOT the trucking app's automatic email (EMAIL_CRON_ENABLED — paused by the owner, never touched here). Nothing is
 * queued or scheduled: a send starts only when the owner presses Send on the desk. Each recipient gets their own email
 * (nobody sees the other recipients), one every SEND_GAP_MS, through the Gmail API with the send grant the owner gave
 * when he connected jpm@tioperfumes.com for sending. Opted-out addresses are always skipped. Every recipient is recorded
 * (sent / skipped / failed) in perfume.mail_sends; the batch row keeps the counts.
 */
import { withCurrentUser } from "../../auth/db.js";
import { decrypt } from "../../lib/encryption.js";
import { accessTokenFor, buildMime, Gmail, MailReconnectError, SendNotGrantedError, type FetchLike, type MimeAttachment } from "./gmail.js";

export const PERFUME_SENDER = "jpm@tioperfumes.com";
export const MAX_RECIPIENTS_PER_SEND = 500;
/** Google Workspace allows 2,000 a day per mailbox; the desk stops well short of it. */
export const DAILY_SEND_CAP = 1500;
export const SEND_GAP_MS = 1100;
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const SEND_FOOTER = "\n\n—\nTIO Perfumes (ScentsX LLC) · Laredo, Texas\nTo stop receiving our lists, reply to this email with STOP.";
const EMAIL_RE = /^[^@\s<>",;]+@[^@\s<>",;]+\.[^@\s<>",;]{2,}$/;

export class SendError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}

/** Pasted recipients (commas, semicolons, spaces, new lines, "Name <a@b.com>") → unique lower-case addresses + the bad ones. */
export function parseRecipients(text: string): { emails: string[]; invalid: string[] } {
  const seen = new Set<string>(); const emails: string[] = []; const invalid: string[] = [];
  for (const raw of text.split(/[\n,;]+/)) {
    const part = raw.trim(); if (!part) continue;
    const m = part.match(/<([^>]+)>/);
    const tokens = m ? [m[1]] : part.split(/\s+/);
    for (const tok of tokens) {
      const e = tok.trim().replace(/^mailto:/i, "").toLowerCase();
      if (!e) continue;
      if (!EMAIL_RE.test(e)) { invalid.push(tok.trim()); continue; }
      if (!seen.has(e)) { seen.add(e); emails.push(e); }
    }
  }
  return { emails, invalid };
}

export function messageText(body: string): string {
  return `${body.replace(/\s+$/, "")}${SEND_FOOTER}`;
}

type StartInput = { from: string; recipients: string[]; subject: string; body: string; attachments: MimeAttachment[] };

/** Validates, records the batch, and sends in the background. Returns the batch id at once. */
export async function startSend(ownerUid: string, input: StartInput, fetchImpl?: FetchLike): Promise<{ batch_id: string; recipients: number }> {
  const from = input.from.toLowerCase();
  if (from !== PERFUME_SENDER) throw new SendError("sender_not_allowed", `Lists are sent from ${PERFUME_SENDER} only.`);
  if (!input.recipients.length) throw new SendError("no_recipients", "Add at least one email address.");
  if (input.recipients.length > MAX_RECIPIENTS_PER_SEND) throw new SendError("too_many_recipients", `Up to ${MAX_RECIPIENTS_PER_SEND} addresses per send.`);
  const bytes = input.attachments.reduce((s, a) => s + a.content.length, 0);
  if (bytes > MAX_ATTACHMENT_BYTES) throw new SendError("attachments_too_large", "Attachments are over 20 MB together.");
  const batchId = await withCurrentUser(ownerUid, async (c) => {
    const acct = (await c.query<{ status: string; can_send: boolean }>(
      `SELECT status, can_send FROM perfume.mail_accounts WHERE email = $1`, [from])).rows[0];
    if (!acct || acct.status !== "connected") throw new SendError("mailbox_not_connected", `Connect ${from} on the Mail tab first.`);
    if (!acct.can_send) throw new SendError("send_not_granted", `Connect ${from} for sending on the Mail tab (Google asks once for send access).`);
    const used = Number((await c.query<{ n: string }>(
      `SELECT count(*) n FROM perfume.mail_sends s JOIN perfume.mail_send_batches b ON b.id = s.batch_id
        WHERE b.from_email = $1 AND s.status = 'sent' AND s.sent_at > now() - interval '24 hours'`, [from])).rows[0].n);
    if (used + input.recipients.length > DAILY_SEND_CAP) {
      throw new SendError("daily_cap", `${used.toLocaleString("en-US")} sent in the last 24 hours; this send would pass the ${DAILY_SEND_CAP.toLocaleString("en-US")} a day limit.`);
    }
    return (await c.query<{ id: string }>(
      `INSERT INTO perfume.mail_send_batches (from_email, subject, body_text, attachment_names, attachment_bytes, recipients, started_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [from, input.subject.trim(), input.body, input.attachments.map((a) => a.fileName), bytes, input.recipients.length, ownerUid])).rows[0].id;
  });
  void runSend(ownerUid, batchId, { ...input, from }, fetchImpl).catch(() => undefined);
  return { batch_id: batchId, recipients: input.recipients.length };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runSend(ownerUid: string, batchId: string, input: StartInput, fetchImpl?: FetchLike, gapMs = SEND_GAP_MS): Promise<void> {
  let sent = 0, skipped = 0, failed = 0;
  const finish = (status: "done" | "stopped" | "failed", error: string | null) => withCurrentUser(ownerUid, (c) => c.query(
    `UPDATE perfume.mail_send_batches SET status = $2, error = $3, sent = $4, skipped = $5, failed = $6, finished_at = now() WHERE id = $1`,
    [batchId, status, error, sent, skipped, failed]));
  try {
    const tokenEnc = await withCurrentUser(ownerUid, async (c) => (await c.query<{ refresh_token_enc: Buffer }>(
      `SELECT refresh_token_enc FROM perfume.mail_accounts WHERE email = $1`, [input.from])).rows[0]?.refresh_token_enc);
    const gmail = new Gmail(await accessTokenFor(decrypt(tokenEnc ?? null) ?? "", fetchImpl), fetchImpl);
    const optouts = await withCurrentUser(ownerUid, async (c) => new Set((await c.query<{ email: string }>(
      `SELECT email FROM perfume.mail_optouts`)).rows.map((r) => r.email)));
    const text = messageText(input.body);
    for (let i = 0; i < input.recipients.length; i++) {
      const to = input.recipients[i];
      const status = await withCurrentUser(ownerUid, async (c) => (await c.query<{ status: string }>(
        `SELECT status FROM perfume.mail_send_batches WHERE id = $1`, [batchId])).rows[0]?.status);
      if (status === "stopped") { await finish("stopped", "Stopped on the desk."); return; }
      if (optouts.has(to)) {
        skipped++;
        await withCurrentUser(ownerUid, (c) => c.query(
          `INSERT INTO perfume.mail_sends (batch_id, to_email, status) VALUES ($1, $2, 'skipped_optout') ON CONFLICT DO NOTHING`, [batchId, to]));
      } else {
        try {
          const id = await gmail.send(buildMime({ from: input.from, to, subject: input.subject.trim(), text, attachments: input.attachments }));
          sent++;
          await withCurrentUser(ownerUid, (c) => c.query(
            `INSERT INTO perfume.mail_sends (batch_id, to_email, status, gmail_message_id) VALUES ($1, $2, 'sent', $3) ON CONFLICT DO NOTHING`, [batchId, to, id]));
        } catch (e) {
          if (e instanceof MailReconnectError || e instanceof SendNotGrantedError) throw e;
          failed++;
          await withCurrentUser(ownerUid, (c) => c.query(
            `INSERT INTO perfume.mail_sends (batch_id, to_email, status, error) VALUES ($1, $2, 'failed', $3) ON CONFLICT DO NOTHING`,
            [batchId, to, String((e as Error)?.message ?? e).slice(0, 300)]));
        }
      }
      await withCurrentUser(ownerUid, (c) => c.query(
        `UPDATE perfume.mail_send_batches SET sent = $2, skipped = $3, failed = $4 WHERE id = $1`, [batchId, sent, skipped, failed]));
      if (i < input.recipients.length - 1) await sleep(gapMs);
    }
    await finish("done", null);
  } catch (e) {
    const text = String((e as Error)?.message ?? e).slice(0, 300);
    await finish("failed", text);
    if (e instanceof SendNotGrantedError) {
      await withCurrentUser(ownerUid, (c) => c.query(`UPDATE perfume.mail_accounts SET can_send = false, updated_at = now() WHERE email = $1`, [input.from]));
    } else if (e instanceof MailReconnectError) {
      await withCurrentUser(ownerUid, (c) => c.query(
        `UPDATE perfume.mail_accounts SET status = 'reconnect', last_error = $2, updated_at = now() WHERE email = $1`, [input.from, text]));
    }
  }
}

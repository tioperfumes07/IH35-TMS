/**
 * PERFUME-CAMPAIGNS — mass email to a saved group of contacts (design board 4; owner 2026-11-26 16:59 CT "get this all
 * completely done now"). Who: the Contacts-tab filters (saved as a segment or set on the campaign). What: a subject and
 * message in English and Spanish — each contact gets their language (Mexico and Latin America → Spanish) unless one
 * language is chosen — plus the files the owner attaches. When: Send now, or one scheduled time. How fast: per hour.
 *
 * Sending goes through the desk's own sender (mail/send.ts): jpm@tioperfumes.com only, one email per person, the daily cap,
 * opt-outs always skipped, every address recorded. Never the trucking app's automatic email. Left out automatically:
 * people with no email (phone only), opted out on the contact or on the Mail tab, and addresses that are not valid.
 * Batches run one after another (500 addresses each); a restart mid-send stops the campaign, and pressing Send again
 * skips everyone it already reached.
 */
import type pg from "pg";
import { logEvent } from "./leads.events.js";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { contactWhere, type ContactListQuery } from "./contacts.service.js";
import { deskOwnerUid } from "./mail/engine.js";
import {
  createSendBatch, DAILY_SEND_CAP, MAX_ATTACHMENT_BYTES, MAX_RECIPIENTS_PER_SEND, parseRecipients, PERFUME_SENDER, runSend, SendError,
  type StartInput,
} from "./mail/send.js";

export const campaignFiltersSchema = z.object({
  role: z.enum(["vendor", "customer", "both", "none", "all"]).optional(),
  roles: z.array(z.enum(["vendor", "customer", "both", "none"])).max(4).optional(),
  q: z.string().max(200).optional(),
  countries: z.array(z.string().max(120)).max(300).optional(),
  states: z.array(z.string().max(120)).max(300).optional(),
  cities: z.array(z.string().max(160)).max(300).optional(),
  categories: z.array(z.string().max(160)).max(100).optional(),
  sources: z.array(z.string().max(160)).max(50).optional(),
  hows: z.array(z.string().max(160)).max(50).optional(),
});
export type CampaignFilters = z.infer<typeof campaignFiltersSchema>;

export const segmentSchema = z.object({ name: z.string().trim().min(1).max(120), filters: campaignFiltersSchema });

export const campaignSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(200),
  segment_id: z.string().uuid().nullable().optional(),
  filters: campaignFiltersSchema,
  language: z.enum(["auto", "en", "es"]).default("auto"),
  subject_en: z.string().trim().max(300).nullable().optional(),
  subject_es: z.string().trim().max(300).nullable().optional(),
  body_en: z.string().max(20000).nullable().optional(),
  body_es: z.string().max(20000).nullable().optional(),
  per_hour: z.number().int().min(10).max(3000).default(600),
});
export type CampaignInput = z.infer<typeof campaignSchema>;

export class CampaignError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}

/* ------------------------------------------------------------------ language */

const SPANISH_COUNTRIES = new Set([
  "mx", "mex", "mexico", "méxico", "ar", "argentina", "bo", "bolivia", "cl", "chile", "co", "colombia", "cr", "costa rica", "cu", "cuba",
  "do", "dominican republic", "república dominicana", "ec", "ecuador", "sv", "el salvador", "gt", "guatemala", "hn", "honduras", "ni", "nicaragua",
  "pa", "panama", "panamá", "py", "paraguay", "pe", "peru", "perú", "pr", "puerto rico", "es", "spain", "españa", "uy", "uruguay", "ve", "venezuela",
]);
/** Each contact's language for "each in their language": Spanish for Mexico, Latin America and Spain, English otherwise. */
export function languageOf(country: string | null | undefined): "en" | "es" {
  return country && SPANISH_COUNTRIES.has(country.trim().toLowerCase()) ? "es" : "en";
}

/* ------------------------------------------------------------------ audience */

function toQuery(f: CampaignFilters): ContactListQuery {
  return { role: f.role, q: f.q, countries: f.countries, states: f.states, cities: f.cities, categories: f.categories, sources: f.sources, hows: f.hows };
}

export type Audience = {
  companies: number; people: number; with_email: number; phone_only: number; opted_out: number; invalid: number;
  recipients: Array<{ email: string; language: "en" | "es" }>; en: number; es: number;
};

/** Who a campaign reaches with these filters right now — one row per email address, the opted-out and phone-only left out. */
export async function audienceOf(c: pg.PoolClient, f: CampaignFilters, language: "auto" | "en" | "es" = "auto"): Promise<Audience> {
  const { where, args } = contactWhere(toQuery(f));
  if (f.roles?.length) {
    const named = f.roles.filter((r) => r !== "none");
    const parts = [named.length ? `co.role = ANY($${args.push(named)}::text[])` : null, f.roles.includes("none") ? "co.role IS NULL" : null].filter(Boolean);
    where.push(`(${parts.join(" OR ")})`);
  }
  const companies = (await c.query<{ n: number }>(`SELECT count(*)::int AS n FROM perfume.contact_companies co WHERE ${where.join(" AND ")}`, args)).rows[0]?.n ?? 0;
  const people = await c.query<{ email: string | null; country: string | null; opted: boolean }>(
    `SELECT lower(btrim(p.email)) AS email, co.country, (p.opted_out_at IS NOT NULL) AS opted
       FROM perfume.contact_companies co JOIN perfume.contact_people p ON p.company_id = co.id AND p.archived_at IS NULL
      WHERE ${where.join(" AND ")}
      ORDER BY co.name, p.email`, args);
  const optouts = new Set((await c.query<{ email: string }>(`SELECT lower(email) AS email FROM perfume.mail_optouts WHERE removed_at IS NULL`)).rows.map((r) => r.email));
  const seen = new Set<string>();
  const out: Audience = { companies, people: people.rows.length, with_email: 0, phone_only: 0, opted_out: 0, invalid: 0, recipients: [], en: 0, es: 0 };
  for (const p of people.rows) {
    if (!p.email) { out.phone_only++; continue; }
    out.with_email++;
    if (p.opted || optouts.has(p.email)) { out.opted_out++; continue; }
    const ok = parseRecipients(p.email);
    if (!ok.emails.length) { out.invalid++; continue; }
    const email = ok.emails[0]!;
    if (seen.has(email)) continue;
    seen.add(email);
    const lang = language === "auto" ? languageOf(p.country) : language;
    out.recipients.push({ email, language: lang });
    out[lang]++;
  }
  return out;
}

/* ------------------------------------------------------------------ segments */

export async function listSegments(c: pg.PoolClient) {
  return (await c.query(`SELECT id, name, filters, created_at, updated_at FROM perfume.contact_segments WHERE archived_at IS NULL ORDER BY lower(name)`)).rows;
}

export async function saveSegment(c: pg.PoolClient, uid: string, s: z.infer<typeof segmentSchema>, id?: string) {
  if (id) {
    const r = await c.query(`UPDATE perfume.contact_segments SET name = $2, filters = $3, updated_at = now() WHERE id = $1 AND archived_at IS NULL RETURNING id`,
      [id, s.name, s.filters]);
    if (!r.rowCount) throw new CampaignError("not_found", "Segment not found.");
    await logEvent(c, uid, { entity: "segment", entity_id: id, action: "edited", detail: { name: s.name, filters: s.filters } });
    return { id };
  }
  const r = await c.query<{ id: string }>(
    `INSERT INTO perfume.contact_segments (name, filters, created_by) VALUES ($1, $2, $3)
     ON CONFLICT (lower(btrim(name))) WHERE archived_at IS NULL DO UPDATE SET filters = EXCLUDED.filters, updated_at = now() RETURNING id`,
    [s.name, s.filters, uid]);
  await logEvent(c, uid, { entity: "segment", entity_id: r.rows[0]!.id, action: "saved", detail: { name: s.name, filters: s.filters } });
  return { id: r.rows[0]!.id };
}

export async function archiveSegment(c: pg.PoolClient, id: string, uid: string | null = null) {
  const r = await c.query(`UPDATE perfume.contact_segments SET archived_at = now() WHERE id = $1 AND archived_at IS NULL`, [id]);
  if (r.rowCount) await logEvent(c, uid, { entity: "segment", entity_id: id, action: "archived" });
}

/* ------------------------------------------------------------------ campaigns */

const CAMPAIGN_COLS = `c.id, c.name, c.segment_id, c.filters, c.language, c.subject_en, c.subject_es, c.body_en, c.body_es, c.attachment_names,
  c.per_hour, c.status, c.scheduled_for, c.recipients, c.sent, c.skipped, c.failed, c.error, c.started_at, c.finished_at, c.created_at, c.updated_at`;

export async function listCampaigns(c: pg.PoolClient) {
  return (await c.query(
    `SELECT ${CAMPAIGN_COLS}, s.name AS segment_name,
            (SELECT count(*)::int FROM perfume.campaign_batches b WHERE b.campaign_id = c.id) AS batches
       FROM perfume.campaigns c LEFT JOIN perfume.contact_segments s ON s.id = c.segment_id
      WHERE c.archived_at IS NULL ORDER BY c.created_at DESC LIMIT 200`)).rows;
}

export async function getCampaign(c: pg.PoolClient, id: string) {
  const row = (await c.query(`SELECT ${CAMPAIGN_COLS} FROM perfume.campaigns c WHERE c.id = $1 AND c.archived_at IS NULL`, [id])).rows[0];
  if (!row) throw new CampaignError("not_found", "Campaign not found.");
  const attachments = (await c.query(
    `SELECT id, file_name, mime_type, bytes FROM perfume.campaign_attachments WHERE campaign_id = $1 AND archived_at IS NULL ORDER BY created_at`, [id])).rows;
  const batches = (await c.query(
    `SELECT b.id, cb.language, cb.seq, b.recipients, b.sent, b.skipped, b.failed, b.status, b.error, b.started_at, b.finished_at
       FROM perfume.campaign_batches cb JOIN perfume.mail_send_batches b ON b.id = cb.batch_id
      WHERE cb.campaign_id = $1 ORDER BY cb.seq`, [id])).rows;
  return { campaign: row, attachments, batches };
}

const editable = (status: string) => status === "draft" || status === "stopped" || status === "failed" || status === "scheduled";

export async function saveCampaign(c: pg.PoolClient, uid: string, input: CampaignInput) {
  const vals = [input.name, input.segment_id ?? null, input.filters, input.language, input.subject_en || null, input.subject_es || null,
    input.body_en || null, input.body_es || null, input.per_hour];
  if (input.id) {
    const cur = (await c.query<{ status: string }>(`SELECT status FROM perfume.campaigns WHERE id = $1 AND archived_at IS NULL`, [input.id])).rows[0];
    if (!cur) throw new CampaignError("not_found", "Campaign not found.");
    if (!editable(cur.status)) throw new CampaignError("not_editable", "A campaign that is sending or sent cannot be changed — make a copy.");
    await c.query(
      `UPDATE perfume.campaigns SET name = $2, segment_id = $3, filters = $4, language = $5, subject_en = $6, subject_es = $7, body_en = $8, body_es = $9,
          per_hour = $10, updated_at = now() WHERE id = $1`, [input.id, ...vals]);
    await logEvent(c, uid, { entity: "campaign", entity_id: input.id, action: "edited", detail: { name: input.name, language: input.language, per_hour: input.per_hour } });
    return { id: input.id };
  }
  const r = await c.query<{ id: string }>(
    `INSERT INTO perfume.campaigns (name, segment_id, filters, language, subject_en, subject_es, body_en, body_es, per_hour, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`, [...vals, uid]);
  await logEvent(c, uid, { entity: "campaign", entity_id: r.rows[0]!.id, action: "created", detail: { name: input.name } });
  return { id: r.rows[0]!.id };
}

export async function addAttachment(c: pg.PoolClient, uid: string, campaignId: string, a: { name: string; mime_type?: string; content_base64: string }) {
  const buf = Buffer.from(a.content_base64, "base64");
  if (!buf.length) throw new CampaignError("empty_file", "The file is empty.");
  const used = Number((await c.query<{ n: string }>(
    `SELECT coalesce(sum(bytes), 0) AS n FROM perfume.campaign_attachments WHERE campaign_id = $1 AND archived_at IS NULL`, [campaignId])).rows[0]!.n);
  if (used + buf.length > MAX_ATTACHMENT_BYTES) throw new CampaignError("attachments_too_large", "Attachments are over 20 MB together.");
  const cur = (await c.query<{ status: string }>(`SELECT status FROM perfume.campaigns WHERE id = $1 AND archived_at IS NULL`, [campaignId])).rows[0];
  if (!cur) throw new CampaignError("not_found", "Campaign not found.");
  if (!editable(cur.status)) throw new CampaignError("not_editable", "A campaign that is sending or sent cannot be changed.");
  const r = await c.query<{ id: string }>(
    `INSERT INTO perfume.campaign_attachments (campaign_id, file_name, mime_type, content, bytes, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [campaignId, a.name, a.mime_type || "application/octet-stream", buf, buf.length, uid]);
  await syncAttachmentNames(c, campaignId);
  await logEvent(c, uid, { entity: "campaign", entity_id: campaignId, action: "attachment_added", detail: { file_name: a.name, bytes: buf.length } });
  return { id: r.rows[0]!.id, bytes: buf.length };
}

export async function removeAttachment(c: pg.PoolClient, campaignId: string, attachmentId: string, uid: string | null = null) {
  const r = await c.query<{ file_name: string }>(`UPDATE perfume.campaign_attachments SET archived_at = now() WHERE id = $1 AND campaign_id = $2 RETURNING file_name`, [attachmentId, campaignId]);
  await syncAttachmentNames(c, campaignId);
  if (r.rowCount) await logEvent(c, uid, { entity: "campaign", entity_id: campaignId, action: "attachment_removed", detail: { file_name: r.rows[0]!.file_name } });
}

async function syncAttachmentNames(c: pg.PoolClient, campaignId: string) {
  await c.query(
    `UPDATE perfume.campaigns SET attachment_names = coalesce((SELECT array_agg(file_name ORDER BY created_at) FROM perfume.campaign_attachments
        WHERE campaign_id = $1 AND archived_at IS NULL), '{}'), updated_at = now() WHERE id = $1`, [campaignId]);
}

type Content = { subject: string; body: string };
/** The subject and message for one language; the other language stands in when only one was written. */
export function contentFor(cmp: { subject_en: string | null; subject_es: string | null; body_en: string | null; body_es: string | null }, lang: "en" | "es"): Content | null {
  const subject = (lang === "es" ? cmp.subject_es || cmp.subject_en : cmp.subject_en || cmp.subject_es)?.trim();
  const body = lang === "es" ? cmp.body_es || cmp.body_en : cmp.body_en || cmp.body_es;
  return subject && body?.trim() ? { subject, body } : null;
}

async function attachmentsOf(c: pg.PoolClient, campaignId: string): Promise<StartInput["attachments"]> {
  return (await c.query<{ file_name: string; mime_type: string; content: Buffer }>(
    `SELECT file_name, mime_type, content FROM perfume.campaign_attachments WHERE campaign_id = $1 AND archived_at IS NULL ORDER BY created_at`, [campaignId]))
    .rows.map((a) => ({ fileName: a.file_name, mimeType: a.mime_type, content: a.content }));
}

/** One email to jpm@tioperfumes.com itself, in the chosen language, with the attachments — nothing goes to a contact. */
export async function sendTest(uid: string, campaignId: string, lang: "en" | "es") {
  const { cmp, files } = await withCurrentUser(uid, async (c) => ({
    cmp: (await c.query(`SELECT subject_en, subject_es, body_en, body_es FROM perfume.campaigns WHERE id = $1 AND archived_at IS NULL`, [campaignId])).rows[0],
    files: await attachmentsOf(c, campaignId),
  }));
  if (!cmp) throw new CampaignError("not_found", "Campaign not found.");
  const content = contentFor(cmp, lang);
  if (!content) throw new CampaignError("no_content", "Write a subject and a message first.");
  const batchId = await createSendBatch(uid, { from: PERFUME_SENDER, recipients: [PERFUME_SENDER], subject: `[TEST] ${content.subject}`, body: content.body, attachments: files });
  void runSend(uid, batchId, { from: PERFUME_SENDER, recipients: [PERFUME_SENDER], subject: `[TEST] ${content.subject}`, body: content.body, attachments: files }).catch(() => undefined);
  return { batch_id: batchId, to: PERFUME_SENDER };
}

const running = new Set<string>();

/** Send now (or at `when`): checks content, audience and the daily cap first, then runs the batches in the background. */
export async function startCampaign(uid: string, campaignId: string, when?: Date | null) {
  const check = await withCurrentUser(uid, async (c) => {
    const cmp = (await c.query(`SELECT ${CAMPAIGN_COLS} FROM perfume.campaigns c WHERE c.id = $1 AND c.archived_at IS NULL`, [campaignId])).rows[0];
    if (!cmp) throw new CampaignError("not_found", "Campaign not found.");
    if (cmp.status === "sending" || cmp.status === "sent") throw new CampaignError("already_sent", cmp.status === "sent" ? "This campaign was already sent." : "This campaign is sending.");
    const aud = await audienceOf(c, campaignFiltersSchema.parse(cmp.filters ?? {}), cmp.language);
    if (aud.en && !contentFor(cmp, "en")) throw new CampaignError("no_content", "Write the English subject and message (or one language for everyone).");
    if (aud.es && !contentFor(cmp, "es")) throw new CampaignError("no_content", "Write the Spanish subject and message (or one language for everyone).");
    if (!aud.recipients.length) throw new CampaignError("no_recipients", "Nobody with an email in this group.");
    return { cmp, aud };
  });
  if (when && when.getTime() > Date.now() + 60_000) {
    await withCurrentUser(uid, (c) => c.query(
      `UPDATE perfume.campaigns SET status = 'scheduled', scheduled_for = $2, recipients = $3, error = NULL, updated_at = now() WHERE id = $1`,
      [campaignId, when.toISOString(), check.aud.recipients.length]).then(() => logEvent(c, uid, { entity: "campaign", entity_id: campaignId, action: "scheduled",
        detail: { scheduled_for: when.toISOString(), recipients: check.aud.recipients.length } })));
    return { status: "scheduled" as const, scheduled_for: when.toISOString(), recipients: check.aud.recipients.length };
  }
  await withCurrentUser(uid, (c) => c.query(
    `UPDATE perfume.campaigns SET status = 'sending', started_at = now(), finished_at = NULL, error = NULL, updated_at = now() WHERE id = $1`, [campaignId])
    .then(() => logEvent(c, uid, { entity: "campaign", entity_id: campaignId, action: "send_started", detail: { recipients: check.aud.recipients.length, en: check.aud.en, es: check.aud.es } })));
  void runCampaign(uid, campaignId).catch(() => undefined);
  return { status: "sending" as const, recipients: check.aud.recipients.length, en: check.aud.en, es: check.aud.es };
}

export async function stopCampaign(uid: string, campaignId: string) {
  await withCurrentUser(uid, async (c) => {
    await c.query(`UPDATE perfume.campaigns SET status = CASE WHEN status = 'scheduled' THEN 'draft' ELSE 'stopped' END,
        scheduled_for = CASE WHEN status = 'scheduled' THEN NULL ELSE scheduled_for END, updated_at = now()
      WHERE id = $1 AND status IN ('sending', 'scheduled')`, [campaignId]);
    await logEvent(c, uid, { entity: "campaign", entity_id: campaignId, action: "stopped" });
    await c.query(`UPDATE perfume.mail_send_batches b SET status = 'stopped' FROM perfume.campaign_batches cb
      WHERE cb.batch_id = b.id AND cb.campaign_id = $1 AND b.status = 'sending'`, [campaignId]);
  });
}

/** The batches, one after another; everyone this campaign already reached is skipped (a resend after a stop or restart). */
export async function runCampaign(uid: string, campaignId: string, fetchImpl?: Parameters<typeof runSend>[3]): Promise<void> {
  if (running.has(campaignId)) return;
  running.add(campaignId);
  let error: string | null = null;
  let final: "sent" | "stopped" | "failed" = "sent";
  try {
    const { cmp, aud, files, done, seq0 } = await withCurrentUser(uid, async (c) => {
      const cmp = (await c.query(`SELECT ${CAMPAIGN_COLS} FROM perfume.campaigns c WHERE c.id = $1`, [campaignId])).rows[0];
      const aud = await audienceOf(c, campaignFiltersSchema.parse(cmp.filters ?? {}), cmp.language);
      const done = new Set((await c.query<{ to_email: string }>(
        `SELECT s.to_email FROM perfume.mail_sends s JOIN perfume.campaign_batches cb ON cb.batch_id = s.batch_id
          WHERE cb.campaign_id = $1 AND s.status IN ('sent', 'skipped_optout')`, [campaignId])).rows.map((r) => r.to_email.toLowerCase()));
      const seq0 = Number((await c.query<{ n: string }>(`SELECT coalesce(max(seq), 0) AS n FROM perfume.campaign_batches WHERE campaign_id = $1`, [campaignId])).rows[0]!.n);
      return { cmp, aud, files: await attachmentsOf(c, campaignId), done, seq0 };
    });
    const todo = aud.recipients.filter((r) => !done.has(r.email));
    await withCurrentUser(uid, (c) => c.query(`UPDATE perfume.campaigns SET recipients = $2, updated_at = now() WHERE id = $1`, [campaignId, aud.recipients.length]));
    const used = await withCurrentUser(uid, async (c) => Number((await c.query<{ n: string }>(
      `SELECT count(*) n FROM perfume.mail_sends s JOIN perfume.mail_send_batches b ON b.id = s.batch_id
        WHERE b.from_email = $1 AND s.status = 'sent' AND s.sent_at > now() - interval '24 hours'`, [PERFUME_SENDER])).rows[0]!.n));
    if (used + todo.length > DAILY_SEND_CAP) {
      throw new SendError("daily_cap", `${used.toLocaleString("en-US")} sent in the last 24 hours and this campaign has ${todo.length.toLocaleString("en-US")} to go — over the ${DAILY_SEND_CAP.toLocaleString("en-US")} a day limit. Split the group or send tomorrow.`);
    }
    const gapMs = Math.max(1100, Math.round(3_600_000 / Number(cmp.per_hour || 600)));
    let seq = seq0;
    for (const lang of ["en", "es"] as const) {
      const list = todo.filter((r) => r.language === lang).map((r) => r.email);
      const content = contentFor(cmp, lang);
      if (!list.length || !content) continue;
      for (let i = 0; i < list.length; i += MAX_RECIPIENTS_PER_SEND) {
        const status = await withCurrentUser(uid, async (c) => (await c.query<{ status: string }>(`SELECT status FROM perfume.campaigns WHERE id = $1`, [campaignId])).rows[0]?.status);
        if (status !== "sending") { final = "stopped"; return; }
        const input: StartInput = { from: PERFUME_SENDER, recipients: list.slice(i, i + MAX_RECIPIENTS_PER_SEND), subject: content.subject, body: content.body, attachments: files };
        const batchId = await createSendBatch(uid, input);
        seq += 1;
        await withCurrentUser(uid, (c) => c.query(`INSERT INTO perfume.campaign_batches (campaign_id, batch_id, language, seq) VALUES ($1, $2, $3, $4)`, [campaignId, batchId, lang, seq]));
        await runSend(uid, batchId, input, fetchImpl, gapMs);
        await rollUp(uid, campaignId);
        const b = await withCurrentUser(uid, async (c) => (await c.query<{ status: string; error: string | null }>(`SELECT status, error FROM perfume.mail_send_batches WHERE id = $1`, [batchId])).rows[0]);
        if (b?.status === "failed") throw new Error(b.error ?? "The send failed.");
        if (b?.status === "stopped") { final = "stopped"; return; }
      }
    }
  } catch (e) {
    final = "failed";
    error = String((e as Error)?.message ?? e).slice(0, 500);
  } finally {
    running.delete(campaignId);
    await rollUp(uid, campaignId).catch(() => undefined);
    await withCurrentUser(uid, (c) => c.query(
      `UPDATE perfume.campaigns SET status = CASE WHEN status = 'sending' THEN $2 ELSE status END, error = coalesce($3, error), finished_at = now(), updated_at = now()
        WHERE id = $1`, [campaignId, final, error])).catch(() => undefined);
  }
}

async function rollUp(uid: string, campaignId: string) {
  await withCurrentUser(uid, (c) => c.query(
    `UPDATE perfume.campaigns c SET sent = t.sent, skipped = t.skipped, failed = t.failed, updated_at = now()
       FROM (SELECT coalesce(sum(b.sent), 0)::int AS sent, coalesce(sum(b.skipped), 0)::int AS skipped, coalesce(sum(b.failed), 0)::int AS failed
               FROM perfume.campaign_batches cb JOIN perfume.mail_send_batches b ON b.id = cb.batch_id WHERE cb.campaign_id = $1) t
      WHERE c.id = $1`, [campaignId]));
}

/* ------------------------------------------------------------------ the minute tick: scheduled sends, interrupted sends */

let ticker: NodeJS.Timeout | null = null;

export async function campaignTick(): Promise<void> {
  const owner = await deskOwnerUid();
  if (!owner) return;
  // A campaign still "sending" with no runner here and no email out for 15 minutes (or three gaps at its pace) was cut by a
  // restart: stop it, so pressing Send resumes it.
  const stale = await withCurrentUser(owner, async (c) => (await c.query<{ id: string }>(
    `SELECT c.id FROM perfume.campaigns c
      WHERE c.status = 'sending' AND c.archived_at IS NULL
        AND c.started_at < now() - greatest(interval '15 minutes', make_interval(secs => 3 * 3600.0 / c.per_hour))
        AND NOT EXISTS (SELECT 1 FROM perfume.campaign_batches cb JOIN perfume.mail_sends s ON s.batch_id = cb.batch_id
                         WHERE cb.campaign_id = c.id AND s.sent_at > now() - greatest(interval '15 minutes', make_interval(secs => 3 * 3600.0 / c.per_hour)))`))
    .rows.map((r) => r.id).filter((id) => !running.has(id)));
  for (const id of stale) {
    await withCurrentUser(owner, (c) => c.query(
      `UPDATE perfume.campaigns SET status = 'stopped', error = 'Interrupted by a server restart — press Send again to finish (everyone already reached is skipped).',
          finished_at = now(), updated_at = now() WHERE id = $1 AND status = 'sending'`, [id]));
  }
  const due = await withCurrentUser(owner, async (c) => (await c.query<{ id: string; created_by: string | null }>(
    `UPDATE perfume.campaigns SET status = 'sending', started_at = now(), updated_at = now()
      WHERE status = 'scheduled' AND scheduled_for <= now() AND archived_at IS NULL RETURNING id, created_by`)).rows);
  for (const d of due) void runCampaign(d.created_by ?? owner, d.id).catch(() => undefined);
}

export function startCampaignTicker(): void {
  if (ticker || process.env.NODE_ENV === "test" || process.env.VITEST) return;
  ticker = setInterval(() => { void campaignTick().catch(() => undefined); }, 60_000);
  ticker.unref?.();
}

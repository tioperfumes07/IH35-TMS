/**
 * PERFUME mail engine routes — /api/v1/perfume/mail/*. Owner + desk user only, like every perfume route.
 * Connecting a mailbox is a Google sign-in the owner does himself (read-only Gmail scope); the refresh token goes
 * straight into perfume.mail_accounts encrypted and is never sent back to the browser.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../../auth/session-middleware.js";
import { withCurrentUser } from "../../auth/db.js";
import { registerGoogleGrantPurpose, startGoogleGrant } from "../../auth/routes.js";
import { encrypt } from "../../lib/encryption.js";
import { deskAllowed } from "../desk.routes.js";
import { downloadMailFile, MailFileError, mailRunInProgress, reprocessMailFile, runMailImport } from "./engine.js";
import { GMAIL_READONLY_SCOPE, googleClient, MailReconnectError } from "./gmail.js";

export const PERFUME_MAIL_GRANT = "perfume_mail";
/** The two mailboxes the owner named (2026-11-25 17:32 CT). Any other address he signs in with is refused. */
export const PERFUME_MAILBOXES = ["tioperfumes07@gmail.com", "jpm@tioperfumes.com"];
export const PERFUME_MAIL_SCHEDULE_TEXT = "Every day at 6:15 AM Laredo time";

async function ownerOnly(req: FastifyRequest, reply: FastifyReply): Promise<string | null> {
  if (!requireAuth(req, reply)) return null;
  if (String(req.user?.role ?? "") !== "Owner") { void reply.code(403).send({ error: "owner_only" }); return null; }
  const uid = req.user!.uuid;
  if (!(await deskAllowed(uid))) { void reply.code(403).send({ error: "perfume_desk_not_granted" }); return null; }
  return uid;
}

const RL_READ = { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } } as const;
const RL_WRITE = { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } } as const;
const uuid = z.string().uuid();
const ruleSchema = z.object({
  from_address: z.string().trim().toLowerCase().max(200).regex(/^([^@\s]+)?@[^@\s]+\.[^@\s]+$/, "an address (name@domain.com) or @domain.com"),
  file_text: z.string().trim().max(120).nullable().optional(),
  vendor_id: uuid.nullable().optional(),
  special: z.boolean().optional(),
  ignore: z.boolean().optional(),
}).refine((r) => r.ignore || r.vendor_id, { message: "pick the vendor (or ignore this sender)" });

export async function registerPerfumeMailRoutes(app: FastifyInstance) {
  // The Google callback lands here for a mailbox grant (auth/routes.ts) — never a sign-in.
  registerGoogleGrantPurpose(PERFUME_MAIL_GRANT, async (req, reply, { tokens, returnTo }) => {
    const back = (q: string) => reply.redirect(`${returnTo}/perfume?tab=mail&${q}`);
    if (!req.user) return back("mail_error=not_signed_in");
    if (String(req.user.role ?? "") !== "Owner" || !(await deskAllowed(req.user.uuid))) return back("mail_error=not_allowed");
    if (!tokens.scopes.includes(GMAIL_READONLY_SCOPE)) return back("mail_error=read_access_not_granted");
    const refreshToken = tokens.refreshToken;
    if (!refreshToken) return back("mail_error=no_refresh_token");
    const info = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${tokens.accessToken}` } });
    const email = info.ok ? String(((await info.json()) as Record<string, unknown>)["email"] ?? "").toLowerCase() : "";
    if (!email) return back("mail_error=no_email");
    if (!PERFUME_MAILBOXES.includes(email)) return back(`mail_error=not_a_tio_mailbox&mail_email=${encodeURIComponent(email)}`);
    const uid = req.user.uuid;
    await withCurrentUser(uid, (c) => c.query(
      `INSERT INTO perfume.mail_accounts (email, refresh_token_enc, status, last_error, connected_by, connected_at, updated_at)
       VALUES ($1, $2, 'connected', NULL, $3, now(), now())
       ON CONFLICT (email) DO UPDATE SET refresh_token_enc = EXCLUDED.refresh_token_enc, status = 'connected', last_error = NULL,
         connected_by = EXCLUDED.connected_by, connected_at = now(), updated_at = now()`,
      [email, encrypt(refreshToken), uid]));
    return back(`mail_connected=${encodeURIComponent(email)}`);
  });

  app.get("/api/v1/perfume/mail", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    return withCurrentUser(uid, async (c) => {
      const accounts = (await c.query(
        `SELECT email, status, last_error, connected_at, last_checked_at FROM perfume.mail_accounts ORDER BY email`)).rows;
      const rules = (await c.query(
        `SELECT r.id, r.from_address, r.file_text, r.vendor_id, v.name AS vendor_name, r.special, r.ignore, r.created_at
           FROM perfume.mail_rules r LEFT JOIN perfume.vendors v ON v.id = r.vendor_id WHERE r.active ORDER BY r.from_address, r.file_text NULLS FIRST`)).rows;
      const runs = (await c.query(
        `SELECT id, trigger, started_at, finished_at, accounts, messages_seen, imported, held, unassigned, failed, error
           FROM perfume.mail_runs ORDER BY started_at DESC LIMIT 15`)).rows;
      const files = (await c.query(
        `SELECT f.id, f.account_email, f.file_name, f.sender, f.subject, f.received_at, f.status, f.reason, f.vendor_id, v.name AS vendor_name,
                f.list_id, f.rows_read, f.rows_saved, f.file_total_cents, f.processed_at, l.voided_at AS list_voided_at
           FROM perfume.mail_files f LEFT JOIN perfume.vendors v ON v.id = f.vendor_id LEFT JOIN perfume.price_lists l ON l.id = f.list_id
          ORDER BY f.received_at DESC, f.file_name LIMIT 400`)).rows;
      return {
        configured: googleClient() != null, mailboxes: PERFUME_MAILBOXES, schedule: PERFUME_MAIL_SCHEDULE_TEXT,
        running: mailRunInProgress(), accounts, rules, runs, files,
      };
    });
  });

  // Top-level navigation from the desk (not fetch): Google sign-in for one of the two mailboxes.
  app.get("/api/v1/perfume/mail/connect", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const q = z.object({ email: z.string().email().optional(), returnTo: z.string().max(300).optional() }).safeParse(req.query);
    const hint = q.success && q.data.email && PERFUME_MAILBOXES.includes(q.data.email.toLowerCase()) ? q.data.email.toLowerCase() : null;
    return startGoogleGrant(reply, { purpose: PERFUME_MAIL_GRANT, scopes: [GMAIL_READONLY_SCOPE], returnTo: q.success ? q.data.returnTo : undefined, loginHint: hint });
  });

  app.post("/api/v1/perfume/mail/accounts/:email/disconnect", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const p = z.object({ email: z.string().email() }).safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: "validation_error" });
    await withCurrentUser(uid, (c) => c.query(
      `UPDATE perfume.mail_accounts SET status = 'disconnected', refresh_token_enc = NULL, updated_at = now() WHERE email = $1`, [p.data.email.toLowerCase()]));
    return { ok: true };
  });

  app.post("/api/v1/perfume/mail/run", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const b = z.object({ days: z.number().int().min(1).max(60).optional() }).safeParse(req.body ?? {});
    if (!b.success) return reply.code(400).send({ error: "validation_error" });
    if (mailRunInProgress()) return reply.code(409).send({ error: "run_in_progress", message: "A mail check is already running — wait for it." });
    // Runs in the background (a mailbox with many lists takes longer than a request should wait); the desk polls
    // GET /mail and shows the run when it finishes. A failure is recorded on the run row, never swallowed.
    void runMailImport({ trigger: "manual", startedBy: uid, days: b.data.days }).catch((e: unknown) => req.log.error({ err: e }, "[PERFUME] mail run failed"));
    return reply.code(202).send({ started: true });
  });

  app.post("/api/v1/perfume/mail/rules", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const p = ruleSchema.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: "validation_error", details: p.error.flatten() });
    const r = p.data;
    const row = await withCurrentUser(uid, async (c) => (await c.query(
      `INSERT INTO perfume.mail_rules (from_address, file_text, vendor_id, special, ignore, created_by) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (from_address, lower(coalesce(file_text, ''))) WHERE active
       DO UPDATE SET vendor_id = EXCLUDED.vendor_id, special = EXCLUDED.special, ignore = EXCLUDED.ignore, updated_at = now()
       RETURNING id`, [r.from_address, r.file_text || null, r.ignore ? null : r.vendor_id, r.special ?? false, r.ignore ?? false, uid])).rows[0]);
    return row;
  });

  app.post("/api/v1/perfume/mail/rules/:id/off", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const p = z.object({ id: uuid }).safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: "validation_error" });
    await withCurrentUser(uid, (c) => c.query(`UPDATE perfume.mail_rules SET active = false, updated_at = now() WHERE id = $1`, [p.data.id]));
    return { ok: true };
  });

  // The owner's answer on one file: this sender is <vendor> (saves the rule) and/or import anyway.
  app.post("/api/v1/perfume/mail/files/:id/import", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const p = z.object({ id: uuid }).safeParse(req.params);
    const b = z.object({ vendor_id: uuid.optional(), special: z.boolean().optional(), file_text: z.string().trim().max(120).nullable().optional(),
      force: z.boolean().optional() }).safeParse(req.body ?? {});
    if (!p.success || !b.success) return reply.code(400).send({ error: "validation_error" });
    try {
      return await reprocessMailFile(uid, p.data.id, { vendorId: b.data.vendor_id, special: b.data.special, fileText: b.data.file_text, force: b.data.force });
    } catch (e) {
      if (e instanceof MailFileError) return reply.code(e.message === "file_not_found" ? 404 : 409).send({ error: e.message });
      if (e instanceof MailReconnectError) return reply.code(409).send({ error: "mailbox_reconnect", message: e.message });
      throw e;
    }
  });

  app.get("/api/v1/perfume/mail/files/:id/download", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const p = z.object({ id: uuid }).safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: "validation_error" });
    try {
      const f = await downloadMailFile(uid, p.data.id);
      const safe = f.fileName.replace(/[^\w.\- ]+/g, "_");
      return reply.header("Content-Type", "application/octet-stream").header("Content-Disposition", `attachment; filename="${safe}"`).send(f.buf);
    } catch (e) {
      if (e instanceof MailFileError) return reply.code(404).send({ error: e.message });
      if (e instanceof MailReconnectError) return reply.code(409).send({ error: "mailbox_reconnect", message: e.message });
      throw e;
    }
  });
}

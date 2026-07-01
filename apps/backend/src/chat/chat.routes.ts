// CHAT-2 — per-load dispatch chat routes (office + driver). Every route is rate-limited
// (the #1757 CodeQL lesson). Office auth = currentAuthUser + withCompanyScope; driver auth =
// requireDriverSession + withCurrentUser (operating_company_id resolved from mdata.drivers).
// NO money path — the cash_advance_card only DEEP-LINKS an existing gated cash_advance_requests row.
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { currentAuthUser, validationError, withCompanyScope } from "../accounting/shared.js";
import { withCurrentUser } from "../auth/db.js";
import { requireDriverSession } from "../driver/auth.js";
import { generatePresignedUploadUrl, isR2Configured } from "../storage/r2-client.js";
import {
  getOrCreateLoadThread, listThreads, getThreadMessages, postMessage, advanceReceipt, attachmentR2Key,
  type ChatSender,
} from "./chat.service.js";

const RL = { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } };
const RL_WRITE = { config: { rateLimit: { max: 40, timeWindow: "1 minute" } } };

const ocSchema = z.object({ operating_company_id: z.string().uuid() });
const forLoadSchema = ocSchema.extend({ load_id: z.string().uuid() });
const postSchema = ocSchema.extend({
  client_key: z.string().min(1).max(128),
  content_sha256: z.string().min(1).max(128),
  msg_type: z.enum(["text", "photo", "document", "confirmation_request", "confirmation_ack", "cash_advance_card", "system_event"]).default("text"),
  body: z.string().max(8000).nullable().optional(),
  body_lang: z.string().max(16).nullable().optional(),
  cash_advance_request_id: z.string().uuid().nullable().optional(),
  references_message_id: z.string().uuid().nullable().optional(),
  ack_content_sha256: z.string().max(128).nullable().optional(),
});
const receiptSchema = ocSchema.extend({ participant_id: z.string().uuid(), state: z.enum(["delivered", "read"]) });
const presignSchema = ocSchema.extend({
  thread_id: z.string().uuid(),
  sha256: z.string().min(1).max(128),
  mime_type: z.enum(["image/jpeg", "image/png", "image/heic", "image/webp", "application/pdf"]),
});

type Client = Parameters<Parameters<typeof withCompanyScope>[2]>[0];

// Resolve the events.event_log subject for a thread ('load'/'driver' — the spine CHECK excludes 'message').
async function resolveEventSubject(client: Client, threadId: string): Promise<{ subject_type: "load" | "driver"; subject_id: string }> {
  const t = await client.query(`SELECT load_id FROM chat.threads WHERE id = $1 LIMIT 1`, [threadId]);
  const loadId = t.rows[0]?.load_id as string | null | undefined;
  if (loadId) return { subject_type: "load", subject_id: loadId };
  const d = await client.query(`SELECT driver_id FROM chat.participants WHERE thread_id = $1 AND driver_id IS NOT NULL AND left_at IS NULL LIMIT 1`, [threadId]);
  const driverId = d.rows[0]?.driver_id as string | undefined;
  if (!driverId) throw new Error("thread_has_no_load_or_driver_subject");
  return { subject_type: "driver", subject_id: driverId };
}

async function driverCompanyId(client: Client, driverId: string): Promise<string> {
  const r = await client.query(`SELECT operating_company_id FROM mdata.drivers WHERE id = $1 LIMIT 1`, [driverId]);
  const oc = r.rows[0]?.operating_company_id as string | undefined;
  if (!oc) throw new Error("driver_company_missing");
  return oc;
}

export async function registerChatRoutes(app: FastifyInstance) {
  // ── Office ────────────────────────────────────────────────────────────────
  app.post("/api/v1/chat/threads/for-load", RL_WRITE, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply); if (!user) return;
    const p = forLoadSchema.safeParse(req.body ?? {}); if (!p.success) return validationError(reply, p.error);
    const out = await withCompanyScope(String(user.uuid), p.data.operating_company_id, (client: Client) =>
      getOrCreateLoadThread(client, { operating_company_id: p.data.operating_company_id, load_id: p.data.load_id, actor_user_id: String(user.uuid) }));
    return reply.send({ thread: out });
  });

  app.get("/api/v1/chat/threads", RL, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply); if (!user) return;
    const p = ocSchema.safeParse(req.query ?? {}); if (!p.success) return validationError(reply, p.error);
    const threads = await withCompanyScope(String(user.uuid), p.data.operating_company_id, (client: Client) => listThreads(client));
    return reply.send({ threads });
  });

  app.get("/api/v1/chat/threads/:id/messages", RL, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply); if (!user) return;
    const p = ocSchema.extend({ after_seq: z.coerce.number().int().min(0).optional() }).safeParse(req.query ?? {});
    if (!p.success) return validationError(reply, p.error);
    const threadId = (req.params as { id: string }).id;
    const messages = await withCompanyScope(String(user.uuid), p.data.operating_company_id, (client: Client) =>
      getThreadMessages(client, threadId, { after_seq: p.data.after_seq }));
    return reply.send({ messages });
  });

  app.post("/api/v1/chat/threads/:id/messages", RL_WRITE, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply); if (!user) return;
    const p = postSchema.safeParse(req.body ?? {}); if (!p.success) return validationError(reply, p.error);
    const threadId = (req.params as { id: string }).id;
    const sender: ChatSender = { party_type: "office", office_user_id: String(user.uuid) };
    const out = await withCompanyScope(String(user.uuid), p.data.operating_company_id, async (client: Client) => {
      const subject = await resolveEventSubject(client, threadId);
      return postMessage(client, { thread_id: threadId, operating_company_id: p.data.operating_company_id, sender, msg_type: p.data.msg_type, body: p.data.body ?? null, body_lang: p.data.body_lang ?? null, client_key: p.data.client_key, content_sha256: p.data.content_sha256, cash_advance_request_id: p.data.cash_advance_request_id ?? null, references_message_id: p.data.references_message_id ?? null, ack_content_sha256: p.data.ack_content_sha256 ?? null }, subject);
    });
    return reply.send(out);
  });

  app.post("/api/v1/chat/messages/:id/receipt", RL, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply); if (!user) return;
    const p = receiptSchema.safeParse(req.body ?? {}); if (!p.success) return validationError(reply, p.error);
    const messageId = (req.params as { id: string }).id;
    await withCompanyScope(String(user.uuid), p.data.operating_company_id, (client: Client) =>
      advanceReceipt(client, { message_id: messageId, participant_id: p.data.participant_id, operating_company_id: p.data.operating_company_id, state: p.data.state }));
    return reply.send({ ok: true });
  });

  app.post("/api/v1/chat/attachments/presign", RL_WRITE, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply); if (!user) return;
    if (!isR2Configured()) return reply.code(503).send({ error: "storage_unavailable" });
    const p = presignSchema.safeParse(req.body ?? {}); if (!p.success) return validationError(reply, p.error);
    // membership check under RLS (a non-participant cannot presign into a thread they can't see).
    const ok = await withCompanyScope(String(user.uuid), p.data.operating_company_id, async (client: Client) => {
      const t = await client.query(`SELECT 1 FROM chat.threads WHERE id = $1 LIMIT 1`, [p.data.thread_id]);
      return t.rows.length > 0;
    });
    if (!ok) return reply.code(404).send({ error: "thread_not_found" });
    const ext = p.data.mime_type === "application/pdf" ? "pdf" : p.data.mime_type.split("/")[1];
    const r2Key = attachmentR2Key(p.data.operating_company_id, p.data.thread_id, p.data.sha256, ext);
    const presigned = await generatePresignedUploadUrl(r2Key, p.data.mime_type);
    return reply.send({ r2_key: r2Key, ...presigned });
  });

  // ── Driver PWA ───────────────────────────────────────────────────────────
  app.get("/api/v1/driver/chat/threads", RL, async (req: FastifyRequest, reply: FastifyReply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const driver = req.driver!, u = req.user!;
    const threads = await withCurrentUser(String(u.uuid), (client: Client) => listThreads(client));
    return reply.send({ driver_id: driver.id, threads });
  });

  app.get("/api/v1/driver/chat/threads/:id/messages", RL, async (req: FastifyRequest, reply: FastifyReply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const u = req.user!;
    const q = z.object({ after_seq: z.coerce.number().int().min(0).optional() }).safeParse(req.query ?? {});
    if (!q.success) return validationError(reply, q.error);
    const threadId = (req.params as { id: string }).id;
    const messages = await withCurrentUser(String(u.uuid), (client: Client) => getThreadMessages(client, threadId, { after_seq: q.data.after_seq }));
    return reply.send({ messages });
  });

  app.post("/api/v1/driver/chat/threads/:id/messages", RL_WRITE, async (req: FastifyRequest, reply: FastifyReply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const driver = req.driver!, u = req.user!;
    const p = postSchema.omit({ operating_company_id: true }).safeParse(req.body ?? {}); if (!p.success) return validationError(reply, p.error);
    const threadId = (req.params as { id: string }).id;
    const sender: ChatSender = { party_type: "driver", driver_id: driver.id };
    const out = await withCurrentUser(String(u.uuid), async (client: Client) => {
      const oc = await driverCompanyId(client, driver.id);
      const subject = await resolveEventSubject(client, threadId);
      return postMessage(client, { thread_id: threadId, operating_company_id: oc, sender, msg_type: p.data.msg_type, body: p.data.body ?? null, body_lang: p.data.body_lang ?? null, client_key: p.data.client_key, content_sha256: p.data.content_sha256, cash_advance_request_id: p.data.cash_advance_request_id ?? null, references_message_id: p.data.references_message_id ?? null, ack_content_sha256: p.data.ack_content_sha256 ?? null }, subject);
    });
    return reply.send(out);
  });

  app.post("/api/v1/driver/chat/messages/:id/receipt", RL, async (req: FastifyRequest, reply: FastifyReply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const driver = req.driver!, u = req.user!;
    const q = z.object({ participant_id: z.string().uuid(), state: z.enum(["delivered", "read"]) }).safeParse(req.body ?? {});
    if (!q.success) return validationError(reply, q.error);
    const messageId = (req.params as { id: string }).id;
    await withCurrentUser(String(u.uuid), async (client: Client) => {
      const oc = await driverCompanyId(client, driver.id);
      return advanceReceipt(client, { message_id: messageId, participant_id: q.data.participant_id, operating_company_id: oc, state: q.data.state });
    });
    return reply.send({ ok: true });
  });
}

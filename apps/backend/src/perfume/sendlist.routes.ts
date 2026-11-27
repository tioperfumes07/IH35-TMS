/**
 * PERFUME-SEND-LIST routes (owner 2026-11-26 23:23 CT). Desk owner only: the restricted brands / items, a preview of the list he is
 * about to send, its Excel, and attaching that Excel to a campaign. Nothing is emailed from here.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";
import { deskAllowed } from "./desk.routes.js";
import { buildSendList, getRestricted, restrictedSchema, sendListSchema, SendListInvalid, sendListXlsx, setRestricted } from "./sendlist.service.js";
import { addAttachment, CampaignError } from "./campaigns.service.js";

async function ownerOnly(req: FastifyRequest, reply: FastifyReply): Promise<string | null> {
  if (!requireAuth(req, reply)) return null;
  if (String(req.user?.role ?? "") !== "Owner") { void reply.code(403).send({ error: "owner_only" }); return null; }
  const uid = req.user!.uuid;
  if (!(await deskAllowed(uid))) { void reply.code(403).send({ error: "perfume_desk_not_granted" }); return null; }
  return uid;
}
const RL_READ = { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } } as const;
const RL_WRITE = { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } } as const;
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
function fail(reply: FastifyReply, e: unknown) {
  if (e instanceof SendListInvalid) return reply.code(400).send({ error: "invalid", message: e.message });
  if (e instanceof CampaignError) return reply.code(400).send({ error: e.code, message: e.message });
  throw e;
}

export async function registerPerfumeSendListRoutes(app: FastifyInstance) {
  app.get("/api/v1/perfume/send-list/restricted", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    return withCurrentUser(uid, (c) => getRestricted(c));
  });
  app.put("/api/v1/perfume/send-list/restricted", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const p = restrictedSchema.safeParse(req.body ?? {});
    if (!p.success) return reply.code(400).send({ error: "validation_error" });
    return withCurrentUser(uid, (c) => setRestricted(c, uid, p.data));
  });
  app.post("/api/v1/perfume/send-list/preview", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const p = sendListSchema.safeParse(req.body ?? {});
    if (!p.success) return reply.code(400).send({ error: "validation_error" });
    try {
      const b = await withCurrentUser(uid, (c) => buildSendList(c, p.data));
      return { ...b, total: b.rows.length, rows: b.rows.slice(0, 300) };
    } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/perfume/send-list/export.xlsx", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const p = sendListSchema.safeParse(req.body ?? {});
    if (!p.success) return reply.code(400).send({ error: "validation_error" });
    try {
      const f = await withCurrentUser(uid, (c) => sendListXlsx(c, p.data));
      return reply.header("Content-Type", XLSX).header("Content-Disposition", `attachment; filename="${f.filename}"`).send(f.buffer);
    } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/perfume/send-list/attach", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const p = sendListSchema.extend({ campaign_id: z.string().uuid() }).safeParse(req.body ?? {});
    if (!p.success) return reply.code(400).send({ error: "validation_error" });
    try {
      return await withCurrentUser(uid, async (c) => {
        const f = await sendListXlsx(c, p.data);
        const a = await addAttachment(c, uid, p.data.campaign_id, { name: f.filename, mime_type: XLSX, content_base64: f.buffer.toString("base64") });
        return { attached: f.filename, rows: f.rows, attachment: a };
      });
    } catch (e) { return fail(reply, e); }
  });
}

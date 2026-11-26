/**
 * PERFUME-CAMPAIGNS + TRADERS routes — design boards 4 and 3. Desk owner only (Owner role AND perfume.desk_users), like
 * every perfume route. Nothing is deleted: segments, campaigns, attachments, trades and buyers are archived.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";
import { deskAllowed } from "./desk.routes.js";
import { SendError } from "./mail/send.js";
import {
  addAttachment, archiveSegment, audienceOf, CampaignError, campaignFiltersSchema, campaignSchema, getCampaign, listCampaigns, listSegments,
  removeAttachment, saveCampaign, saveSegment, segmentSchema, sendTest, startCampaign, startCampaignTicker, stopCampaign,
} from "./campaigns.service.js";
import {
  addBuyer, archiveTrade, buyerPatchSchema, buyerSchema, saveTrade, setStage, TRADE_STAGES, TradeError, tradersOverview, tradeSchema, updateBuyer,
} from "./traders.service.js";

async function ownerOnly(req: FastifyRequest, reply: FastifyReply): Promise<string | null> {
  if (!requireAuth(req, reply)) return null;
  if (String(req.user?.role ?? "") !== "Owner") { void reply.code(403).send({ error: "owner_only" }); return null; }
  const uid = req.user!.uuid;
  if (!(await deskAllowed(uid))) { void reply.code(403).send({ error: "perfume_desk_not_granted" }); return null; }
  return uid;
}

const RL_READ = { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } } as const;
const RL_WRITE = { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } } as const;
const RL_SEND = { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } } as const;
const idParam = z.object({ id: z.string().uuid() });

function fail(reply: FastifyReply, e: unknown) {
  if (e instanceof CampaignError || e instanceof TradeError) return reply.code(e.code === "not_found" ? 404 : 409).send({ error: e.code, message: e.message });
  if (e instanceof SendError) return reply.code(409).send({ error: e.code, message: e.message });
  throw e;
}

export async function registerPerfumeCampaignRoutes(app: FastifyInstance) {
  startCampaignTicker();

  /* ---------------------------------------------------------------- segments + audience */
  app.get("/api/v1/perfume/segments", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    return withCurrentUser(uid, async (c) => ({ segments: await listSegments(c) }));
  });
  app.post("/api/v1/perfume/segments", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const b = segmentSchema.extend({ id: z.string().uuid().optional() }).safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: "validation_error", details: b.error.flatten() });
    try { return await withCurrentUser(uid, (c) => saveSegment(c, uid, b.data, b.data.id)); } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/perfume/segments/:id/archive", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idParam.safeParse(req.params);
    if (!id.success) return reply.code(400).send({ error: "validation_error" });
    await withCurrentUser(uid, (c) => archiveSegment(c, id.data.id));
    return { ok: true };
  });
  app.post("/api/v1/perfume/campaigns/audience", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const b = z.object({ filters: campaignFiltersSchema, language: z.enum(["auto", "en", "es"]).default("auto") }).safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: "validation_error", details: b.error.flatten() });
    return withCurrentUser(uid, async (c) => {
      const a = await audienceOf(c, b.data.filters, b.data.language);
      return { ...a, recipients: a.recipients.length, sample: a.recipients.slice(0, 8) };
    });
  });

  /* ---------------------------------------------------------------- campaigns */
  app.get("/api/v1/perfume/campaigns", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    return withCurrentUser(uid, async (c) => ({ campaigns: await listCampaigns(c) }));
  });
  app.get("/api/v1/perfume/campaigns/:id", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idParam.safeParse(req.params);
    if (!id.success) return reply.code(400).send({ error: "validation_error" });
    try { return await withCurrentUser(uid, (c) => getCampaign(c, id.data.id)); } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/perfume/campaigns", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const b = campaignSchema.safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: "validation_error", details: b.error.flatten() });
    try { return await withCurrentUser(uid, (c) => saveCampaign(c, uid, b.data)); } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/perfume/campaigns/:id/attachments", { bodyLimit: 30 * 1024 * 1024, config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idParam.safeParse(req.params);
    const b = z.object({ name: z.string().trim().min(1).max(200), mime_type: z.string().max(200).optional(), content_base64: z.string().min(1) }).safeParse(req.body);
    if (!id.success || !b.success) return reply.code(400).send({ error: "validation_error" });
    try { return await withCurrentUser(uid, (c) => addAttachment(c, uid, id.data.id, b.data)); } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/perfume/campaigns/:id/attachments/:attachmentId/remove", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const p = z.object({ id: z.string().uuid(), attachmentId: z.string().uuid() }).safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: "validation_error" });
    await withCurrentUser(uid, (c) => removeAttachment(c, p.data.id, p.data.attachmentId));
    return { ok: true };
  });
  app.post("/api/v1/perfume/campaigns/:id/test", RL_SEND, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idParam.safeParse(req.params); const b = z.object({ language: z.enum(["en", "es"]).default("en") }).safeParse(req.body ?? {});
    if (!id.success || !b.success) return reply.code(400).send({ error: "validation_error" });
    try { return await sendTest(uid, id.data.id, b.data.language); } catch (e) { return fail(reply, e); }
  });
  // Nothing goes to a contact until the owner presses Send (now) or Schedule (one time).
  app.post("/api/v1/perfume/campaigns/:id/send", RL_SEND, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idParam.safeParse(req.params); const b = z.object({ when: z.string().datetime().nullable().optional() }).safeParse(req.body ?? {});
    if (!id.success || !b.success) return reply.code(400).send({ error: "validation_error" });
    try { return await startCampaign(uid, id.data.id, b.data.when ? new Date(b.data.when) : null); } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/perfume/campaigns/:id/stop", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idParam.safeParse(req.params);
    if (!id.success) return reply.code(400).send({ error: "validation_error" });
    await stopCampaign(uid, id.data.id);
    return { ok: true };
  });

  /* ---------------------------------------------------------------- traders */
  app.get("/api/v1/perfume/traders", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const q = z.object({ brands: z.string().max(2000).optional() }).safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "validation_error" });
    const brands = q.data.brands ? q.data.brands.split("|").map((x) => x.trim()).filter(Boolean).slice(0, 12) : [];
    return withCurrentUser(uid, (c) => tradersOverview(c, { brands }));
  });
  app.post("/api/v1/perfume/trades", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const b = tradeSchema.safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: "validation_error", details: b.error.flatten() });
    try { return await withCurrentUser(uid, (c) => saveTrade(c, uid, b.data)); } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/perfume/trades/:id/stage", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idParam.safeParse(req.params); const b = z.object({ stage: z.enum(TRADE_STAGES) }).safeParse(req.body);
    if (!id.success || !b.success) return reply.code(400).send({ error: "validation_error" });
    try { await withCurrentUser(uid, (c) => setStage(c, id.data.id, b.data.stage)); return { ok: true }; } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/perfume/trades/:id/archive", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idParam.safeParse(req.params);
    if (!id.success) return reply.code(400).send({ error: "validation_error" });
    await withCurrentUser(uid, (c) => archiveTrade(c, id.data.id));
    return { ok: true };
  });
  app.post("/api/v1/perfume/trades/:id/buyers", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idParam.safeParse(req.params); const b = buyerSchema.safeParse(req.body);
    if (!id.success || !b.success) return reply.code(400).send({ error: "validation_error" });
    try { return await withCurrentUser(uid, (c) => addBuyer(c, uid, id.data.id, b.data)); } catch (e) { return fail(reply, e); }
  });
  app.patch("/api/v1/perfume/trade-buyers/:id", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idParam.safeParse(req.params); const b = buyerPatchSchema.safeParse(req.body);
    if (!id.success || !b.success) return reply.code(400).send({ error: "validation_error" });
    try { await withCurrentUser(uid, (c) => updateBuyer(c, id.data.id, b.data)); return { ok: true }; } catch (e) { return fail(reply, e); }
  });
}

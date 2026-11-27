/**
 * PERFUME-PRICE-LEVELS + CUSTOMER-ACCOUNTS routes (owner 2026-11-26 20:21 / 20:28 CT). Desk owner only — every approval is his.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";
import { deskAllowed } from "./desk.routes.js";
import {
  accountSchema, AcctInvalid, AcctNotFound, applicationSchema, decideApplication, getAccount, levelItems, levelSchema, listAccounts, listApplications, listLevels,
  saveAccount, saveLevel, setHold, setLevelItem, submitApplication,
} from "./accounts.service.js";

async function ownerOnly(req: FastifyRequest, reply: FastifyReply): Promise<string | null> {
  if (!requireAuth(req, reply)) return null;
  if (String(req.user?.role ?? "") !== "Owner") { void reply.code(403).send({ error: "owner_only" }); return null; }
  const uid = req.user!.uuid;
  if (!(await deskAllowed(uid))) { void reply.code(403).send({ error: "perfume_desk_not_granted" }); return null; }
  return uid;
}
const RL_READ = { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } } as const;
const RL_WRITE = { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } } as const;
const uuid = z.string().uuid();
const idOf = (req: FastifyRequest) => uuid.safeParse((req.params as { id?: string }).id);
function fail(reply: FastifyReply, e: unknown) {
  if (e instanceof AcctNotFound) return reply.code(404).send({ error: "not_found" });
  if (e instanceof AcctInvalid) return reply.code(400).send({ error: "invalid", message: e.message });
  throw e;
}

export async function registerPerfumeAccountRoutes(app: FastifyInstance) {
  app.get("/api/v1/perfume/price-levels", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    return withCurrentUser(uid, async (c) => ({ levels: await listLevels(c) }));
  });
  app.post("/api/v1/perfume/price-levels", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const p = levelSchema.safeParse(req.body ?? {});
    if (!p.success) return reply.code(400).send({ error: "validation_error" });
    try { return await withCurrentUser(uid, (c) => saveLevel(c, uid, null, p.data)); } catch (e) { return fail(reply, e); }
  });
  app.patch("/api/v1/perfume/price-levels/:id", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); const p = levelSchema.safeParse(req.body ?? {});
    if (!id.success || !p.success) return reply.code(400).send({ error: "validation_error" });
    try { return await withCurrentUser(uid, (c) => saveLevel(c, uid, id.data, p.data)); } catch (e) { return fail(reply, e); }
  });
  app.get("/api/v1/perfume/price-levels/:id/items", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    return withCurrentUser(uid, async (c) => ({ items: await levelItems(c, id.data) }));
  });
  app.put("/api/v1/perfume/price-levels/:id/items", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req);
    const p = z.object({ item_id: uuid, min_qty: z.number().int().min(1).max(1_000_000).default(1), price_cents: z.number().int().min(0).max(100_000_000_00).nullable() }).safeParse(req.body ?? {});
    if (!id.success || !p.success) return reply.code(400).send({ error: "validation_error" });
    try { await withCurrentUser(uid, (c) => setLevelItem(c, uid, id.data, p.data.item_id, p.data.min_qty, p.data.price_cents)); return { ok: true }; } catch (e) { return fail(reply, e); }
  });
  app.get("/api/v1/perfume/customer-accounts", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    return withCurrentUser(uid, async (c) => ({ accounts: await listAccounts(c) }));
  });
  app.get("/api/v1/perfume/contacts/:id/account", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    return withCurrentUser(uid, (c) => getAccount(c, id.data));
  });
  app.put("/api/v1/perfume/contacts/:id/account", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); const p = accountSchema.safeParse(req.body ?? {});
    if (!id.success || !p.success) return reply.code(400).send({ error: "validation_error", details: p.success ? undefined : p.error.flatten() });
    try { await withCurrentUser(uid, (c) => saveAccount(c, uid, id.data, p.data)); return { ok: true }; } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/perfume/contacts/:id/account/hold", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); const p = z.object({ hold: z.boolean(), reason: z.string().trim().min(1).max(1000) }).safeParse(req.body ?? {});
    if (!id.success || !p.success) return reply.code(400).send({ error: "validation_error", message: "Say why." });
    try { await withCurrentUser(uid, (c) => setHold(c, uid, id.data, p.data.hold, p.data.reason)); return { ok: true }; } catch (e) { return fail(reply, e); }
  });
  app.get("/api/v1/perfume/credit-applications", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const q = z.object({ status: z.enum(["submitted", "approved", "rejected", "withdrawn"]).optional() }).safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "invalid_query" });
    return withCurrentUser(uid, async (c) => ({ applications: await listApplications(c, q.data.status) }));
  });
  app.post("/api/v1/perfume/contacts/:id/credit-applications", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); const p = applicationSchema.safeParse(req.body ?? {});
    if (!id.success || !p.success) return reply.code(400).send({ error: "validation_error", details: p.success ? undefined : p.error.flatten() });
    try { return await withCurrentUser(uid, (c) => submitApplication(c, uid, id.data, p.data)); } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/perfume/credit-applications/:id/decide", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req);
    const p = z.discriminatedUnion("decision", [
      z.object({ decision: z.literal("approved"), limit_cents: z.number().int().min(1).max(100_000_000_00), terms_days: z.number().int().min(0).max(365), note: z.string().trim().max(2000).nullable().optional() }),
      z.object({ decision: z.literal("rejected"), note: z.string().trim().min(1).max(2000) }),
      z.object({ decision: z.literal("withdrawn"), note: z.string().trim().max(2000).nullable().optional() }),
    ]).safeParse(req.body ?? {});
    if (!id.success || !p.success) return reply.code(400).send({ error: "validation_error" });
    try { await withCurrentUser(uid, (c) => decideApplication(c, uid, id.data, p.data)); return { ok: true }; } catch (e) { return fail(reply, e); }
  });
}

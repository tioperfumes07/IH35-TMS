/**
 * PERFUME-TRADE-SHOWS routes — the trade show planner. Desk owner only (Owner role AND perfume.desk_users), like every
 * perfume route. Shows and links are archived, never deleted.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";
import { deskAllowed } from "./desk.routes.js";
import {
  addShowContact, archiveShow, listShowContacts, listShows, saveShow, setIGo, ShowContactInvalid, showContactPatchSchema, showContactSchema,
  ShowNotFound, showSchema, showsOfCompany, updateShowContact,
} from "./trade-shows.service.js";

async function ownerOnly(req: FastifyRequest, reply: FastifyReply): Promise<string | null> {
  if (!requireAuth(req, reply)) return null;
  if (String(req.user?.role ?? "") !== "Owner") { void reply.code(403).send({ error: "owner_only" }); return null; }
  const uid = req.user!.uuid;
  if (!(await deskAllowed(uid))) { void reply.code(403).send({ error: "perfume_desk_not_granted" }); return null; }
  return uid;
}

const RL_READ = { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } } as const;
const RL_WRITE = { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } } as const;
const idParam = z.object({ id: z.string().uuid() });
const importSchema = z.object({ shows: z.array(showSchema.omit({ id: true })).min(1).max(500) });

function fail(reply: FastifyReply, e: unknown) {
  if (e instanceof ShowNotFound) return reply.code(404).send({ error: "not_found" });
  if (e instanceof ShowContactInvalid) return reply.code(400).send({ error: "invalid", message: e.message });
  throw e;
}

export async function registerPerfumeTradeShowRoutes(app: FastifyInstance) {
  app.get("/api/v1/perfume/trade-shows", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    return withCurrentUser(uid, async (c) => ({ shows: await listShows(c) }));
  });

  app.post("/api/v1/perfume/trade-shows", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const p = showSchema.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: "validation_error", details: p.error.flatten() });
    try { return await withCurrentUser(uid, (c) => saveShow(c, uid, p.data)); } catch (e) { return fail(reply, e); }
  });

  // The 2027 calendar from the research file (60 shows) — the same show twice is matched, never doubled.
  app.post("/api/v1/perfume/trade-shows/import", { ...RL_WRITE, bodyLimit: 2 * 1024 * 1024 }, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const p = importSchema.safeParse(req.body);
    if (!p.success) return reply.code(400).send({ error: "validation_error", details: p.error.flatten() });
    return withCurrentUser(uid, async (c) => {
      let created = 0, matched = 0;
      for (const s of p.data.shows) { if ((await saveShow(c, uid, s)).created) created++; else matched++; }
      return { shows: p.data.shows.length, created, matched };
    });
  });

  app.post("/api/v1/perfume/trade-shows/:id/i-go", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idParam.safeParse(req.params); const b = z.object({ i_go: z.boolean() }).safeParse(req.body);
    if (!id.success || !b.success) return reply.code(400).send({ error: "validation_error" });
    try { await withCurrentUser(uid, (c) => setIGo(c, id.data.id, b.data.i_go)); return { ok: true }; } catch (e) { return fail(reply, e); }
  });

  app.post("/api/v1/perfume/trade-shows/:id/archive", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idParam.safeParse(req.params);
    if (!id.success) return reply.code(400).send({ error: "validation_error" });
    try { await withCurrentUser(uid, (c) => archiveShow(c, id.data.id)); return { ok: true }; } catch (e) { return fail(reply, e); }
  });

  app.get("/api/v1/perfume/trade-shows/:id/contacts", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idParam.safeParse(req.params);
    if (!id.success) return reply.code(400).send({ error: "validation_error" });
    return withCurrentUser(uid, async (c) => ({ contacts: await listShowContacts(c, id.data.id) }));
  });

  app.post("/api/v1/perfume/trade-shows/:id/contacts", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idParam.safeParse(req.params); const b = showContactSchema.safeParse(req.body);
    if (!id.success || !b.success) return reply.code(400).send({ error: "validation_error", details: b.success ? undefined : b.error.flatten() });
    try { return await withCurrentUser(uid, (c) => addShowContact(c, uid, id.data.id, b.data)); } catch (e) { return fail(reply, e); }
  });

  app.patch("/api/v1/perfume/trade-show-contacts/:id", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idParam.safeParse(req.params); const b = showContactPatchSchema.safeParse(req.body);
    if (!id.success || !b.success) return reply.code(400).send({ error: "validation_error" });
    try { await withCurrentUser(uid, (c) => updateShowContact(c, id.data.id, b.data)); return { ok: true }; } catch (e) { return fail(reply, e); }
  });

  app.get("/api/v1/perfume/contacts/:id/trade-shows", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idParam.safeParse(req.params);
    if (!id.success) return reply.code(400).send({ error: "validation_error" });
    return withCurrentUser(uid, async (c) => ({ shows: await showsOfCompany(c, id.data.id) }));
  });
}

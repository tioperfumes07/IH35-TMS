/**
 * PERFUME-PROFILES routes (owner 2026-11-26 19:12 CT). Desk owner only. Reads, plus linking a vendor to its Contacts company.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";
import { deskAllowed } from "./desk.routes.js";
import { companyActivity, itemProfile, ProfileInvalid, ProfileNotFound, setVendorCompany, vendorProfile } from "./profiles.service.js";

async function ownerOnly(req: FastifyRequest, reply: FastifyReply): Promise<string | null> {
  if (!requireAuth(req, reply)) return null;
  if (String(req.user?.role ?? "") !== "Owner") { void reply.code(403).send({ error: "owner_only" }); return null; }
  const uid = req.user!.uuid;
  if (!(await deskAllowed(uid))) { void reply.code(403).send({ error: "perfume_desk_not_granted" }); return null; }
  return uid;
}
const RL_READ = { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } } as const;
const RL_WRITE = { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } } as const;
const idOf = (req: FastifyRequest) => z.string().uuid().safeParse((req.params as { id?: string }).id);
function fail(reply: FastifyReply, e: unknown) {
  if (e instanceof ProfileNotFound) return reply.code(404).send({ error: "not_found" });
  if (e instanceof ProfileInvalid) return reply.code(400).send({ error: "invalid", message: e.message });
  throw e;
}

export async function registerPerfumeProfileRoutes(app: FastifyInstance) {
  app.get("/api/v1/perfume/vendors/:id/profile", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    try { return await withCurrentUser(uid, (c) => vendorProfile(c, id.data)); } catch (e) { return fail(reply, e); }
  });
  app.patch("/api/v1/perfume/vendors/:id/company", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    const p = z.object({ company_id: z.string().uuid().nullable() }).safeParse(req.body ?? {});
    if (!p.success) return reply.code(400).send({ error: "validation_error" });
    try { await withCurrentUser(uid, (c) => setVendorCompany(c, id.data, p.data.company_id)); return { ok: true }; } catch (e) { return fail(reply, e); }
  });
  app.get("/api/v1/perfume/items/:id/profile", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    try { return await withCurrentUser(uid, (c) => itemProfile(c, id.data)); } catch (e) { return fail(reply, e); }
  });
  app.get("/api/v1/perfume/contacts/:id/activity", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    try { return await withCurrentUser(uid, (c) => companyActivity(c, id.data)); } catch (e) { return fail(reply, e); }
  });
}

/**
 * PERFUME-PROFILES routes (owner 2026-11-26 19:12 CT). Desk owner only. Reads, plus linking a vendor to its Contacts company.
 */
import { CompanyDetailsError, companyDetailsSchema, updateCompanyDetails } from "./company-details.service.js";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";
import { deskAllowed } from "./desk.routes.js";
import { companyActivity, itemProfile, ProfileInvalid, ProfileNotFound, vendorProfile } from "./profiles.service.js";
import { applyLinksSchema, applyVendorLinks, companyNameCheck, companyNameSchema, companyRoleSchema, confirmCompanyName, linkVendorCompany, renameCompany, setCompanyRole, vendorLinkPreview } from "./vendor-company.service.js";

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
    try { await withCurrentUser(uid, (c) => linkVendorCompany(c, uid, id.data, p.data.company_id)); return { ok: true }; } catch (e) { return fail(reply, e); }
  });
  // One company record (owner 2026-11-27 17:25 CT): every supplier / competitor list linked to its company in Contacts.
  app.get("/api/v1/perfume/vendor-links/preview", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    return withCurrentUser(uid, (c) => vendorLinkPreview(c));
  });
  app.post("/api/v1/perfume/vendor-links/apply", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const p = applyLinksSchema.safeParse(req.body ?? {});
    if (!p.success) return reply.code(400).send({ error: "validation_error", message: p.error.issues[0]?.message ?? "Invalid decisions." });
    try { return await withCurrentUser(uid, (c) => applyVendorLinks(c, uid, p.data)); } catch (e) { return fail(reply, e); }
  });
  // Leads "Convert to vendor / customer / both" + vendor / customer type (Trader …) on the one company record.
  app.patch("/api/v1/perfume/companies/:id/role", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    const p = companyRoleSchema.safeParse(req.body ?? {});
    if (!p.success) return reply.code(400).send({ error: "validation_error", message: p.error.issues[0]?.message ?? "Invalid." });
    try { return await withCurrentUser(uid, (c) => setCompanyRole(c, uid, id.data, p.data)); } catch (e) { return fail(reply, e); }
  });
  // Owner 18:21 CT: the company profile's own Edit pop-up — contact fields + Relationship / Industry / Review tags / Business type.
  app.patch("/api/v1/perfume/companies/:id/details", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    const p = companyDetailsSchema.safeParse(req.body ?? {});
    if (!p.success) return reply.code(400).send({ error: "validation_error", message: p.error.issues[0]?.message ?? "Invalid." });
    try { return await withCurrentUser(uid, (c) => updateCompanyDetails(c, uid, id.data, p.data)); }
    catch (e) { if (e instanceof CompanyDetailsError) return reply.code(e.code === "not_found" ? 404 : 400).send({ error: e.code, message: e.message }); throw e; }
  });
  // The company's real name (owner 2026-11-27 18:32 CT): the check list, rename, and "this name is right".
  app.get("/api/v1/perfume/vendor-links/names", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    return withCurrentUser(uid, (c) => companyNameCheck(c));
  });
  app.patch("/api/v1/perfume/companies/:id/name", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    const p = companyNameSchema.safeParse(req.body ?? {}); if (!p.success) return reply.code(400).send({ error: "validation_error", message: "A company needs a name." });
    try { return await withCurrentUser(uid, (c) => renameCompany(c, uid, id.data, p.data.name)); } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/perfume/companies/:id/name-ok", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    try { return await withCurrentUser(uid, (c) => confirmCompanyName(c, uid, id.data)); } catch (e) { return fail(reply, e); }
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

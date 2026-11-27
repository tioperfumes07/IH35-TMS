/**
 * PERFUME-LEADS routes — catalogs and the contacts Excel round trip (owner 2026-11-26 17:38 CT). Owner + desk_users only,
 * like every perfume route; every call runs as the desk owner (RLS perfume.is_owner()).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";
import { deskAllowed } from "./desk.routes.js";
import { contactQueryFrom, listSchema } from "./contacts.routes.js";
import { applyCleanup, applyCleanupSchema, previewCleanup } from "./catalog-cleanup.service.js";
import {
  addCatalogValue, applySchema, archiveCatalogValue, catalogValueSchema, discardUpload, exportWorkbook, getUpload, healStaleApplies,
  LeadsError, listCatalogs, listUploads, renameCatalogValue, saveUpload, startApply, uploadSchema,
} from "./leads.service.js";
import { companyHistory, historyOf } from "./leads.events.js";

async function ownerOnly(req: FastifyRequest, reply: FastifyReply): Promise<string | null> {
  if (!requireAuth(req, reply)) return null;
  if (String(req.user?.role ?? "") !== "Owner") { void reply.code(403).send({ error: "owner_only" }); return null; }
  const uid = req.user!.uuid;
  if (!(await deskAllowed(uid))) { void reply.code(403).send({ error: "perfume_desk_not_granted" }); return null; }
  return uid;
}
const RL_READ = { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } } as const;
const RL_WRITE = { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } } as const;
const RL_UPLOAD = { bodyLimit: 30 * 1024 * 1024, config: { rateLimit: { max: 10, timeWindow: "1 minute" } } } as const;
const idParam = z.object({ id: z.string().uuid() });

function fail(reply: FastifyReply, e: unknown) {
  if (e instanceof LeadsError) return reply.code(e.code === "not_found" ? 404 : 409).send({ error: e.code, message: e.message });
  throw e;
}

export async function registerPerfumeLeadsRoutes(app: FastifyInstance) {
  app.get("/api/v1/perfume/catalogs", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    return withCurrentUser(uid, (c) => listCatalogs(c));
  });
  app.post("/api/v1/perfume/catalogs", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const b = catalogValueSchema.safeParse(req.body ?? {});
    if (!b.success) return reply.code(400).send({ error: "validation_error", details: b.error.flatten() });
    try { return await withCurrentUser(uid, (c) => addCatalogValue(c, uid, b.data)); } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/perfume/catalogs/:id/rename", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idParam.safeParse(req.params); const b = z.object({ value: z.string().trim().min(1).max(200) }).safeParse(req.body ?? {});
    if (!id.success || !b.success) return reply.code(400).send({ error: "validation_error" });
    try { return await withCurrentUser(uid, (c) => renameCatalogValue(c, id.data.id, b.data.value, uid)); } catch (e) { return fail(reply, e); }
  });
  // Owner 2026-11-27 17:35 CT: clean the catalogs — product types without genders, customer types without overlaps. Preview, then Apply.
  app.get("/api/v1/perfume/catalogs/cleanup", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    return withCurrentUser(uid, (c) => previewCleanup(c));
  });
  app.post("/api/v1/perfume/catalogs/cleanup/apply", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const b = applyCleanupSchema.safeParse(req.body ?? {}); if (!b.success) return reply.code(400).send({ error: "validation_error" });
    return withCurrentUser(uid, (c) => applyCleanup(c, uid, b.data.keys));
  });
  app.post("/api/v1/perfume/catalogs/:id/archive", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idParam.safeParse(req.params); if (!id.success) return reply.code(400).send({ error: "validation_error" });
    await withCurrentUser(uid, (c) => archiveCatalogValue(c, id.data.id, uid));
    return { ok: true };
  });

  // The contacts as one Excel file (the Leads list's own filters apply), for filtering and categorizing outside the app.
  app.get("/api/v1/perfume/contacts/export.xlsx", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const q = listSchema.safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "invalid_query", details: q.error.flatten() });
    const out = await withCurrentUser(uid, (c) => exportWorkbook(c, contactQueryFrom(q.data)));
    return reply
      .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .header("Content-Disposition", `attachment; filename="${out.fileName}"`)
      .header("X-Rows", String(out.rows))
      .send(out.buf);
  });

  // Upload → preview (the browser reads the workbook and sends each sheet's cells). Nothing but the upload is written.
  app.post("/api/v1/perfume/contacts/uploads", RL_UPLOAD, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const b = uploadSchema.safeParse(req.body ?? {});
    if (!b.success) return reply.code(400).send({ error: "validation_error", details: b.error.issues.slice(0, 5) });
    return withCurrentUser(uid, (c) => saveUpload(c, uid, b.data));
  });
  app.get("/api/v1/perfume/contacts/uploads", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    await healStaleApplies(uid);
    return withCurrentUser(uid, async (c) => ({ uploads: await listUploads(c) }));
  });
  app.get("/api/v1/perfume/contacts/uploads/:id", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idParam.safeParse(req.params); if (!id.success) return reply.code(400).send({ error: "validation_error" });
    try { return await withCurrentUser(uid, (c) => getUpload(c, id.data.id)); } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/perfume/contacts/uploads/:id/apply", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idParam.safeParse(req.params); const b = applySchema.safeParse(req.body ?? {});
    if (!id.success || !b.success) return reply.code(400).send({ error: "validation_error" });
    try { return await startApply(uid, id.data.id, b.data); } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/perfume/contacts/uploads/:id/discard", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idParam.safeParse(req.params); if (!id.success) return reply.code(400).send({ error: "validation_error" });
    await withCurrentUser(uid, (c) => discardUpload(c, id.data.id));
    return { ok: true };
  });

  // History (who / when) and the reverse links of a contact: its trades (offered by it or sold to it).
  app.get("/api/v1/perfume/contacts/:id/history", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idParam.safeParse(req.params); if (!id.success) return reply.code(400).send({ error: "validation_error" });
    return withCurrentUser(uid, async (c) => ({ events: await companyHistory(c, id.data.id) }));
  });
  app.get("/api/v1/perfume/contacts/:id/trades", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idParam.safeParse(req.params); if (!id.success) return reply.code(400).send({ error: "validation_error" });
    return withCurrentUser(uid, async (c) => ({ trades: (await c.query(
      `SELECT t.id, t.item, t.brand, t.stage, t.buy_cents, t.sell_cents, t.qty, t.updated_at,
              CASE WHEN t.from_company_id = $1 THEN 'offered by them' ELSE 'offered to them' END AS side, b.status AS buyer_status, b.offer_cents
         FROM perfume.trades t LEFT JOIN perfume.trade_buyers b ON b.trade_id = t.id AND b.company_id = $1 AND b.archived_at IS NULL
        WHERE t.archived_at IS NULL AND (t.from_company_id = $1 OR b.id IS NOT NULL) ORDER BY t.updated_at DESC LIMIT 200`, [id.data.id])).rows }));
  });
  for (const [path, entity] of [["trades", "trade"], ["campaigns", "campaign"], ["segments", "segment"], ["catalogs", "catalog_value"]] as const) {
    app.get(`/api/v1/perfume/${path}/:id/history`, RL_READ, async (req, reply) => {
      const uid = await ownerOnly(req, reply); if (!uid) return;
      const id = idParam.safeParse(req.params); if (!id.success) return reply.code(400).send({ error: "validation_error" });
      return withCurrentUser(uid, async (c) => ({ events: await historyOf(c, entity, id.data.id) }));
    });
  }
}

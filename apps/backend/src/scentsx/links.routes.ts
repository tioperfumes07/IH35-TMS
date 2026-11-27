/**
 * SCENTSX B3a routes — ScentsX LLC's company summary and the perfume <-> engine links (customers, vendors,
 * documents). Owner 2026-11-26 20:13 / 20:16 CT; design https://claude.ai/artifact/VQ83ogvJyPpVoop1FNKJXC.
 * Same gate as the TIO Perfumes desk: Owner role AND perfume.desk_users. Links are voided, never deleted.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";
import { deskAllowed } from "../perfume/desk.routes.js";
import {
  createLink, listDocumentLinks, listLinks, scentsxChart, scentsxSummary, ScentsxLinkInvalid, ScentsxLinkNotFound, ScentsxNotSetUp, voidLink, type LinkKind,
} from "./links.service.js";

async function ownerOnly(req: FastifyRequest, reply: FastifyReply): Promise<string | null> {
  if (!requireAuth(req, reply)) return null;
  if (String(req.user?.role ?? "") !== "Owner") { void reply.code(403).send({ error: "owner_only" }); return null; }
  const uid = req.user!.uuid;
  if (!(await deskAllowed(uid))) { void reply.code(403).send({ error: "perfume_desk_not_granted" }); return null; }
  return uid;
}

const RL_READ = { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } } as const;
const RL_WRITE = { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } } as const;
const uuid = z.string().uuid();
const KIND = { customer: "customer-links", vendor: "vendor-links" } as const;

function fail(reply: FastifyReply, e: unknown) {
  if (e instanceof ScentsxNotSetUp) return reply.code(409).send({ error: "scentsx_not_set_up", message: e.message });
  if (e instanceof ScentsxLinkInvalid) return reply.code(400).send({ error: "invalid", message: e.message });
  if (e instanceof ScentsxLinkNotFound) return reply.code(404).send({ error: "not_found" });
  throw e;
}

export async function registerScentsxLinkRoutes(app: FastifyInstance) {
  app.get("/api/v1/scentsx/company", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    try { return await withCurrentUser(uid, async (c) => ({ company: await scentsxSummary(c) })); } catch (e) { return fail(reply, e); }
  });

  app.get("/api/v1/scentsx/accounts", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    try { return await withCurrentUser(uid, async (c) => ({ accounts: await scentsxChart(c) })); } catch (e) { return fail(reply, e); }
  });

  for (const kind of ["customer", "vendor"] as LinkKind[]) {
    const base = `/api/v1/scentsx/${KIND[kind]}`;
    app.get(base, RL_READ, async (req, reply) => {
      const uid = await ownerOnly(req, reply); if (!uid) return;
      const q = z.object({ desk_id: uuid.optional(), engine_id: uuid.optional() }).safeParse(req.query ?? {});
      if (!q.success) return reply.code(400).send({ error: "invalid_query" });
      try { return await withCurrentUser(uid, async (c) => ({ links: await listLinks(c, kind, q.data) })); } catch (e) { return fail(reply, e); }
    });
    app.post(base, RL_WRITE, async (req, reply) => {
      const uid = await ownerOnly(req, reply); if (!uid) return;
      const b = z.object({ desk_id: uuid, engine_id: uuid }).safeParse(req.body ?? {});
      if (!b.success) return reply.code(400).send({ error: "invalid_body" });
      try { return await withCurrentUser(uid, async (c) => ({ link: await createLink(c, uid, kind, b.data.desk_id, b.data.engine_id) })); } catch (e) { return fail(reply, e); }
    });
    app.post(`${base}/:id/void`, RL_WRITE, async (req, reply) => {
      const uid = await ownerOnly(req, reply); if (!uid) return;
      const id = uuid.safeParse((req.params as { id?: string }).id);
      const b = z.object({ reason: z.string().trim().min(3).max(500) }).safeParse(req.body ?? {});
      if (!id.success || !b.success) return reply.code(400).send({ error: "invalid_body" });
      try { return await withCurrentUser(uid, async (c) => ({ link: await voidLink(c, uid, kind, id.data, b.data.reason) })); } catch (e) { return fail(reply, e); }
    });
  }

  app.get("/api/v1/scentsx/document-links", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const q = z.object({
      quote_id: uuid.optional(), sales_order_id: uuid.optional(), purchase_order_id: uuid.optional(),
      invoice_id: uuid.optional(), bill_id: uuid.optional(), journal_entry_id: uuid.optional(),
    }).refine((v) => Object.values(v).some(Boolean), { message: "one filter required" }).safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "invalid_query" });
    try { return await withCurrentUser(uid, async (c) => ({ links: await listDocumentLinks(c, q.data) })); } catch (e) { return fail(reply, e); }
  });
}

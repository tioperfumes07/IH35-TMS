/**
 * PERFUME-QUOTES routes — quotations with history, Excel and PDF (owner 2026-11-26 18:13 CT). Desk owner only (Owner role
 * AND perfume.desk_users), like every perfume route. Quotes and lines are archived, never deleted; history is append-only.
 */
import { DocCatalogInvalid, docCatalogs } from "./doc-catalogs.service.js";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";
import { deskAllowed } from "./desk.routes.js";
import {
  addLine, archiveQuote, copyQuote, createQuote, getQuote, linePatchSchema, lineSchema, listQuotes, QUOTE_STATUSES, QuoteInvalid, QuoteNotFound,
  quotePatchSchema, quotePdf, quoteSchema, quotesListXlsx, quotesOfCompany, quotesOfItem, quoteXlsx, removeLine, searchQuoteItems, setQuoteStatus,
  updateLine, updateQuote,
} from "./quotes.service.js";

async function ownerOnly(req: FastifyRequest, reply: FastifyReply): Promise<string | null> {
  if (!requireAuth(req, reply)) return null;
  if (String(req.user?.role ?? "") !== "Owner") { void reply.code(403).send({ error: "owner_only" }); return null; }
  const uid = req.user!.uuid;
  if (!(await deskAllowed(uid))) { void reply.code(403).send({ error: "perfume_desk_not_granted" }); return null; }
  return uid;
}

const RL_READ = { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } } as const;
const RL_WRITE = { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } } as const;
const RL_PDF = { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } } as const;
const idOf = (req: FastifyRequest) => z.string().uuid().safeParse((req.params as { id?: string }).id);
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function fail(reply: FastifyReply, e: unknown) {
  if (e instanceof QuoteNotFound) return reply.code(404).send({ error: "not_found" });
  if (e instanceof QuoteInvalid) return reply.code(400).send({ error: "invalid", message: e.message });
  if (e instanceof DocCatalogInvalid) return reply.code(400).send({ error: "invalid", message: e.message });
  throw e;
}
const contentDisposition = (name: string) => `attachment; filename="${name.replace(/"/g, "")}"`;

export async function registerPerfumeQuoteRoutes(app: FastifyInstance) {
  // M20: the pick lists for every document form (terms with days, shipping methods, sales-tax codes, payment methods).
  app.get("/api/v1/perfume/doc-catalogs", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    return withCurrentUser(uid, (c) => docCatalogs(c));
  });
  app.get("/api/v1/perfume/quotes", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const q = z.object({ status: z.enum(QUOTE_STATUSES).optional(), q: z.string().max(200).optional() }).safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "invalid_query" });
    return withCurrentUser(uid, async (c) => ({ quotes: await listQuotes(c, q.data) }));
  });
  app.get("/api/v1/perfume/quotes/export.xlsx", RL_PDF, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const buf = await withCurrentUser(uid, (c) => quotesListXlsx(c));
    return reply.header("Content-Type", XLSX).header("Content-Disposition", contentDisposition("TIO quotes.xlsx")).send(buf);
  });
  app.get("/api/v1/perfume/quote-items", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const q = z.object({ q: z.string().max(120) }).safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "invalid_query" });
    return withCurrentUser(uid, async (c) => ({ items: await searchQuoteItems(c, q.data.q) }));
  });
  // Reverse wiring: a customer's quotes (contact profile) and an item's quotes.
  app.get("/api/v1/perfume/contacts/:id/quotes", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    return withCurrentUser(uid, async (c) => ({ quotes: await quotesOfCompany(c, id.data) }));
  });
  app.get("/api/v1/perfume/items/:id/quotes", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    return withCurrentUser(uid, async (c) => ({ quotes: await quotesOfItem(c, id.data) }));
  });

  app.post("/api/v1/perfume/quotes", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const p = quoteSchema.safeParse(req.body ?? {});
    if (!p.success) return reply.code(400).send({ error: "validation_error", details: p.error.flatten() });
    try { return await withCurrentUser(uid, (c) => createQuote(c, uid, p.data)); } catch (e) { return fail(reply, e); }
  });
  app.get("/api/v1/perfume/quotes/:id", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    try { return await withCurrentUser(uid, (c) => getQuote(c, id.data)); } catch (e) { return fail(reply, e); }
  });
  app.patch("/api/v1/perfume/quotes/:id", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    const p = quotePatchSchema.safeParse(req.body ?? {});
    if (!p.success) return reply.code(400).send({ error: "validation_error", details: p.error.flatten() });
    try { await withCurrentUser(uid, (c) => updateQuote(c, uid, id.data, p.data)); return { ok: true }; } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/perfume/quotes/:id/status", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    const p = z.object({ status: z.enum(QUOTE_STATUSES) }).safeParse(req.body ?? {});
    if (!p.success) return reply.code(400).send({ error: "validation_error" });
    try { await withCurrentUser(uid, (c) => setQuoteStatus(c, uid, id.data, p.data.status)); return { ok: true }; } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/perfume/quotes/:id/archive", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    try { await withCurrentUser(uid, (c) => archiveQuote(c, uid, id.data)); return { ok: true }; } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/perfume/quotes/:id/copy", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    try { return await withCurrentUser(uid, (c) => copyQuote(c, uid, id.data)); } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/perfume/quotes/:id/lines", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    const p = lineSchema.safeParse(req.body ?? {});
    if (!p.success) return reply.code(400).send({ error: "validation_error", details: p.error.flatten() });
    try { return await withCurrentUser(uid, (c) => addLine(c, uid, id.data, p.data)); } catch (e) { return fail(reply, e); }
  });
  app.patch("/api/v1/perfume/quote-lines/:id", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    const p = linePatchSchema.safeParse(req.body ?? {});
    if (!p.success) return reply.code(400).send({ error: "validation_error", details: p.error.flatten() });
    try { await withCurrentUser(uid, (c) => updateLine(c, uid, id.data, p.data)); return { ok: true }; } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/perfume/quote-lines/:id/archive", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    try { await withCurrentUser(uid, (c) => removeLine(c, uid, id.data)); return { ok: true }; } catch (e) { return fail(reply, e); }
  });
  app.get("/api/v1/perfume/quotes/:id/export.xlsx", RL_PDF, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    try {
      const f = await withCurrentUser(uid, (c) => quoteXlsx(c, uid, id.data));
      return reply.header("Content-Type", XLSX).header("Content-Disposition", contentDisposition(f.filename)).send(f.buffer);
    } catch (e) { return fail(reply, e); }
  });
  app.get("/api/v1/perfume/quotes/:id/export.pdf", RL_PDF, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    try {
      const f = await withCurrentUser(uid, (c) => quotePdf(c, uid, id.data));
      return reply.header("Content-Type", "application/pdf").header("Content-Disposition", contentDisposition(f.filename)).send(f.buffer);
    } catch (e) { return fail(reply, e); }
  });
}

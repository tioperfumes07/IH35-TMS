/**
 * PERFUME-DESK routes — /api/v1/perfume/*. Owner role only (and RLS: perfume.is_owner()).
 * No operating_company_id anywhere: this module belongs to TIO Perfumes, not to any carrier.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";
import { AnthropicRateLimitError, AnthropicTimeoutError } from "../ai/anthropic-messages.js";
import {
  AnthropicNotConfiguredError,
  extractPriceLines,
  PERFUME_EXTRACT_MAX_IMAGES,
  PERFUME_EXTRACT_MEDIA,
  PerfumeExtractInputError,
} from "./extract.service.js";
import {
  buildGrid, confirmRow, exportWorkbook, filterFacets, filterView, gridFacets, getRules, ImportCheckFailed, importList, listLists, listVendors, previewImport, putRules,
  reviewQueue, searchItems, searchRows, setInternalCode, splitPicks, setListCurrent, sortRows, upsertVendor, voidList, type GridView,
} from "./desk.service.js";

/** Owner role AND listed in perfume.desk_users (owner order: "it would only be me"). Other Owner-role users get 403. */
export async function deskAllowed(uid: string): Promise<boolean> {
  return withCurrentUser(uid, async (c) => {
    const r = await c.query<{ ok: boolean }>("SELECT perfume.is_owner() AS ok");
    return r.rows[0]?.ok === true;
  });
}
async function ownerOnly(req: FastifyRequest, reply: FastifyReply): Promise<string | null> {
  if (!requireAuth(req, reply)) return null;
  if (String(req.user?.role ?? "") !== "Owner") {
    void reply.code(403).send({ error: "owner_only" });
    return null;
  }
  const uid = req.user!.uuid;
  if (!(await deskAllowed(uid))) {
    void reply.code(403).send({ error: "perfume_desk_not_granted" });
    return null;
  }
  return uid;
}
function bad(reply: FastifyReply, e: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: e.flatten() });
}

const cents = z.number().int().min(0).max(100_000).nullable().optional();
const vendorSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  kind: z.enum(["buy", "sell", "both"]).optional(),
  cushion_lo_cents: cents, cushion_hi_cents: cents, freight_lo_cents: cents, freight_hi_cents: cents,
  earn_pct: z.number().min(0).max(99).nullable().optional(),
  sells_by_box: z.boolean().optional(),
  contact: z.string().max(300).nullable().optional(),
  column_mapping: z.record(z.string(), z.unknown()).optional(),
});
const rulesSchema = z.object({
  round_step: z.enum(["5", "10", "25", "50", "100", "75"]).optional(),
  round_dir: z.enum(["up", "nearest", "down"]).optional(),
  cushion_lo_cents: z.number().int().min(0).max(10_000).optional(),
  cushion_hi_cents: z.number().int().min(0).max(10_000).optional(),
  freight_lo_cents: z.number().int().min(0).max(10_000).optional(),
  freight_hi_cents: z.number().int().min(0).max(10_000).optional(),
  vendor_earn_pct: z.number().min(0).max(99).optional(),
  store_earn_pct: z.number().min(0).max(99).optional(),
  wholesale_targets_pct: z.array(z.number().min(0).max(99)).max(6).optional(),
  columns: z.record(z.string(), z.array(z.string()).max(200)).optional(),
});
const rowSchema = z.object({
  sheet: z.string().max(120).nullable().optional(),
  row_no: z.number().int().min(1),
  raw: z.unknown().optional(),
  upc: z.string().max(40).nullable().optional(),
  sku: z.string().max(80).nullable().optional(),
  brand: z.string().max(120).nullable().optional(),
  description: z.string().max(400),
  size_text: z.string().max(60).nullable().optional(),
  gender: z.string().max(30).nullable().optional(),
  type: z.string().max(40).nullable().optional(),
  section: z.string().max(120).nullable().optional(),
  price: z.union([z.number(), z.string().max(30)]),
  qty: z.union([z.number(), z.string().max(30)]).nullable().optional(),
  case_pack: z.union([z.number(), z.string().max(30)]).nullable().optional(),
});
const importSchema = z.object({
  vendor_id: z.string().uuid(),
  list_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  label: z.string().max(200).nullable().optional(),
  file_name: z.string().min(1).max(300),
  source_kind: z.enum(["xlsx", "xls", "csv", "pdf_text", "image", "manual"]),
  rows_read: z.number().int().min(0).max(100_000),
  file_price_total_cents: z.number().int().min(0),
  rows: z.array(rowSchema).max(100_000),
  replaces_current: z.boolean().optional(),
});
const gridQuery = z.object({
  view: z.enum(["buy", "trade", "wholesale", "all"]).default("buy"),
  sort: z.string().max(120).optional(),
  dir: z.enum(["asc", "desc"]).default("asc"),
  q: z.string().max(200).default(""),
  // Comma-separated facet picks; empty = all. Category is the type (Women, Men, Set Men, Tester Women, Cosmetics, Various…).
  category: z.string().max(400).default(""),
  gender: z.string().max(200).default(""),
  brand: z.string().max(4000).default(""),
  size: z.string().max(1000).default(""),
  vendor: z.string().max(4000).default(""),
  // The margin the owner types on the grid; drives the "My target" columns.
  target_pct: z.coerce.number().min(0).max(95).optional(),
  // The % the owner believes his vendors earn — the Trading tab's box.
  earn_pct: z.coerce.number().min(0).max(95).optional(),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(1000).default(200),
});

const RL_READ = { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } } as const;
const RL_WRITE = { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } } as const;
const RL_IMPORT = { bodyLimit: 25 * 1024 * 1024, config: { rateLimit: { max: 10, timeWindow: "1 minute" } } } as const;

// Pictures are read in small batches (the screen loops), so one call stays well under the request timeout.
const RL_EXTRACT = { bodyLimit: 40 * 1024 * 1024, config: { rateLimit: { max: 30, timeWindow: "1 minute" } } } as const;
const extractSchema = z.object({
  images: z.array(z.object({
    name: z.string().min(1).max(200),
    media_type: z.enum(PERFUME_EXTRACT_MEDIA),
    data_base64: z.string().min(16).regex(/^[A-Za-z0-9+/=]+$/),
  })).min(1).max(PERFUME_EXTRACT_MAX_IMAGES),
});

export async function registerPerfumeDeskRoutes(app: FastifyInstance) {
  // Lets the company selector show the TIO Perfumes entry only to the desk user. Never 403s an Owner.
  app.get("/api/v1/perfume/access", RL_READ, async (req, reply) => {
    if (!requireAuth(req, reply)) return reply;
    if (String(req.user?.role ?? "") !== "Owner") return { allowed: false };
    return { allowed: await deskAllowed(req.user!.uuid) };
  });
  app.get("/api/v1/perfume/rules", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    return withCurrentUser(uid, (c) => getRules(c));
  });
  app.put("/api/v1/perfume/rules", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const p = rulesSchema.safeParse(req.body); if (!p.success) return bad(reply, p.error);
    return withCurrentUser(uid, (c) => putRules(c, uid, p.data));
  });

  app.get("/api/v1/perfume/vendors", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    return { vendors: await withCurrentUser(uid, (c) => listVendors(c)) };
  });
  app.post("/api/v1/perfume/vendors", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const p = vendorSchema.safeParse(req.body); if (!p.success) return bad(reply, p.error);
    return withCurrentUser(uid, (c) => upsertVendor(c, uid, p.data));
  });

  app.get("/api/v1/perfume/lists", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    return { lists: await withCurrentUser(uid, (c) => listLists(c)) };
  });
  // Reads offer photos / scanned price-list pages. Writes NOTHING: the lines go back to the owner to fix and
  // approve; only the approved lines are saved, through POST /lists like any file (to-the-cent check intact).
  app.post("/api/v1/perfume/extract", RL_EXTRACT, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const p = extractSchema.safeParse(req.body); if (!p.success) return bad(reply, p.error);
    try {
      return await extractPriceLines(p.data.images);
    } catch (e) {
      if (e instanceof PerfumeExtractInputError) return reply.code(400).send({ error: "extract_input", message: e.message });
      if (e instanceof AnthropicNotConfiguredError) return reply.code(503).send({ error: "reader_not_configured", message: "The picture reader is not configured on the server (no Claude API key on the backend)." });
      if (e instanceof AnthropicRateLimitError) return reply.code(429).send({ error: "reader_busy", message: "The picture reader is busy — wait a minute and press Read again." });
      if (e instanceof AnthropicTimeoutError) return reply.code(504).send({ error: "reader_timeout", message: "The picture reader took too long — try fewer pictures at a time." });
      req.log.error({ err: e }, "perfume extract failed");
      return reply.code(502).send({ error: "reader_failed", message: String((e as Error)?.message ?? e).slice(0, 200) });
    }
  });
  app.post("/api/v1/perfume/lists/preview", RL_IMPORT, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const p = importSchema.safeParse(req.body); if (!p.success) return bad(reply, p.error);
    return withCurrentUser(uid, (c) => previewImport(c, p.data));
  });
  app.post("/api/v1/perfume/lists", RL_IMPORT, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const p = importSchema.safeParse(req.body); if (!p.success) return bad(reply, p.error);
    try {
      return await withCurrentUser(uid, (c) => importList(c, uid, p.data));
    } catch (e) {
      if (e instanceof ImportCheckFailed) return reply.code(422).send({ error: "import_check_failed", check: e.check });
      throw e;
    }
  });
  app.post("/api/v1/perfume/lists/:id/void", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params); if (!params.success) return bad(reply, params.error);
    const body = z.object({ reason: z.string().trim().min(3).max(500) }).safeParse(req.body); if (!body.success) return bad(reply, body.error);
    await withCurrentUser(uid, (c) => voidList(c, params.data.id, body.data.reason));
    return { ok: true };
  });

  app.post("/api/v1/perfume/lists/:id/current", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params); if (!params.success) return bad(reply, params.error);
    const body = z.object({ current: z.boolean() }).safeParse(req.body); if (!body.success) return bad(reply, body.error);
    await withCurrentUser(uid, (c) => setListCurrent(c, params.data.id, body.data.current));
    return { ok: true };
  });

  app.get("/api/v1/perfume/review", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const q = z.object({ list_id: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(500).default(100), offset: z.coerce.number().int().min(0).default(0) }).safeParse(req.query);
    if (!q.success) return bad(reply, q.error);
    return withCurrentUser(uid, (c) => reviewQueue(c, q.data));
  });
  app.post("/api/v1/perfume/rows/:id/confirm", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params); if (!params.success) return bad(reply, params.error);
    const body = z.object({ item_id: z.string().uuid().optional(), create_new: z.boolean().optional() })
      .refine((b) => Boolean(b.item_id) !== Boolean(b.create_new), "send item_id or create_new").safeParse(req.body);
    if (!body.success) return bad(reply, body.error);
    return withCurrentUser(uid, (c) => confirmRow(c, uid, params.data.id, body.data));
  });

  app.get("/api/v1/perfume/items/search", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const q = z.object({ q: z.string().max(200) }).safeParse(req.query); if (!q.success) return bad(reply, q.error);
    return { items: await withCurrentUser(uid, (c) => searchItems(c, q.data.q)) };
  });
  app.put("/api/v1/perfume/items/:id/internal-code", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params); if (!params.success) return bad(reply, params.error);
    const body = z.object({ internal_code: z.string().max(60).nullable() }).safeParse(req.body); if (!body.success) return bad(reply, body.error);
    await withCurrentUser(uid, (c) => setInternalCode(c, params.data.id, body.data.internal_code));
    return { ok: true };
  });

  app.get("/api/v1/perfume/grid", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const q = gridQuery.safeParse(req.query); if (!q.success) return bad(reply, q.error);
    const g = await withCurrentUser(uid, (c) => buildGrid(c, { targetPct: q.data.target_pct, earnPct: q.data.earn_pct }));
    const viewRows = searchRows(filterView(g.rows, q.data.view as GridView), q.data.q);
    const picks = { category: splitPicks(q.data.category), gender: splitPicks(q.data.gender), brand: splitPicks(q.data.brand), size: splitPicks(q.data.size), vendor: splitPicks(q.data.vendor) };
    let rows = filterFacets(viewRows, picks);
    if (q.data.sort) {
      if (!g.cols.some((c) => c.key === q.data.sort)) return reply.code(400).send({ error: "unknown_sort_column" });
      rows = sortRows(rows, q.data.sort, q.data.dir);
    }
    return { cols: g.cols, total: rows.length, rows: rows.slice(q.data.offset, q.data.offset + q.data.limit), facets: gridFacets(viewRows, picks), rules: g.rules, vendors: g.vendors, target_pct: g.target_pct, earn_pct: g.earn_pct, measured_at: new Date().toISOString() };
  });
  app.get("/api/v1/perfume/export.xlsx", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const q = gridQuery.extend({ cols: z.string().max(8000).optional() }).safeParse(req.query); if (!q.success) return bad(reply, q.error);
    const g = await withCurrentUser(uid, (c) => buildGrid(c, { targetPct: q.data.target_pct, earnPct: q.data.earn_pct }));
    let rows = filterFacets(searchRows(filterView(g.rows, q.data.view as GridView), q.data.q),
      { category: splitPicks(q.data.category), gender: splitPicks(q.data.gender), brand: splitPicks(q.data.brand), size: splitPicks(q.data.size), vendor: splitPicks(q.data.vendor) });
    if (q.data.sort && g.cols.some((c) => c.key === q.data.sort)) rows = sortRows(rows, q.data.sort, q.data.dir);
    const want = q.data.cols ? q.data.cols.split(",") : null;
    const cols = want ? want.map((k) => g.cols.find((c) => c.key === k)).filter((c): c is NonNullable<typeof c> => Boolean(c)) : g.cols;
    const buf = await exportWorkbook(cols, rows, g.rules, `TIO ${q.data.view}`);
    const stamp = new Date().toISOString().slice(0, 10);
    return reply
      .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .header("Content-Disposition", `attachment; filename="TIO-Perfumes-${q.data.view}-${stamp}.xlsx"`)
      .send(buf);
  });
}

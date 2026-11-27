/**
 * PERFUME-INVENTORY routes (owner 2026-11-26 20:21 CT). Desk owner only. The stock ledger is append-only; counts over $500
 * are posted by a second person; opening stock comes in only when the owner presses Apply.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import ExcelJS from "exceljs";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";
import { deskAllowed } from "./desk.routes.js";
import {
  addTransferLine, cancelCount, cancelTransfer, createCount, createTransfer, getCount, getTransfer, InvInvalid, InvNotFound, itemLots, listCounts, listMoves,
  listSites, listTransfers, openingApply, openingPreview, postCount, receiveTransfer, removeTransferLine, setCountLine, setReorder, shipTransfer, siteSchema,
  stockOnHand, submitCount, transferSchema, updateSite,
  addWriteoffLine, cancelWriteoff, createWriteoff, getWriteoff, listWriteoffs, postWriteoff, removeWriteoffLine, submitWriteoff, valuation, writeoffSchema,
} from "./inventory.service.js";

async function ownerOnly(req: FastifyRequest, reply: FastifyReply): Promise<string | null> {
  if (!requireAuth(req, reply)) return null;
  if (String(req.user?.role ?? "") !== "Owner") { void reply.code(403).send({ error: "owner_only" }); return null; }
  const uid = req.user!.uuid;
  if (!(await deskAllowed(uid))) { void reply.code(403).send({ error: "perfume_desk_not_granted" }); return null; }
  return uid;
}
const RL_READ = { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } } as const;
const RL_WRITE = { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } } as const;
const RL_FILE = { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } } as const;
const uuid = z.string().uuid();
const idOf = (req: FastifyRequest) => uuid.safeParse((req.params as { id?: string }).id);
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
function fail(reply: FastifyReply, e: unknown) {
  if (e instanceof InvNotFound) return reply.code(404).send({ error: "not_found" });
  if (e instanceof InvInvalid) return reply.code(400).send({ error: "invalid", message: e.message });
  throw e;
}
const stockQuery = z.object({ location: z.string().max(40).optional(), q: z.string().max(200).optional(), item_id: uuid.optional(), low: z.enum(["1"]).optional() });

export async function registerPerfumeInventoryRoutes(app: FastifyInstance) {
  app.get("/api/v1/perfume/inventory/sites", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    return withCurrentUser(uid, async (c) => ({ sites: await listSites(c) }));
  });
  app.patch("/api/v1/perfume/inventory/sites/:code", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const code = z.string().min(1).max(40).safeParse((req.params as { code?: string }).code);
    const p = siteSchema.safeParse(req.body ?? {});
    if (!code.success || !p.success) return reply.code(400).send({ error: "validation_error" });
    try { await withCurrentUser(uid, (c) => updateSite(c, uid, code.data, p.data)); return { ok: true }; } catch (e) { return fail(reply, e); }
  });
  app.get("/api/v1/perfume/inventory/stock", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const q = stockQuery.safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "invalid_query" });
    return withCurrentUser(uid, async (c) => ({ stock: await stockOnHand(c, { ...q.data, low: q.data.low === "1" }) }));
  });
  app.get("/api/v1/perfume/inventory/stock/export.xlsx", RL_FILE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const q = stockQuery.safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "invalid_query" });
    const rows = await withCurrentUser(uid, (c) => stockOnHand(c, { ...q.data, low: q.data.low === "1" }));
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet("Stock on hand");
    ws.columns = [{ header: "Item", width: 50 }, { header: "My code", width: 14 }, { header: "Site", width: 10 }, { header: "Site name", width: 24 }, { header: "On hand", width: 10 },
      { header: "Avg cost", width: 12 }, { header: "FIFO value", width: 14 }, { header: "Oldest lot", width: 12 }, { header: "Min", width: 8 }, { header: "Max", width: 8 }];
    for (const r of rows) ws.addRow([r.display_name, r.internal_code ?? "", r.location_code, r.location_name, r.qty, Number(r.avg_cost_cents) / 100, Number(r.fifo_value_cents) / 100, r.oldest_lot ?? "", r.min_qty ?? "", r.max_qty ?? ""]);
    ws.getColumn(6).numFmt = '"$"#,##0.00'; ws.getColumn(7).numFmt = '"$"#,##0.00'; ws.getRow(1).font = { bold: true, name: "Arial" };
    return reply.header("Content-Type", XLSX).header("Content-Disposition", `attachment; filename="Stock on hand.xlsx"`).send(Buffer.from(await wb.xlsx.writeBuffer()));
  });
  app.put("/api/v1/perfume/inventory/reorder", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const p = z.object({ item_id: uuid, location_code: z.string().min(1).max(40), min_qty: z.number().int().min(0).nullable(), max_qty: z.number().int().min(0).nullable() }).safeParse(req.body ?? {});
    if (!p.success) return reply.code(400).send({ error: "validation_error" });
    try { await withCurrentUser(uid, (c) => setReorder(c, p.data.item_id, p.data.location_code, p.data.min_qty, p.data.max_qty)); return { ok: true }; } catch (e) { return fail(reply, e); }
  });
  app.get("/api/v1/perfume/items/:id/lots", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    return withCurrentUser(uid, async (c) => ({ lots: await itemLots(c, id.data), stock: await stockOnHand(c, { item_id: id.data }) }));
  });
  app.get("/api/v1/perfume/inventory/moves", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const q = z.object({ item_id: uuid.optional(), location: z.string().max(40).optional(), kind: z.string().max(20).optional(), purchase_order_id: uuid.optional(),
      sales_order_id: uuid.optional(), limit: z.coerce.number().int().min(1).max(5000).optional() }).safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "invalid_query" });
    return withCurrentUser(uid, async (c) => ({ moves: await listMoves(c, q.data) }));
  });
  // Transfers
  app.get("/api/v1/perfume/inventory/transfers", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    return withCurrentUser(uid, async (c) => ({ transfers: await listTransfers(c) }));
  });
  app.post("/api/v1/perfume/inventory/transfers", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const p = transferSchema.safeParse(req.body ?? {});
    if (!p.success) return reply.code(400).send({ error: "validation_error" });
    try { return await withCurrentUser(uid, (c) => createTransfer(c, uid, p.data)); } catch (e) { return fail(reply, e); }
  });
  app.get("/api/v1/perfume/inventory/transfers/:id", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    try { return await withCurrentUser(uid, (c) => getTransfer(c, id.data)); } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/perfume/inventory/transfers/:id/lines", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); const p = z.object({ item_id: uuid, qty: z.number().int().min(1).max(1_000_000) }).safeParse(req.body ?? {});
    if (!id.success || !p.success) return reply.code(400).send({ error: "validation_error" });
    try { return await withCurrentUser(uid, (c) => addTransferLine(c, id.data, p.data.item_id, p.data.qty)); } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/perfume/inventory/transfer-lines/:id/archive", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    try { await withCurrentUser(uid, (c) => removeTransferLine(c, id.data)); return { ok: true }; } catch (e) { return fail(reply, e); }
  });
  for (const [verb, fn] of [["ship", shipTransfer], ["receive", receiveTransfer]] as const) {
    app.post(`/api/v1/perfume/inventory/transfers/:id/${verb}`, RL_WRITE, async (req, reply) => {
      const uid = await ownerOnly(req, reply); if (!uid) return;
      const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
      try { await withCurrentUser(uid, (c) => fn(c, uid, id.data)); return { ok: true }; } catch (e) { return fail(reply, e); }
    });
  }
  app.post("/api/v1/perfume/inventory/transfers/:id/cancel", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    try { await withCurrentUser(uid, (c) => cancelTransfer(c, id.data)); return { ok: true }; } catch (e) { return fail(reply, e); }
  });
  // Counts (every adjustment is a count)
  app.get("/api/v1/perfume/inventory/counts", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    return withCurrentUser(uid, async (c) => ({ counts: await listCounts(c) }));
  });
  app.post("/api/v1/perfume/inventory/counts", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const p = z.object({ location_code: z.string().min(1).max(40), all_items: z.boolean().optional(), notes: z.string().trim().max(2000).nullable().optional() }).safeParse(req.body ?? {});
    if (!p.success) return reply.code(400).send({ error: "validation_error" });
    try { return await withCurrentUser(uid, (c) => createCount(c, uid, p.data.location_code, p.data)); } catch (e) { return fail(reply, e); }
  });
  app.get("/api/v1/perfume/inventory/counts/:id", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    try { return await withCurrentUser(uid, (c) => getCount(c, id.data)); } catch (e) { return fail(reply, e); }
  });
  app.put("/api/v1/perfume/inventory/counts/:id/lines", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); const p = z.object({ item_id: uuid, counted_qty: z.number().int().min(0).max(10_000_000) }).safeParse(req.body ?? {});
    if (!id.success || !p.success) return reply.code(400).send({ error: "validation_error" });
    try { await withCurrentUser(uid, (c) => setCountLine(c, id.data, p.data.item_id, p.data.counted_qty)); return { ok: true }; } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/perfume/inventory/counts/:id/submit", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    try { return await withCurrentUser(uid, (c) => submitCount(c, uid, id.data)); } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/perfume/inventory/counts/:id/post", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    try { return await withCurrentUser(uid, (c) => postCount(c, uid, id.data)); } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/perfume/inventory/counts/:id/cancel", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    try { await withCurrentUser(uid, (c) => cancelCount(c, id.data)); return { ok: true }; } catch (e) { return fail(reply, e); }
  });
  // Write-offs (damaged / expired / stolen / counterfeit); over $500 a second person posts
  app.get("/api/v1/perfume/inventory/writeoffs", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    return withCurrentUser(uid, async (c) => ({ writeoffs: await listWriteoffs(c) }));
  });
  app.post("/api/v1/perfume/inventory/writeoffs", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const p = writeoffSchema.safeParse(req.body ?? {});
    if (!p.success) return reply.code(400).send({ error: "validation_error" });
    try { return await withCurrentUser(uid, (c) => createWriteoff(c, uid, p.data)); } catch (e) { return fail(reply, e); }
  });
  app.get("/api/v1/perfume/inventory/writeoffs/:id", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    try { return await withCurrentUser(uid, (c) => getWriteoff(c, id.data)); } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/perfume/inventory/writeoffs/:id/lines", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); const p = z.object({ item_id: uuid, qty: z.number().int().min(1).max(10_000_000), lot_id: uuid.nullable().optional() }).safeParse(req.body ?? {});
    if (!id.success || !p.success) return reply.code(400).send({ error: "validation_error" });
    try { return await withCurrentUser(uid, (c) => addWriteoffLine(c, id.data, p.data.item_id, p.data.qty, p.data.lot_id ?? null)); } catch (e) { return fail(reply, e); }
  });
  app.delete("/api/v1/perfume/inventory/writeoff-lines/:id", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    try { await withCurrentUser(uid, (c) => removeWriteoffLine(c, id.data)); return { ok: true }; } catch (e) { return fail(reply, e); }
  });
  const woSteps: Array<[string, (c: Parameters<typeof submitWriteoff>[0], uid: string, id: string) => Promise<unknown>]> = [["submit", submitWriteoff], ["post", postWriteoff]];
  for (const [verb, fn] of woSteps) {
    app.post(`/api/v1/perfume/inventory/writeoffs/:id/${verb}`, RL_WRITE, async (req, reply) => {
      const uid = await ownerOnly(req, reply); if (!uid) return;
      const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
      try { return await withCurrentUser(uid, (c) => fn(c, uid, id.data)); } catch (e) { return fail(reply, e); }
    });
  }
  app.post("/api/v1/perfume/inventory/writeoffs/:id/cancel", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    try { await withCurrentUser(uid, (c) => cancelWriteoff(c, id.data)); return { ok: true }; } catch (e) { return fail(reply, e); }
  });
  // Month-end valuation, FIFO and moving average, from the ledger
  const valQuery = z.object({ as_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), location: z.string().max(40).optional() });
  app.get("/api/v1/perfume/inventory/valuation", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const q = valQuery.safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "invalid_query", message: "Pick the date." });
    try { return await withCurrentUser(uid, (c) => valuation(c, q.data.as_of, q.data.location)); } catch (e) { return fail(reply, e); }
  });
  app.get("/api/v1/perfume/inventory/valuation/export.xlsx", RL_FILE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const q = valQuery.safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "invalid_query" });
    const v = await withCurrentUser(uid, (c) => valuation(c, q.data.as_of, q.data.location));
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet("Valuation");
    const [y, m, d] = v.as_of.split("-");
    ws.addRow([`TIO Perfumes — stock valuation at close of ${m}/${d}/${y}`]).font = { bold: true, name: "Arial", size: 12 };
    ws.addRow([]);
    const head = ws.addRow(["Site", "Item", "On hand", "FIFO value", "Average value"]); head.font = { bold: true, name: "Arial" };
    for (const r of v.rows) ws.addRow([r.location_code, r.display_name, r.qty, r.fifo_cents / 100, r.avg_cents / 100]);
    ws.addRow([]);
    for (const s of v.sites) ws.addRow([s.location_code, "Site total", s.units, s.fifo_cents / 100, s.avg_cents / 100]).font = { bold: true, name: "Arial" };
    ws.addRow(["All sites", "Total", v.sites.reduce((t, s) => t + s.units, 0), v.total_fifo_cents / 100, v.total_avg_cents / 100]).font = { bold: true, name: "Arial" };
    ws.getColumn(1).width = 12; ws.getColumn(2).width = 52; ws.getColumn(3).width = 10; ws.getColumn(4).width = 16; ws.getColumn(5).width = 16;
    ws.getColumn(4).numFmt = '"$"#,##0.00'; ws.getColumn(5).numFmt = '"$"#,##0.00';
    return reply.header("Content-Type", XLSX).header("Content-Disposition", `attachment; filename="Stock valuation ${m}-${d}-${y}.xlsx"`).send(Buffer.from(await wb.xlsx.writeBuffer()));
  });
  // Opening stock from the owner's inventory file
  app.get("/api/v1/perfume/inventory/opening", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    return withCurrentUser(uid, (c) => openingPreview(c));
  });
  app.post("/api/v1/perfume/inventory/opening", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const p = z.object({ on_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), confirm: z.literal(true) }).safeParse(req.body ?? {});
    if (!p.success) return reply.code(400).send({ error: "validation_error", message: "Pick the date and confirm." });
    try { return await withCurrentUser(uid, (c) => openingApply(c, uid, p.data.on_date)); } catch (e) { return fail(reply, e); }
  });
}

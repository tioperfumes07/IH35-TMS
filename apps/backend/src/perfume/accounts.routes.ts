/**
 * PERFUME-PRICE-LEVELS + CUSTOMER-ACCOUNTS routes (owner 2026-11-26 20:21 / 20:28 CT). Desk owner only — every approval is his.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";
import { deskAllowed } from "./desk.routes.js";
import {
  accountSchema, AcctInvalid, AcctNotFound, applicationSchema, decideApplication, getAccount, levelItems, levelSchema, listAccounts, listApplications, costCoverage, listLevels,
  saveAccount, saveLevel, setHold, setLevelItem, submitApplication,
} from "./accounts.service.js";
import ExcelJS from "exceljs";
import { wholesaleList, WholesaleInvalid, wholesaleQuery } from "./wholesale.service.js";

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
  if (e instanceof AcctInvalid || e instanceof WholesaleInvalid) return reply.code(400).send({ error: "invalid", message: e.message });
  throw e;
}

export async function registerPerfumeAccountRoutes(app: FastifyInstance) {
  // Wholesale lists (owner 2026-11-27 08:10 CT): one price level's list of our items, on screen and as Excel.
  app.get("/api/v1/perfume/wholesale-list", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const q = wholesaleQuery.safeParse(req.query ?? {}); if (!q.success) return reply.code(400).send({ error: "invalid_query", message: "Pick a price level." });
    try { return await withCurrentUser(uid, (c) => wholesaleList(c, q.data)); } catch (e) { return fail(reply, e); }
  });
  app.get("/api/v1/perfume/wholesale-list.xlsx", { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } }, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const q = wholesaleQuery.safeParse(req.query ?? {}); if (!q.success) return reply.code(400).send({ error: "invalid_query", message: "Pick a price level." });
    let data;
    try { data = await withCurrentUser(uid, (c) => wholesaleList(c, q.data)); } catch (e) { return fail(reply, e); }
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(data.level.name.slice(0, 31));
    ws.addRow([`TIO Perfumes · ${data.level.name} price list`]);
    ws.addRow([`Prices in USD · ${new Date().toLocaleDateString("en-US", { timeZone: "America/Chicago" })} · subject to stock`]);
    ws.addRow([]);
    const head = ["TIO code", "Item", "Brand", "Family", "Category", "Type", "Size ml", "EDT / EDP / Parfum", "Gender", "UPC", "Case pack", "Min order", "Available",
      "Price", "Case price", "Quantity breaks", "Origin", "HS code"];
    ws.addRow(head);
    for (const r of data.rows) {
      ws.addRow([r.tio_code ?? "", r.display_name, r.brand, r.family ?? "", r.category ?? "", r.product_type ?? "", r.size_ml ?? "", r.conc ?? "",
        r.gender === "M" ? "Men" : r.gender === "W" ? "Women" : r.gender === "U" ? "Unisex" : "", r.upc ?? "", r.case_pack ?? "", r.min_order_qty ?? "", r.available,
        r.price_cents == null ? "" : r.price_cents / 100, r.case_price_cents == null ? "" : r.case_price_cents / 100,
        r.breaks.map((b) => `${b.min_qty}+ $${(b.price_cents / 100).toFixed(2)}`).join(" · "), r.origin_country ?? "", r.hs_code ?? ""]);
    }
    ws.getRow(1).font = { bold: true, size: 14, name: "Arial" };
    ws.getRow(4).font = { bold: true, name: "Arial" };
    ws.columns.forEach((col, i) => { col.width = [10, 44, 18, 20, 14, 14, 8, 10, 8, 16, 9, 9, 10, 11, 11, 28, 7, 11][i] ?? 12; });
    for (const n of [14, 15]) ws.getColumn(n).numFmt = '"$"#,##0.00';
    ws.views = [{ state: "frozen", ySplit: 4 }];
    ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: head.length } };
    const name = `TIO Perfumes ${data.level.name} price list.xlsx`.replace(/[^A-Za-z0-9 .()_-]/g, "");
    return reply.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet").header("Content-Disposition", `attachment; filename="${name}"`)
      .send(Buffer.from(await wb.xlsx.writeBuffer()));
  });

  app.get("/api/v1/perfume/price-levels", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    return withCurrentUser(uid, async (c) => ({ levels: await listLevels(c), costs: await costCoverage(c) }));
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

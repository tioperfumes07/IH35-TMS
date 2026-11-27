/**
 * PERFUME-ITEM-FILE routes (owner 2026-11-26 22:51 CT). Desk owner only. The item file (list + one item, editable), UPCs and HK
 * codes onto an item, filling TIO codes from his own offer list when he presses it, and the linkage screen. Excel on the list.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import ExcelJS from "exceljs";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";
import { deskAllowed } from "./desk.routes.js";
import {
  addHkCode, addUpc, fillCodesApply, fillCodesPreview, getItemFile, ItemInvalid, itemEditSchema, itemBulkSchema, bulkEditItems, itemFileCounts, ItemNotFound, linkage, linkageQuery, linkItemTo, listItemFile, listQuery,
  stockLinkQueue, stockQueueQuery, strictLinkApply, strictLinkPreview, updateItemFile,
} from "./items.service.js";
import { ProfileNotFound } from "./profiles.service.js";

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
const idOf = (req: FastifyRequest) => z.string().uuid().safeParse((req.params as { id?: string }).id);
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
function fail(reply: FastifyReply, e: unknown) {
  if (e instanceof ItemNotFound || e instanceof ProfileNotFound) return reply.code(404).send({ error: "not_found" });
  if (e instanceof ItemInvalid) return reply.code(400).send({ error: "invalid", message: e.message });
  throw e;
}

export async function registerPerfumeItemFileRoutes(app: FastifyInstance) {
  app.get("/api/v1/perfume/item-file", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const q = listQuery.safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "invalid_query" });
    return withCurrentUser(uid, async (c) => ({ ...(await listItemFile(c, q.data)), counts: await itemFileCounts(c) }));
  });
  app.get("/api/v1/perfume/item-file/export.xlsx", RL_FILE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const q = listQuery.safeParse({ ...(req.query as object ?? {}), limit: 500 });
    if (!q.success) return reply.code(400).send({ error: "invalid_query" });
    // Every matching item, 500 at a time.
    const all = await withCurrentUser(uid, async (c) => {
      const out: Array<Record<string, unknown>> = [];
      for (let offset = 0; ; offset += 500) {
        const page = await listItemFile(c, { ...q.data, limit: 500, offset });
        out.push(...page.rows);
        if (page.rows.length < 500 || out.length >= 40_000) break;
      }
      return out;
    });
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet("Item file");
    ws.columns = [{ header: "Item", width: 56 }, { header: "TIO code", width: 14 }, { header: "HK codes", width: 18 }, { header: "UPCs", width: 34 }, { header: "Brand", width: 20 },
      { header: "Size ml", width: 9 }, { header: "Type", width: 9 }, { header: "Gender", width: 8 }, { header: "Lists linked", width: 11 }, { header: "Best supplier cost", width: 16 },
      { header: "My avg cost", width: 12 }, { header: "My last cost", width: 12 }];
    for (const r of all) {
      ws.addRow([r.display_name, r.tio_code ?? "", (r.hk_codes as string[]).join(", "), (r.upcs as string[]).join(", "), r.brand, r.size_ml ?? "", r.conc ?? "", r.gender ?? "", r.lists_linked,
        r.best_cost_cents == null ? "" : Number(r.best_cost_cents) / 100, r.my_avg_cost_cents == null ? "" : Number(r.my_avg_cost_cents) / 100,
        r.my_last_cost_cents == null ? "" : Number(r.my_last_cost_cents) / 100]);
    }
    for (const n of [10, 11, 12]) ws.getColumn(n).numFmt = '"$"#,##0.00';
    ws.getRow(1).font = { bold: true, name: "Arial" };
    return reply.header("Content-Type", XLSX).header("Content-Disposition", `attachment; filename="TIO item file.xlsx"`).send(Buffer.from(await wb.xlsx.writeBuffer()));
  });
  app.get("/api/v1/perfume/item-file/:id", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    try { return await withCurrentUser(uid, (c) => getItemFile(c, id.data)); } catch (e) { return fail(reply, e); }
  });
  app.patch("/api/v1/perfume/item-file/:id", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); const p = itemEditSchema.safeParse(req.body ?? {});
    if (!id.success || !p.success) return reply.code(400).send({ error: "validation_error" });
    try { return await withCurrentUser(uid, (c) => updateItemFile(c, uid, id.data, p.data)); } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/perfume/item-file-bulk", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const p = itemBulkSchema.safeParse(req.body ?? {});
    if (!p.success) return reply.code(400).send({ error: "validation_error" });
    try { return await withCurrentUser(uid, (c) => bulkEditItems(c, uid, p.data)); } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/perfume/item-file/:id/upcs", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); const p = z.object({ upc: z.string().trim().min(1).max(40) }).safeParse(req.body ?? {});
    if (!id.success || !p.success) return reply.code(400).send({ error: "validation_error" });
    try { return await withCurrentUser(uid, (c) => addUpc(c, uid, id.data, p.data.upc)); } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/perfume/item-file/:id/hk-codes", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); const p = z.object({ hk_code: z.string().trim().min(1).max(40) }).safeParse(req.body ?? {});
    if (!id.success || !p.success) return reply.code(400).send({ error: "validation_error" });
    try { return await withCurrentUser(uid, (c) => addHkCode(c, uid, id.data, p.data.hk_code)); } catch (e) { return fail(reply, e); }
  });
  app.get("/api/v1/perfume/item-file-fill-codes", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    return withCurrentUser(uid, (c) => fillCodesPreview(c));
  });
  app.post("/api/v1/perfume/item-file-fill-codes", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const p = z.object({ confirm: z.literal(true) }).safeParse(req.body ?? {});
    if (!p.success) return reply.code(400).send({ error: "validation_error" });
    return withCurrentUser(uid, (c) => fillCodesApply(c, uid));
  });
  app.get("/api/v1/perfume/linkage", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const q = linkageQuery.safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "invalid_query", message: "Type a UPC, a code or words." });
    return withCurrentUser(uid, (c) => linkage(c, q.data));
  });
  // Stock linkage (owner 2026-11-27 06:19 CT): confirm every one of OUR items to the vendors' item (UPCs, lines, codes, cost).
  app.get("/api/v1/perfume/stock-linkage", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const q = stockQueueQuery.safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "invalid_query" });
    return withCurrentUser(uid, (c) => stockLinkQueue(c, q.data));
  });
  app.post("/api/v1/perfume/stock-linkage/link", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const p = z.object({ from_item_id: z.string().uuid(), to_item_id: z.string().uuid() }).safeParse(req.body ?? {});
    if (!p.success) return reply.code(400).send({ error: "validation_error" });
    try { return await withCurrentUser(uid, (c) => linkItemTo(c, uid, p.data.from_item_id, p.data.to_item_id)); } catch (e) { return fail(reply, e); }
  });
  app.get("/api/v1/perfume/stock-linkage/strict", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    return withCurrentUser(uid, async (c) => ({ pairs: await strictLinkPreview(c) }));
  });
  app.post("/api/v1/perfume/stock-linkage/strict", RL_FILE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const p = z.object({ confirm: z.literal(true) }).safeParse(req.body ?? {});
    if (!p.success) return reply.code(400).send({ error: "validation_error" });
    try { return await withCurrentUser(uid, (c) => strictLinkApply(c, uid)); } catch (e) { return fail(reply, e); }
  });
}

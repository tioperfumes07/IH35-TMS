/**
 * PERFUME-PURCHASE-ORDERS routes (owner 2026-11-26 19:12 CT). Desk owner only (Owner role AND perfume.desk_users). POs and lines
 * are archived, never deleted; history is append-only.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";
import { deskAllowed } from "./desk.routes.js";
import {
  addPurchaseLine, archivePurchaseOrder, createPurchaseOrder, getPurchaseOrder, listPurchaseOrders, PO_STATUSES, PoInvalid, poLinePatchSchema, poLineSchema,
  PoNotFound, poSchema, purchaseOrderPdf, purchaseOrdersFromOrder, purchaseOrdersListXlsx, purchaseOrdersOfItem, purchaseOrdersOfOrder, purchaseOrdersOfVendor,
  purchaseOrderXlsx, receivePurchase, receiveSchema, removePurchaseLine, setPurchaseOrderStatus, updatePurchaseLine, updatePurchaseOrder,
  approvePurchase, poApprovalOverCents, setPoApprovalOverCents,
} from "./purchases.service.js";

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
const cd = (name: string) => `attachment; filename="${name.replace(/"/g, "")}"`;
const listQuery = z.object({ status: z.enum(PO_STATUSES).optional(), vendor_id: z.string().uuid().optional(), q: z.string().max(200).optional() });

function fail(reply: FastifyReply, e: unknown) {
  if (e instanceof PoNotFound) return reply.code(404).send({ error: "not_found" });
  if (e instanceof PoInvalid) return reply.code(400).send({ error: "invalid", message: e.message });
  throw e;
}

export async function registerPerfumePurchaseRoutes(app: FastifyInstance) {
  app.get("/api/v1/perfume/purchase-orders", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const q = listQuery.safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "invalid_query" });
    return withCurrentUser(uid, async (c) => ({ purchase_orders: await listPurchaseOrders(c, q.data) }));
  });
  app.get("/api/v1/perfume/purchase-orders/export.xlsx", RL_FILE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const q = listQuery.safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "invalid_query" });
    const f = await withCurrentUser(uid, (c) => purchaseOrdersListXlsx(c, q.data));
    return reply.header("Content-Type", XLSX).header("Content-Disposition", cd(f.filename)).send(f.buffer);
  });
  app.get("/api/v1/perfume/vendors/:id/purchase-orders", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    return withCurrentUser(uid, async (c) => ({ purchase_orders: await purchaseOrdersOfVendor(c, id.data) }));
  });
  app.get("/api/v1/perfume/items/:id/purchase-orders", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    return withCurrentUser(uid, async (c) => ({ purchase_orders: await purchaseOrdersOfItem(c, id.data) }));
  });
  app.get("/api/v1/perfume/orders/:id/purchase-orders", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    return withCurrentUser(uid, async (c) => ({ purchase_orders: await purchaseOrdersOfOrder(c, id.data) }));
  });
  app.post("/api/v1/perfume/orders/:id/purchase", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    const p = z.object({ expected_by: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional() }).safeParse(req.body ?? {});
    if (!p.success) return reply.code(400).send({ error: "validation_error" });
    try { return await withCurrentUser(uid, (c) => purchaseOrdersFromOrder(c, uid, id.data, p.data)); } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/perfume/purchase-orders", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const p = poSchema.safeParse(req.body ?? {});
    if (!p.success) return reply.code(400).send({ error: "validation_error", details: p.error.flatten() });
    try { return await withCurrentUser(uid, (c) => createPurchaseOrder(c, uid, p.data)); } catch (e) { return fail(reply, e); }
  });
  app.get("/api/v1/perfume/purchase-orders/:id", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    try { return await withCurrentUser(uid, (c) => getPurchaseOrder(c, id.data)); } catch (e) { return fail(reply, e); }
  });
  app.patch("/api/v1/perfume/purchase-orders/:id", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    const p = poSchema.safeParse(req.body ?? {});
    if (!p.success) return reply.code(400).send({ error: "validation_error", details: p.error.flatten() });
    try { await withCurrentUser(uid, (c) => updatePurchaseOrder(c, uid, id.data, p.data)); return { ok: true }; } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/perfume/purchase-orders/:id/status", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    const p = z.object({ status: z.enum(["open", "cancelled"]) }).safeParse(req.body ?? {});
    if (!p.success) return reply.code(400).send({ error: "validation_error" });
    try { await withCurrentUser(uid, (c) => setPurchaseOrderStatus(c, uid, id.data, p.data.status)); return { ok: true }; } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/perfume/purchase-orders/:id/receive-all", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    const p = receiveSchema.safeParse(req.body ?? {});
    if (!p.success) return reply.code(400).send({ error: "validation_error", details: p.error.flatten() });
    try { return await withCurrentUser(uid, (c) => receivePurchase(c, uid, id.data, p.data)); } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/perfume/purchase-orders/:id/approve", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    const p = z.object({ note: z.string().trim().max(2000).nullable().optional() }).safeParse(req.body ?? {});
    if (!p.success) return reply.code(400).send({ error: "validation_error" });
    try { return await withCurrentUser(uid, (c) => approvePurchase(c, uid, id.data, p.data.note ?? null)); } catch (e) { return fail(reply, e); }
  });
  app.get("/api/v1/perfume/purchase-orders-approval", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    return withCurrentUser(uid, async (c) => ({ approval_over_cents: await poApprovalOverCents(c) }));
  });
  app.put("/api/v1/perfume/purchase-orders-approval", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const p = z.object({ approval_over_cents: z.number().int().min(1).max(100_000_000_00).nullable() }).safeParse(req.body ?? {});
    if (!p.success) return reply.code(400).send({ error: "validation_error" });
    try { return await withCurrentUser(uid, (c) => setPoApprovalOverCents(c, uid, p.data.approval_over_cents)); } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/perfume/purchase-orders/:id/archive", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    try { await withCurrentUser(uid, (c) => archivePurchaseOrder(c, uid, id.data)); return { ok: true }; } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/perfume/purchase-orders/:id/lines", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    const p = poLineSchema.safeParse(req.body ?? {});
    if (!p.success) return reply.code(400).send({ error: "validation_error", details: p.error.flatten() });
    try { return await withCurrentUser(uid, (c) => addPurchaseLine(c, uid, id.data, p.data)); } catch (e) { return fail(reply, e); }
  });
  app.patch("/api/v1/perfume/purchase-order-lines/:id", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    const p = poLinePatchSchema.safeParse(req.body ?? {});
    if (!p.success) return reply.code(400).send({ error: "validation_error", details: p.error.flatten() });
    try { await withCurrentUser(uid, (c) => updatePurchaseLine(c, uid, id.data, p.data)); return { ok: true }; } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/perfume/purchase-order-lines/:id/archive", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    try { await withCurrentUser(uid, (c) => removePurchaseLine(c, uid, id.data)); return { ok: true }; } catch (e) { return fail(reply, e); }
  });
  app.get("/api/v1/perfume/purchase-orders/:id/export.xlsx", RL_FILE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    try { const f = await withCurrentUser(uid, (c) => purchaseOrderXlsx(c, uid, id.data)); return reply.header("Content-Type", XLSX).header("Content-Disposition", cd(f.filename)).send(f.buffer); }
    catch (e) { return fail(reply, e); }
  });
  app.get("/api/v1/perfume/purchase-orders/:id/export.pdf", RL_FILE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    try { const f = await withCurrentUser(uid, (c) => purchaseOrderPdf(c, uid, id.data)); return reply.header("Content-Type", "application/pdf").header("Content-Disposition", cd(f.filename)).send(f.buffer); }
    catch (e) { return fail(reply, e); }
  });
}

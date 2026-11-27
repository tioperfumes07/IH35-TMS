/**
 * PERFUME-SALES-ORDERS routes (owner 2026-11-26 19:08 CT). Desk owner only (Owner role AND perfume.desk_users). Orders and lines
 * are archived, never deleted; history is append-only.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";
import { deskAllowed } from "./desk.routes.js";
import {
  addOrderLine, archiveOrder, createOrder, getOrder, listOrders, ORDER_STATUSES, OrderInvalid, orderFromQuote, orderLinePatchSchema, orderLineSchema,
  OrderNotFound, orderPdf, orderSchema, ordersListXlsx, ordersOfCompany, ordersOfItem, orderXlsx, removeOrderLine, setOrderStatus, shipAll, updateOrder, updateOrderLine,
} from "./orders.service.js";

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

function fail(reply: FastifyReply, e: unknown) {
  if (e instanceof OrderNotFound) return reply.code(404).send({ error: "not_found" });
  if (e instanceof OrderInvalid) return reply.code(400).send({ error: "invalid", message: e.message });
  throw e;
}

export async function registerPerfumeOrderRoutes(app: FastifyInstance) {
  app.get("/api/v1/perfume/orders", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const q = z.object({ status: z.enum(ORDER_STATUSES).optional(), q: z.string().max(200).optional() }).safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "invalid_query" });
    return withCurrentUser(uid, async (c) => ({ orders: await listOrders(c, q.data) }));
  });
  app.get("/api/v1/perfume/orders/export.xlsx", RL_FILE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const q = z.object({ status: z.enum(ORDER_STATUSES).optional(), q: z.string().max(200).optional() }).safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "invalid_query" });
    const f = await withCurrentUser(uid, (c) => ordersListXlsx(c, q.data));
    return reply.header("Content-Type", XLSX).header("Content-Disposition", cd(f.filename)).send(f.buffer);
  });
  app.get("/api/v1/perfume/contacts/:id/orders", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    return withCurrentUser(uid, async (c) => ({ orders: await ordersOfCompany(c, id.data) }));
  });
  app.get("/api/v1/perfume/items/:id/orders", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    return withCurrentUser(uid, async (c) => ({ orders: await ordersOfItem(c, id.data) }));
  });
  app.post("/api/v1/perfume/orders", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const p = orderSchema.safeParse(req.body ?? {});
    if (!p.success) return reply.code(400).send({ error: "validation_error", details: p.error.flatten() });
    try { return await withCurrentUser(uid, (c) => createOrder(c, uid, p.data)); } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/perfume/quotes/:id/order", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    const p = z.object({ ship_by: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional() }).safeParse(req.body ?? {});
    if (!p.success) return reply.code(400).send({ error: "validation_error" });
    try { return await withCurrentUser(uid, (c) => orderFromQuote(c, uid, id.data, p.data)); } catch (e) { return fail(reply, e); }
  });
  app.get("/api/v1/perfume/orders/:id", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    try { return await withCurrentUser(uid, (c) => getOrder(c, id.data)); } catch (e) { return fail(reply, e); }
  });
  app.patch("/api/v1/perfume/orders/:id", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    const p = orderSchema.safeParse(req.body ?? {});
    if (!p.success) return reply.code(400).send({ error: "validation_error", details: p.error.flatten() });
    try { await withCurrentUser(uid, (c) => updateOrder(c, uid, id.data, p.data)); return { ok: true }; } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/perfume/orders/:id/status", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    const p = z.object({ status: z.enum(["open", "cancelled"]) }).safeParse(req.body ?? {});
    if (!p.success) return reply.code(400).send({ error: "validation_error" });
    try { await withCurrentUser(uid, (c) => setOrderStatus(c, uid, id.data, p.data.status)); return { ok: true }; } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/perfume/orders/:id/ship-all", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    try { return await withCurrentUser(uid, (c) => shipAll(c, uid, id.data)); } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/perfume/orders/:id/archive", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    try { await withCurrentUser(uid, (c) => archiveOrder(c, uid, id.data)); return { ok: true }; } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/perfume/orders/:id/lines", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    const p = orderLineSchema.safeParse(req.body ?? {});
    if (!p.success) return reply.code(400).send({ error: "validation_error", details: p.error.flatten() });
    try { return await withCurrentUser(uid, (c) => addOrderLine(c, uid, id.data, p.data)); } catch (e) { return fail(reply, e); }
  });
  app.patch("/api/v1/perfume/order-lines/:id", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    const p = orderLinePatchSchema.safeParse(req.body ?? {});
    if (!p.success) return reply.code(400).send({ error: "validation_error", details: p.error.flatten() });
    try { await withCurrentUser(uid, (c) => updateOrderLine(c, uid, id.data, p.data)); return { ok: true }; } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/perfume/order-lines/:id/archive", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    try { await withCurrentUser(uid, (c) => removeOrderLine(c, uid, id.data)); return { ok: true }; } catch (e) { return fail(reply, e); }
  });
  app.get("/api/v1/perfume/orders/:id/export.xlsx", RL_FILE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    try { const f = await withCurrentUser(uid, (c) => orderXlsx(c, uid, id.data)); return reply.header("Content-Type", XLSX).header("Content-Disposition", cd(f.filename)).send(f.buffer); }
    catch (e) { return fail(reply, e); }
  });
  app.get("/api/v1/perfume/orders/:id/export.pdf", RL_FILE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    try { const f = await withCurrentUser(uid, (c) => orderPdf(c, uid, id.data)); return reply.header("Content-Type", "application/pdf").header("Content-Disposition", cd(f.filename)).send(f.buffer); }
    catch (e) { return fail(reply, e); }
  });
}

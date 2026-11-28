/**
 * PERFUME-SALES-ORDERS routes (owner 2026-11-26 19:08 CT). Desk owner only (Owner role AND perfume.desk_users). Orders and lines
 * are archived, never deleted; history is append-only.
 */
import { emailDocSchema, htmlToPdf, orderInvoices, packingSlipHtml, recordDocSent } from "./print-docs.service.js";
import { parseRecipients, PERFUME_SENDER, SendError, startSend } from "./mail/send.js";
import { DocCatalogInvalid, docCatalogs } from "./doc-catalogs.service.js";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";
import { deskAllowed } from "./desk.routes.js";
import {
  addOrderLine, archiveOrder, createOrder, getOrder, listOrders, ORDER_STATUSES, OrderInvalid, orderFromQuote, orderLinePatchSchema, orderLineSchema,
  OrderNotFound, orderPdf, orderSchema, ordersListXlsx, ordersOfCompany, ordersOfItem, orderXlsx, removeOrderLine, setOrderStatus, shipOrder, shipSchema, updateOrder, updateOrderLine,
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
  if (e instanceof DocCatalogInvalid) return reply.code(400).send({ error: "invalid", message: e.message });
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
    const p = shipSchema.safeParse(req.body ?? {});
    if (!p.success) return reply.code(400).send({ error: "validation_error", details: p.error.flatten() });
    try { return await withCurrentUser(uid, (c) => shipOrder(c, uid, id.data, p.data)); } catch (e) { return fail(reply, e); }
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
  // M22: packing slip (no prices) printed from the order, like the count sheet; the order's ScentsX invoices; e-mail either as a PDF.
  app.get("/api/v1/perfume/orders/:id/packing-slip.html", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    try {
      const html = await withCurrentUser(uid, (c) => packingSlipHtml(c, id.data));
      return reply.header("Content-Type", "text/html; charset=utf-8").header("Cache-Control", "no-store").send(html);
    } catch (e) { return fail(reply, e); }
  });
  app.get("/api/v1/perfume/orders/:id/invoices", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    return withCurrentUser(uid, async (c) => ({ invoices: await orderInvoices(c, id.data), operating_company_id: (await c.query<{ id: string }>(`SELECT scentsx.company_id()::text AS id`)).rows[0]?.id ?? null }));
  });
  app.post("/api/v1/perfume/orders/:id/email-document", RL_FILE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    const b = emailDocSchema.safeParse(req.body ?? {}); if (!b.success) return reply.code(400).send({ error: "invalid_body" });
    const { emails, invalid } = parseRecipients(b.data.to);
    if (invalid.length) return reply.code(400).send({ error: "invalid", message: `Not an email address: ${invalid.join(", ")}` });
    if (!emails.length) return reply.code(400).send({ error: "invalid", message: "Add at least one email address." });
    try {
      const o = await withCurrentUser(uid, (c) => getOrder(c, id.data));
      let html: string, fileName: string, what: string;
      if (b.data.doc === "packing_slip") {
        html = await withCurrentUser(uid, (c) => packingSlipHtml(c, id.data));
        fileName = `Packing slip ${o.number}.pdf`; what = `packing slip ${o.number}`;
      } else {
        const inv = await withCurrentUser(uid, async (c) => {
          const list = await orderInvoices(c, id.data);
          const pick = b.data.invoice_id ? list.find((x) => x.id === b.data.invoice_id) : list[0];
          return { pick, co: (await c.query<{ id: string }>(`SELECT scentsx.company_id()::text AS id`)).rows[0]?.id ?? null };
        });
        if (!inv.pick || !inv.co) return reply.code(400).send({ error: "invalid", message: `${o.number} has no ScentsX invoice yet — invoice the shipped units first.` });
        // The books' own invoice document (one renderer), rendered with the owner's session.
        const r = await app.inject({ method: "GET", url: `/api/v1/accounting/invoices/${inv.pick.id}.html?operating_company_id=${inv.co}`, headers: { cookie: String(req.headers.cookie ?? "") } });
        if (r.statusCode !== 200) return reply.code(502).send({ error: "invoice_render_failed", message: `The invoice document did not render (${r.statusCode}).` });
        html = r.body; fileName = `Invoice ${inv.pick.display_id ?? inv.pick.id.slice(0, 8)} ${o.number}.pdf`; what = `invoice ${inv.pick.display_id ?? ""} for ${o.number}`;
      }
      const pdf = await htmlToPdf(html);
      const subject = b.data.subject ?? `TIO Perfumes ${what}`.replace(/\s+/g, " ").trim();
      const body = b.data.message ?? `Hello ${o.customer_name},\n\nAttached is the ${what}.\n\nThank you,\nTIO Perfumes`;
      const sent = await startSend(uid, { from: PERFUME_SENDER, recipients: emails, subject, body, attachments: [{ fileName: fileName.replace(/[^\w .#-]+/g, ""), content: pdf, mimeType: "application/pdf" }] });
      await withCurrentUser(uid, (c) => recordDocSent(c, id.data, uid, { doc: b.data.doc, invoice_id: b.data.invoice_id ?? null, emailed_to: emails, batch_id: sent.batch_id }));
      return { ok: true, ...sent, file: fileName };
    } catch (e) {
      if (e instanceof SendError) return reply.code(400).send({ error: e.code, message: e.message });
      return fail(reply, e);
    }
  });
  app.get("/api/v1/perfume/orders/:id/export.pdf", RL_FILE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = idOf(req); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    try { const f = await withCurrentUser(uid, (c) => orderPdf(c, uid, id.data)); return reply.header("Content-Type", "application/pdf").header("Content-Disposition", cd(f.filename)).send(f.buffer); }
    catch (e) { return fail(reply, e); }
  });
}

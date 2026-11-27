/**
 * SCENTSX B3a routes — ScentsX LLC's company summary and the perfume <-> engine links (customers, vendors,
 * documents). Owner 2026-11-26 20:13 / 20:16 CT; design https://claude.ai/artifact/VQ83ogvJyPpVoop1FNKJXC.
 * Same gate as the TIO Perfumes desk: Owner role AND perfume.desk_users. Links are voided, never deleted.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { pendingStockMoves, postPendingStockMoves } from "./stock-move-poster.service.js";
import { billableLines, invoiceSalesOrder } from "./sales-invoice.service.js";
import { creditExposure } from "./credit-exposure.service.js";
import { salesReport } from "./sales-report.service.js";
import { inventoryTieOut } from "./inventory-tieout.service.js";
import { accountMapSchema, itemAccountMap, itemPostingAccounts, setCategoryAccounts, setItemAccounts } from "./item-accounts.service.js";
import { hasExportProof, hasResaleCertificate, partyStatus, screenParty } from "./sanctions.service.js";
import { withCurrentUser } from "../auth/db.js";
import { deskAllowed } from "../perfume/desk.routes.js";
import {
  createLink, listDocumentLinks, scopeToScentsx, listLinks, scentsxAccountRegister, scentsxChart, scentsxSummary, ScentsxLinkInvalid, ScentsxLinkNotFound, ScentsxNotSetUp, voidLink, type LinkKind,
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
  // Item → Inventory / COGS accounts (owner 2026-11-27 08:10 CT, migration 202617050100).
  app.get("/api/v1/scentsx/item-accounts", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    try { return await withCurrentUser(uid, (c) => itemAccountMap(c)); } catch (e) { return fail(reply, e); }
  });
  app.put("/api/v1/scentsx/item-accounts/category", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const b = accountMapSchema.extend({ category: z.string().trim().min(1).max(60) }).safeParse(req.body ?? {});
    if (!b.success) return reply.code(400).send({ error: "invalid_body" });
    try { return await withCurrentUser(uid, (c) => setCategoryAccounts(c, uid, b.data.category, b.data)); } catch (e) { return fail(reply, e); }
  });
  app.put("/api/v1/scentsx/item-accounts/item/:id", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = z.string().uuid().safeParse((req.params as { id?: string }).id);
    const b = accountMapSchema.safeParse(req.body ?? {});
    if (!id.success || !b.success) return reply.code(400).send({ error: "invalid_body" });
    try { return await withCurrentUser(uid, (c) => setItemAccounts(c, uid, id.data, b.data)); } catch (e) { return fail(reply, e); }
  });
  app.get("/api/v1/scentsx/item-accounts/item/:id", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = z.string().uuid().safeParse((req.params as { id?: string }).id); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    try { return await withCurrentUser(uid, (c) => itemPostingAccounts(c, id.data)); } catch (e) { return fail(reply, e); }
  });

  app.get("/api/v1/scentsx/company", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    try { return await withCurrentUser(uid, async (c) => ({ company: await scentsxSummary(c) })); } catch (e) { return fail(reply, e); }
  });

  app.get("/api/v1/scentsx/accounts", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    try { return await withCurrentUser(uid, async (c) => ({ accounts: await scentsxChart(c) })); } catch (e) { return fail(reply, e); }
  });

  app.get("/api/v1/scentsx/accounts/:id/register", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = uuid.safeParse((req.params as { id?: string }).id);
    if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    try { return await withCurrentUser(uid, async (c) => ({ lines: await scentsxAccountRegister(c, id.data) })); } catch (e) { return fail(reply, e); }
  });
  app.get("/api/v1/scentsx/sales-orders/:id/billing", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = uuid.safeParse((req.params as { id?: string }).id);
    if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    try {
      return await withCurrentUser(uid, async (c) => {
        const lines = await billableLines(c, id.data);
        const invoices = await listDocumentLinks(c, { sales_order_id: id.data });
        const so = await c.query<{ company_id: string | null }>(`SELECT company_id::text FROM perfume.sales_orders WHERE id = $1::uuid`, [id.data]);
        const contact = so.rows[0]?.company_id ?? null;
        const link = contact ? await c.query<{ customer_id: string }>(`SELECT customer_id::text FROM scentsx.customer_links WHERE contact_company_id = $1::uuid AND voided_at IS NULL LIMIT 1`, [contact]) : null;
        const customerId = link?.rows[0]?.customer_id ?? null;
        const proofs = await c.query(
          `SELECT id::text, proof_kind, document_number, crossed_on::text, port, file_id::text, created_at FROM scentsx.export_proofs
            WHERE sales_order_id = $1::uuid AND voided_at IS NULL ORDER BY created_at`, [id.data]
        );
        return {
          lines, invoices, export_proofs: proofs.rows, export_proof_on_file: await hasExportProof(c, id.data),
          resale_certificate_on_file: contact ? await hasResaleCertificate(c, contact) : false,
          sanctions: customerId ? await partyStatus(c, { kind: "customer", id: customerId }) : null,
        };
      });
    } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/scentsx/sales-orders/:id/invoice", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = uuid.safeParse((req.params as { id?: string }).id);
    const b = z.object({ channel: z.enum(["wholesale", "retail", "export"]).default("wholesale") }).safeParse(req.body ?? {});
    if (!id.success || !b.success) return reply.code(400).send({ error: "invalid_body" });
    try { return await withCurrentUser(uid, async (c) => ({ invoice: await invoiceSalesOrder(c, uid, id.data, b.data.channel) })); } catch (e) { return fail(reply, e); }
  });
  app.get("/api/v1/scentsx/customers/:companyId/compliance", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = uuid.safeParse((req.params as { companyId?: string }).companyId);
    if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    try {
      return await withCurrentUser(uid, async (c) => {
        await scopeToScentsx(c);
        const link = await c.query<{ customer_id: string }>(`SELECT customer_id::text FROM scentsx.customer_links WHERE contact_company_id = $1::uuid AND voided_at IS NULL LIMIT 1`, [id.data]);
        const customerId = link.rows[0]?.customer_id ?? null;
        return {
          customer_id: customerId,
          resale_certificate_on_file: await hasResaleCertificate(c, id.data),
          sanctions: customerId ? await partyStatus(c, { kind: "customer", id: customerId }) : await partyStatus(c, { kind: "contact_company", id: id.data }),
        };
      });
    } catch (e) { return fail(reply, e); }
  });
  app.get("/api/v1/scentsx/customers/:companyId/credit", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = uuid.safeParse((req.params as { companyId?: string }).companyId);
    if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    try { return await withCurrentUser(uid, async (c) => ({ credit: await creditExposure(c, id.data) })); } catch (e) { return fail(reply, e); }
  });
  app.get("/api/v1/scentsx/inventory/tie-out", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const asOf = (req.query as { as_of?: string }).as_of;
    try { return await withCurrentUser(uid, async (c) => ({ tie_out: await inventoryTieOut(c, asOf) })); } catch (e) { return fail(reply, e); }
  });
  app.get("/api/v1/scentsx/reports/sales", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const q = req.query as { by?: string; from?: string; to?: string };
    const by = q.by === "item" ? "item" : q.by === "customer" ? "customer" : null;
    if (!by || !q.from || !q.to) return reply.code(400).send({ error: "invalid_query", message: "by=customer|item, from and to (YYYY-MM-DD) are required" });
    try { return await withCurrentUser(uid, async (c) => ({ report: await salesReport(c, by, q.from!, q.to!) })); } catch (e) { return fail(reply, e); }
  });
  app.get("/api/v1/scentsx/stock-moves/pending", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    try { return await withCurrentUser(uid, async (c) => ({ pending: (await pendingStockMoves(c)).count })); } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/scentsx/stock-moves/post-pending", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    try { return await withCurrentUser(uid, async (c) => ({ result: await postPendingStockMoves(c, { userId: uid, role: "Owner" }) })); } catch (e) { return fail(reply, e); }
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
      try {
        return await withCurrentUser(uid, async (c) => {
          const link = await createLink(c, uid, kind, b.data.desk_id, b.data.engine_id);
          // OFAC: a new ScentsX customer / vendor is screened the moment it is linked, once a list is loaded (design §8).
          const listed = await c.query(`SELECT 1 FROM scentsx.sanctions_list_loads LIMIT 1`);
          const screening = listed.rowCount ? await screenParty(c, uid, { kind, id: b.data.engine_id }) : null;
          return { link, screening };
        });
      } catch (e) { return fail(reply, e); }
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

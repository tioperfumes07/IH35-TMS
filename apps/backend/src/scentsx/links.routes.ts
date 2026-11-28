/**
 * SCENTSX B3a routes — ScentsX LLC's company summary and the perfume <-> engine links (customers, vendors,
 * documents). Owner 2026-11-26 20:13 / 20:16 CT; design https://claude.ai/artifact/VQ83ogvJyPpVoop1FNKJXC.
 * Same gate as the TIO Perfumes desk: Owner role AND perfume.desk_users. Links are voided, never deleted.
 */
import { itemBooks, itemBooksQuery, makeItemsSchema, makeScentsxItems, repairMergedItemLinks, syncScentsxItemAccounts } from "./item-links.service.js";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { pendingStockMoves, postPendingStockMoves } from "./stock-move-poster.service.js";
import { billableLines, invoiceSalesOrder } from "./sales-invoice.service.js";
import { creditExposure } from "./credit-exposure.service.js";
import { salesReport } from "./sales-report.service.js";
import { agingQuery, agingReport, customerAccount } from "./receivables.service.js";
import { createReturn, listReturns, returnableLines, returnSchema } from "./returns.service.js";
import { billablePoLines, billPurchaseOrder, creditVendorReturn, purchaseBillSchema, purchaseOrderBills, vendorReturnCreditSchema } from "./purchase-bill.service.js";
import { payablesAging, payablesQuery, ScentsxVendorNotOnBooks, vendorAccount } from "./payables.service.js";
import { inventoryTieOut } from "./inventory-tieout.service.js";
import { accountMapSchema, itemAccountMap, itemPostingAccounts, setCategoryAccounts, setItemAccounts } from "./item-accounts.service.js";
import { hasExportProof, hasResaleCertificate, partyStatus, screenParty } from "./sanctions.service.js";
import { withCurrentUser } from "../auth/db.js";
import { deskAllowed } from "../perfume/desk.routes.js";
import { generalLedger, glQuery } from "./general-ledger.service.js";
import { salesTaxLiability, salesTaxQuery, ScentsxSalesTaxNotMapped } from "./sales-tax.service.js";
import {
  createLink, eligibleForScentsxCustomer, listDocumentLinks, scopeToScentsx, listLinks, scentsxAccountRegister, scentsxChart, scentsxSummary, ScentsxLinkInvalid, ScentsxLinkNotFound, ScentsxNotSetUp, voidLink, type LinkKind,
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
  if (e instanceof ScentsxVendorNotOnBooks) return reply.code(409).send({ error: "vendor_not_on_books", message: e.message, supplier_name: e.supplierName });
  throw e;
}

export async function registerScentsxLinkRoutes(app: FastifyInstance) {
  // Receivables — CONTROL's Aging Balance Report / Customer Account Status / Invoice History (owner 2026-11-27 13:50 CT). Read only;
  // payments are recorded and voided through the existing /api/v1/accounting/payments engine.
  app.get("/api/v1/scentsx/receivables/aging", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const q = agingQuery.safeParse(req.query ?? {}); if (!q.success) return reply.code(400).send({ error: "invalid_query", message: q.error.issues[0]?.message ?? "Bad aging query" });
    try { return await withCurrentUser(uid, (c) => agingReport(c, q.data)); } catch (e) { return fail(reply, e); }
  });
  // Sales returns — CONTROL Returns (migration 202617080100): credit memo(s) through the one credit-memo writer + restock at shipped cost.
  app.get("/api/v1/scentsx/returns", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    try { return await withCurrentUser(uid, async (c) => ({ returns: await listReturns(c) })); } catch (e) { return fail(reply, e); }
  });
  app.get("/api/v1/scentsx/invoices/:id/returnable", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = z.string().uuid().safeParse((req.params as { id?: string }).id); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    try { return await withCurrentUser(uid, (c) => returnableLines(c, id.data)); } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/scentsx/returns", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const b = returnSchema.safeParse(req.body ?? {}); if (!b.success) return reply.code(400).send({ error: "invalid", message: b.error.issues[0]?.message ?? "Bad return" });
    try { return reply.code(201).send(await withCurrentUser(uid, (c) => createReturn(c, uid, b.data))); } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/scentsx/purchase-orders/:id/vendor-credit", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = z.string().uuid().safeParse((req.params as { id?: string }).id); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    const b = vendorReturnCreditSchema.safeParse(req.body ?? {}); if (!b.success) return reply.code(400).send({ error: "invalid", message: b.error.issues[0]?.message ?? "Bad credit" });
    try { return reply.code(201).send(await withCurrentUser(uid, (c) => creditVendorReturn(c, uid, id.data, b.data))); } catch (e) { return fail(reply, e); }
  });
  // Payables — A/P aging by vendor + vendor account (read only; bills are paid / voided through /api/v1/accounting/bills/:id/pay | void).
  app.get("/api/v1/scentsx/payables/aging", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const q = payablesQuery.safeParse(req.query ?? {}); if (!q.success) return reply.code(400).send({ error: "invalid_query" });
    try { return await withCurrentUser(uid, (c) => payablesAging(c, q.data)); } catch (e) { return fail(reply, e); }
  });
  app.get("/api/v1/scentsx/payables/vendors/:id", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = z.string().uuid().safeParse((req.params as { id?: string }).id); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    const q = payablesQuery.safeParse(req.query ?? {}); if (!q.success) return reply.code(400).send({ error: "invalid_query" });
    try { return await withCurrentUser(uid, (c) => vendorAccount(c, id.data, q.data)); } catch (e) { return fail(reply, e); }
  });
  // Purchase bills (migration 202617120100): a received perfume PO billed through the one bill writer + poster (GRNI -> A/P).
  app.get("/api/v1/scentsx/purchase-orders/:id/billable", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = z.string().uuid().safeParse((req.params as { id?: string }).id); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    try { return await withCurrentUser(uid, async (c) => ({ lines: await billablePoLines(c, id.data), bills: await purchaseOrderBills(c, id.data) })); } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/scentsx/purchase-orders/:id/bill", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = z.string().uuid().safeParse((req.params as { id?: string }).id); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    const b = purchaseBillSchema.safeParse(req.body ?? {}); if (!b.success) return reply.code(400).send({ error: "invalid", message: b.error.issues[0]?.message ?? "Bad bill" });
    try { return reply.code(201).send(await withCurrentUser(uid, (c) => billPurchaseOrder(c, uid, id.data, b.data))); } catch (e) { return fail(reply, e); }
  });
  app.get("/api/v1/scentsx/receivables/customers/:id", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = z.string().uuid().safeParse((req.params as { id?: string }).id); if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    const q = agingQuery.safeParse(req.query ?? {}); if (!q.success) return reply.code(400).send({ error: "invalid_query", message: q.error.issues[0]?.message ?? "Bad aging query" });
    try { return await withCurrentUser(uid, (c) => customerAccount(c, id.data, q.data)); } catch (e) { return fail(reply, e); }
  });
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
  // M21 Items → books: each item's accounts + its ScentsX product (catalogs.items), and the bulk "Make ScentsX item".
  app.get("/api/v1/scentsx/item-books", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const q = itemBooksQuery.safeParse(req.query ?? {}); if (!q.success) return reply.code(400).send({ error: "invalid_query" });
    try { return await withCurrentUser(uid, (c) => itemBooks(c, q.data)); } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/scentsx/item-books/make-items", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const b = makeItemsSchema.safeParse(req.body ?? {}); if (!b.success) return reply.code(400).send({ error: "invalid_body" });
    try { return await withCurrentUser(uid, (c) => makeScentsxItems(c, uid, b.data)); } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/scentsx/item-books/sync-accounts", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const b = z.object({ max: z.number().int().min(1).max(500).default(500) }).safeParse(req.body ?? {}); if (!b.success) return reply.code(400).send({ error: "invalid_body" });
    try { return await withCurrentUser(uid, (c) => syncScentsxItemAccounts(c, uid, b.data.max)); } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/scentsx/item-books/repair-merged", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    try { return await withCurrentUser(uid, (c) => repairMergedItemLinks(c, uid)); } catch (e) { return fail(reply, e); }
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

  // ROUND L.31 M11 — sales tax liability for a period (read only; scentsx/sales-tax.service.ts).
  app.get("/api/v1/scentsx/sales-tax/liability", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const q = salesTaxQuery.safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "invalid", issues: q.error.issues });
    try { return await withCurrentUser(uid, (c) => salesTaxLiability(c, q.data)); } catch (e) {
      if (e instanceof ScentsxSalesTaxNotMapped) return reply.code(409).send({ error: "sales_tax_account_not_mapped", message: e.message });
      return fail(reply, e);
    }
  });
  // ROUND L.31 M16 remainder — the General Ledger (read only over posted lines; scentsx/general-ledger.service.ts).
  app.get("/api/v1/scentsx/general-ledger", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const q = glQuery.safeParse(req.query ?? {});
    if (!q.success) return reply.code(400).send({ error: "invalid", issues: q.error.issues });
    try { return await withCurrentUser(uid, (c) => generalLedger(c, q.data)); } catch (e) { return fail(reply, e); }
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

  // E2: contacts eligible for bulk "Make ScentsX customer" (have email, not yet linked).
  app.get("/api/v1/scentsx/customer-links/eligible", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const limit = Math.min(Number((req.query as { limit?: string }).limit ?? 500), 500);
    try { return await withCurrentUser(uid, (c) => eligibleForScentsxCustomer(c, limit)); } catch (e) { return fail(reply, e); }
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

// ROUND 315 (FINAL) step 2 — factoring purchase document routes. Every write is OWNER-ONLY (ROUND 315 law): the owner
// gate runs in its own committed scope first (a refusal is 403 + a committed audit row), then the action runs.
//   GET  /api/v1/factoring/purchases            list (+ reverse drill: ?invoice_id= &load_id= &customer_id= &settlement_id= &bank_transaction_id=)
//   GET  /api/v1/factoring/purchases/:id        detail: header + lines + every link (invoice, customer, load, settlement, advance, JE, bank line)
//   POST /api/v1/factoring/purchases            create a draft (one per Faro wire; lines = invoices)
//   POST /api/v1/factoring/purchases/:id/post   post through the existing secured-borrowing funding poster
//   POST /api/v1/factoring/purchases/:id/void   reverse through the canonical reversal; invoices return to not_factored
// ROUND 315 step 3 — the Submit to Factor tab:
//   GET  /api/v1/factoring/purchases/candidates                         every open invoice + expected split + docs
//   GET  /api/v1/factoring/purchases/candidates/direct-pay              invoices marked Customer direct pay
//   POST /api/v1/factoring/purchases/candidates/:invoiceId/direct-pay   mark Customer direct pay (Owner-only)
//   POST /api/v1/factoring/purchases/candidates/:invoiceId/undo-direct-pay
//   POST /api/v1/factoring/purchases/:id/send   "Save and send": email the invoices + their load docs to the factor
// The create route runs the FEED GATE (kind 'invoice') on every invoice first; a red invoice cannot enter a purchase.
// The bank match is the canonical bank-recon accept (kind factoring_advance = this purchase's advance), already Owner-only.
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { currentAuthUser, validationError, withCompanyScope } from "../accounting/shared.js";
import { syncLoadsForFactoringAdvance } from "../dispatch/load-billing-lifecycle.service.js";
import {
  listDirectPayInvoices,
  listPurchaseCandidates,
  markInvoiceDirectPay,
  PurchaseCandidateError,
  runPurchaseFeedGate,
  undoInvoiceDirectPay,
} from "./purchase-candidates.service.js";
import { sendPurchaseToFactor } from "./purchase-send.service.js";
import { requireFactoringPurchaseOwner, type FactoringPurchaseAction } from "./owner-only-purchase.js";
import {
  createPurchaseDraft,
  FactoringPurchaseError,
  getPurchaseDetail,
  listPurchases,
  postPurchase,
  voidPurchase,
} from "./purchase.service.js";

const companyQuery = z.object({ operating_company_id: z.string().uuid() });
const idParams = z.object({ id: z.string().uuid() });
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const cents = z.number().int().nonnegative();
const listQuery = companyQuery.extend({
  status: z.enum(["draft", "posted", "voided"]).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  invoice_id: z.string().uuid().optional(),
  load_id: z.string().uuid().optional(),
  customer_id: z.string().uuid().optional(),
  settlement_id: z.string().uuid().optional(),
  bank_transaction_id: z.string().uuid().optional(),
});
const createBody = z.object({
  factoring_company_vendor_id: z.string().uuid(),
  purchase_date: isoDate,
  wire_date: isoDate.nullable().optional(),
  faro_report_ref: z.string().trim().max(80).nullable().optional(),
  wire_fee_cents: cents.optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  lines: z
    .array(
      z.object({
        invoice_id: z.string().uuid(),
        gross_cents: cents.optional(),
        escrow_reserve_cents: cents.optional(),
        cash_reserve_cents: cents.optional(),
        fee_cents: cents.optional(),
      })
    )
    .min(1)
    .max(200),
});
const voidBody = z.object({ reason: z.string().trim().min(3).max(500) });
const candidatesQuery = companyQuery.extend({
  from: isoDate.optional(),
  to: isoDate.optional(),
  customer_id: z.string().uuid().optional(),
  search: z.string().trim().max(120).optional(),
});
const invoiceParams = z.object({ invoiceId: z.string().uuid() });
const directPayBody = z.object({ reason: z.string().trim().min(3).max(500) });
const sendBody = z.object({ to_email: z.string().trim().email().max(320).optional() });

type Reply = { code: (n: number) => { send: (b: unknown) => unknown } };

function sendPurchaseError(reply: Reply, error: unknown) {
  if (!(error instanceof FactoringPurchaseError) && !(error instanceof PurchaseCandidateError)) return false;
  reply.code(error.statusCode).send({ error: error.code, ...(error.details ? { details: error.details } : {}) });
  return true;
}

async function ownerGate(
  reply: Parameters<typeof requireFactoringPurchaseOwner>[0],
  user: { uuid: string; role?: string | null },
  operatingCompanyId: string,
  action: FactoringPurchaseAction,
  targetId: string | null
) {
  return withCompanyScope(user.uuid, operatingCompanyId, (client) =>
    requireFactoringPurchaseOwner(reply, client, {
      operatingCompanyId,
      userUuid: user.uuid,
      role: String(user.role ?? ""),
      action,
      targetId,
    })
  );
}

export async function registerFactoringPurchaseRoutes(app: FastifyInstance) {
  app.get("/api/v1/factoring/purchases", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const q = listQuery.safeParse(req.query ?? {});
    if (!q.success) return validationError(reply, q.error);
    const { operating_company_id, ...filters } = q.data;
    const rows = await withCompanyScope(user.uuid, operating_company_id, (client) => listPurchases(client, operating_company_id, filters));
    return { purchases: rows };
  });

  app.get("/api/v1/factoring/purchases/candidates", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const q = candidatesQuery.safeParse(req.query ?? {});
    if (!q.success) return validationError(reply, q.error);
    const { operating_company_id, ...filters } = q.data;
    return withCompanyScope(user.uuid, operating_company_id, (client) => listPurchaseCandidates(client, operating_company_id, filters));
  });

  app.get("/api/v1/factoring/purchases/candidates/direct-pay", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const q = companyQuery.safeParse(req.query ?? {});
    if (!q.success) return validationError(reply, q.error);
    const rows = await withCompanyScope(user.uuid, q.data.operating_company_id, (client) => listDirectPayInvoices(client, q.data.operating_company_id));
    return { invoices: rows };
  });

  for (const [suffix, fn] of [["direct-pay", markInvoiceDirectPay], ["undo-direct-pay", undoInvoiceDirectPay]] as const) {
    app.post(`/api/v1/factoring/purchases/candidates/:invoiceId/${suffix}`, { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;
      const p = invoiceParams.safeParse(req.params ?? {});
      if (!p.success) return validationError(reply, p.error);
      const q = companyQuery.safeParse(req.query ?? {});
      if (!q.success) return validationError(reply, q.error);
      const b = directPayBody.safeParse(req.body ?? {});
      if (!b.success) return validationError(reply, b.error);
      if (!(await ownerGate(reply, user, q.data.operating_company_id, "create", p.data.invoiceId))) return;
      try {
        return await withCompanyScope(user.uuid, q.data.operating_company_id, (client) =>
          fn(client, { operatingCompanyId: q.data.operating_company_id, actorUserId: user.uuid, invoiceId: p.data.invoiceId, reason: b.data.reason })
        );
      } catch (error) {
        if (sendPurchaseError(reply, error)) return;
        throw error;
      }
    });
  }

  app.post("/api/v1/factoring/purchases/:id/send", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const p = idParams.safeParse(req.params ?? {});
    if (!p.success) return validationError(reply, p.error);
    const q = companyQuery.safeParse(req.query ?? {});
    if (!q.success) return validationError(reply, q.error);
    const b = sendBody.safeParse(req.body ?? {});
    if (!b.success) return validationError(reply, b.error);
    // Submitting a purchase report to the factor is the Owner's act (ROUND 315 OWNER-ONLY LAW).
    if (!(await ownerGate(reply, user, q.data.operating_company_id, "create", p.data.id))) return;
    try {
      return await sendPurchaseToFactor(app, req, {
        operatingCompanyId: q.data.operating_company_id,
        actorUserId: user.uuid,
        purchaseId: p.data.id,
        toEmail: b.data.to_email ?? null,
      });
    } catch (error) {
      if (sendPurchaseError(reply, error)) return;
      throw error;
    }
  });

  app.get("/api/v1/factoring/purchases/:id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const p = idParams.safeParse(req.params ?? {});
    if (!p.success) return validationError(reply, p.error);
    const q = companyQuery.safeParse(req.query ?? {});
    if (!q.success) return validationError(reply, q.error);
    try {
      return await withCompanyScope(user.uuid, q.data.operating_company_id, (client) => getPurchaseDetail(client, q.data.operating_company_id, p.data.id));
    } catch (error) {
      if (sendPurchaseError(reply, error)) return;
      throw error;
    }
  });

  app.post("/api/v1/factoring/purchases", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const q = companyQuery.safeParse(req.query ?? {});
    if (!q.success) return validationError(reply, q.error);
    const b = createBody.safeParse(req.body ?? {});
    if (!b.success) return validationError(reply, b.error);
    if (!(await ownerGate(reply, user, q.data.operating_company_id, "create", null))) return;
    // FEED GATE first, in its own committed scope (the intake/check rows are WORM evidence even when red).
    const gate = await withCompanyScope(user.uuid, q.data.operating_company_id, (client) =>
      runPurchaseFeedGate(client, q.data.operating_company_id, b.data.lines.map((l) => l.invoice_id), user.uuid)
    );
    const red = gate.filter((g) => !g.passed);
    if (red.length) return reply.code(409).send({ error: "feed_gate_blocked", details: red });
    try {
      const detail = await withCompanyScope(user.uuid, q.data.operating_company_id, (client) =>
        createPurchaseDraft(client, {
          operatingCompanyId: q.data.operating_company_id,
          actorUserId: user.uuid,
          factoringCompanyVendorId: b.data.factoring_company_vendor_id,
          purchaseDate: b.data.purchase_date,
          wireDate: b.data.wire_date ?? null,
          faroReportRef: b.data.faro_report_ref ?? null,
          wireFeeCents: b.data.wire_fee_cents,
          notes: b.data.notes ?? null,
          lines: b.data.lines,
        })
      );
      return reply.code(201).send(detail);
    } catch (error) {
      if (sendPurchaseError(reply, error)) return;
      throw error;
    }
  });

  app.post("/api/v1/factoring/purchases/:id/post", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const p = idParams.safeParse(req.params ?? {});
    if (!p.success) return validationError(reply, p.error);
    const q = companyQuery.safeParse(req.query ?? {});
    if (!q.success) return validationError(reply, q.error);
    if (!(await ownerGate(reply, user, q.data.operating_company_id, "advance", p.data.id))) return;
    try {
      const result = await withCompanyScope(user.uuid, q.data.operating_company_id, (client) =>
        postPurchase(client, { operatingCompanyId: q.data.operating_company_id, actorUserId: user.uuid, purchaseId: p.data.id })
      );
      // Post-commit, own connection (ACCT-F5651): move the delivered loads behind the funded invoices forward.
      await syncLoadsForFactoringAdvance({
        operatingCompanyId: q.data.operating_company_id,
        factoringAdvanceId: result.factoringAdvanceId,
        actorUserId: user.uuid,
      });
      return result.detail;
    } catch (error) {
      if (sendPurchaseError(reply, error)) return;
      throw error;
    }
  });

  app.post("/api/v1/factoring/purchases/:id/void", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const p = idParams.safeParse(req.params ?? {});
    if (!p.success) return validationError(reply, p.error);
    const q = companyQuery.safeParse(req.query ?? {});
    if (!q.success) return validationError(reply, q.error);
    const b = voidBody.safeParse(req.body ?? {});
    if (!b.success) return validationError(reply, b.error);
    if (!(await ownerGate(reply, user, q.data.operating_company_id, "release", p.data.id))) return;
    try {
      return await withCompanyScope(user.uuid, q.data.operating_company_id, (client) =>
        voidPurchase(client, { operatingCompanyId: q.data.operating_company_id, actorUserId: user.uuid, purchaseId: p.data.id, reason: b.data.reason })
      );
    } catch (error) {
      if (sendPurchaseError(reply, error)) return;
      throw error;
    }
  });
}

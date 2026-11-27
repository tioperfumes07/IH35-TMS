/**
 * SCENTSX B9 routes — cash log, Form 8300 cases, structuring alerts (cash-compliance.service.ts). Same gate as the TIO
 * Perfumes desk and the ScentsX books: Owner role AND perfume.desk_users.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";
import { deskAllowed } from "../perfume/desk.routes.js";
import { ScentsxLinkInvalid, ScentsxLinkNotFound, ScentsxNotSetUp } from "./links.service.js";
import {
  CashComplianceBlocked, complianceDesk, createPayer, markCaseFiled, markStatementSent, openVoluntaryCase, recordCashReceipt,
  reviewStructuringAlert, updatePayer, voidCashReceipt,
} from "./cash-compliance.service.js";
import {
  addExportProof, addResaleCertificate, clearScreening, confirmMatch, loadSanctionsList, rescreenAll, sanctionsDesk, screenParty, voidTaxDocument,
} from "./sanctions.service.js";
import { addPagare, addTaxForm, closePagare, kycDesk, markKycReviewed, partyKyc, saveKyc, voidTaxForm, type KycParty } from "./kyc.service.js";

async function ownerOnly(req: FastifyRequest, reply: FastifyReply): Promise<string | null> {
  if (!requireAuth(req, reply)) return null;
  if (String(req.user?.role ?? "") !== "Owner") { void reply.code(403).send({ error: "owner_only" }); return null; }
  const uid = req.user!.uuid;
  if (!(await deskAllowed(uid))) { void reply.code(403).send({ error: "perfume_desk_not_granted" }); return null; }
  return uid;
}

function fail(reply: FastifyReply, e: unknown) {
  if (e instanceof CashComplianceBlocked) return reply.code(409).send({ error: "form_8300_identity_required", message: e.message, missing: e.missing });
  if (e instanceof ScentsxNotSetUp) return reply.code(409).send({ error: "scentsx_not_set_up", message: e.message });
  if (e instanceof ScentsxLinkInvalid) return reply.code(400).send({ error: "invalid", message: e.message });
  if (e instanceof ScentsxLinkNotFound) return reply.code(404).send({ error: "not_found" });
  const pgCode = (e as { code?: string })?.code;
  if (pgCode === "23514" || pgCode === "23503") return reply.code(400).send({ error: "invalid", message: (e as Error).message });
  throw e;
}

const RL_READ = { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } } as const;
const RL_WRITE = { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } } as const;
const uuid = z.string().uuid();
const opt = z.string().trim().min(1).max(200).nullish();
const payerShape = z.object({
  payer_kind: z.enum(["individual", "business"]),
  legal_name: z.string().trim().min(1).max(200),
  contact_company_id: uuid.nullish(), customer_id: uuid.nullish(),
  address_line: opt, city: opt, state_region: opt, postal_code: z.string().trim().max(20).nullish(), country: opt,
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(), occupation: opt,
  tin_kind: z.enum(["ssn", "itin", "ein", "foreign_none"]).nullish(), tin_last4: z.string().regex(/^\d{4}$/).nullish(),
  id_type: z.enum(["drivers_license", "passport", "alien_registration", "ine_mexico", "other_government"]).nullish(), id_issuer: opt,
  id_number_last4: z.string().regex(/^[A-Za-z0-9]{4}$/).nullish(), id_copy_file_id: uuid.nullish(),
});
const receiptShape = z.object({
  payer_id: uuid, received_at: z.string().datetime({ offset: true }),
  payment_form: z.enum(["currency_usd", "currency_foreign", "cashiers_check", "money_order", "bank_draft", "travelers_check", "personal_check", "wire", "card"]),
  amount_cents: z.number().int().positive().max(100_000_000_00),
  payment_id: uuid.nullish(), invoice_id: uuid.nullish(), sales_order_id: uuid.nullish(),
  foreign_currency_code: z.string().regex(/^[A-Z]{3}$/).nullish(), instrument_issuer: opt, instrument_serial: opt,
  consumer_durable_retail: z.boolean().optional(), known_avoidance: z.boolean().optional(), related_receipt_id: uuid.nullish(),
  notes: z.string().max(2000).nullish(),
});

export async function registerScentsxComplianceRoutes(app: FastifyInstance) {
  app.get("/api/v1/scentsx/compliance", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    try { return await withCurrentUser(uid, async (c) => await complianceDesk(c)); } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/scentsx/compliance/payers", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const b = payerShape.safeParse(req.body ?? {});
    if (!b.success) return reply.code(400).send({ error: "invalid_body", issues: b.error.issues });
    try {
      return await withCurrentUser(uid, async (c) => {
        const payer = await createPayer(c, uid, b.data);
        // Screened against the OFAC list the moment it exists (design §8). No list loaded yet → the desk shows "never screened".
        const listed = await c.query(`SELECT 1 FROM scentsx.sanctions_list_loads LIMIT 1`);
        const screening = listed.rowCount ? await screenParty(c, uid, { kind: "cash_payer", id: payer.id }) : null;
        return { payer, screening };
      });
    } catch (e) { return fail(reply, e); }
  });
  app.patch("/api/v1/scentsx/compliance/payers/:id", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = uuid.safeParse((req.params as { id?: string }).id);
    const b = payerShape.partial().safeParse(req.body ?? {});
    if (!id.success || !b.success) return reply.code(400).send({ error: "invalid_body" });
    try { return await withCurrentUser(uid, async (c) => ({ payer: await updatePayer(c, uid, id.data, b.data) })); } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/scentsx/compliance/receipts", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const b = receiptShape.safeParse(req.body ?? {});
    if (!b.success) return reply.code(400).send({ error: "invalid_body", issues: b.error.issues });
    try { return await withCurrentUser(uid, async (c) => ({ receipt: await recordCashReceipt(c, uid, b.data) })); } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/scentsx/compliance/receipts/:id/void", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = uuid.safeParse((req.params as { id?: string }).id);
    const b = z.object({ reason: z.string().trim().min(3).max(500) }).safeParse(req.body ?? {});
    if (!id.success || !b.success) return reply.code(400).send({ error: "invalid_body" });
    try { return await withCurrentUser(uid, async (c) => await voidCashReceipt(c, uid, id.data, b.data.reason)); } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/scentsx/compliance/receipts/:id/suspicious", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = uuid.safeParse((req.params as { id?: string }).id);
    const b = z.object({ reason: z.string().trim().min(3).max(1000) }).safeParse(req.body ?? {});
    if (!id.success || !b.success) return reply.code(400).send({ error: "invalid_body" });
    try { return await withCurrentUser(uid, async (c) => ({ case: await openVoluntaryCase(c, uid, id.data, b.data.reason) })); } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/scentsx/compliance/cases/:id/filed", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = uuid.safeParse((req.params as { id?: string }).id);
    const b = z.object({ bsa_confirmation: z.string().trim().min(3).max(100), filed_copy_file_id: uuid.nullish() }).safeParse(req.body ?? {});
    if (!id.success || !b.success) return reply.code(400).send({ error: "invalid_body" });
    try { return await withCurrentUser(uid, async (c) => await markCaseFiled(c, uid, id.data, b.data.bsa_confirmation, b.data.filed_copy_file_id ?? null)); } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/scentsx/compliance/cases/:id/statement-sent", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = uuid.safeParse((req.params as { id?: string }).id);
    const b = z.object({ sent_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).safeParse(req.body ?? {});
    if (!id.success || !b.success) return reply.code(400).send({ error: "invalid_body" });
    try { return await withCurrentUser(uid, async (c) => await markStatementSent(c, id.data, b.data.sent_on)); } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/scentsx/compliance/alerts/:id/review", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = uuid.safeParse((req.params as { id?: string }).id);
    const b = z.object({ note: z.string().trim().min(3).max(1000) }).safeParse(req.body ?? {});
    if (!id.success || !b.success) return reply.code(400).send({ error: "invalid_body" });
    try { return await withCurrentUser(uid, async (c) => await reviewStructuringAlert(c, uid, id.data, b.data.note)); } catch (e) { return fail(reply, e); }
  });

  // ---- B9b: OFAC list + screening, resale certificates, export proof ----
  app.get("/api/v1/scentsx/compliance/sanctions", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    try { return await withCurrentUser(uid, async (c) => await sanctionsDesk(c)); } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/scentsx/compliance/sanctions/load", { config: { rateLimit: { max: 4, timeWindow: "1 hour" } } }, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    try {
      return await withCurrentUser(uid, async (c) => {
        const load = await loadSanctionsList(c, uid);
        const rescreen = await rescreenAll(c, uid);
        return { load, rescreen };
      });
    } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/scentsx/compliance/sanctions/screen", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const b = z.object({ kind: z.enum(["contact_company", "customer", "vendor", "cash_payer"]), id: uuid }).safeParse(req.body ?? {});
    if (!b.success) return reply.code(400).send({ error: "invalid_body" });
    try { return await withCurrentUser(uid, async (c) => ({ screening: await screenParty(c, uid, b.data) })); } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/scentsx/compliance/sanctions/:id/clear", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = uuid.safeParse((req.params as { id?: string }).id);
    const b = z.object({ reason: z.string().trim().min(10).max(1000) }).safeParse(req.body ?? {});
    if (!id.success || !b.success) return reply.code(400).send({ error: "invalid_body" });
    try { return await withCurrentUser(uid, async (c) => await clearScreening(c, uid, id.data, b.data.reason)); } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/scentsx/compliance/sanctions/:id/confirm", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = uuid.safeParse((req.params as { id?: string }).id);
    if (!id.success) return reply.code(400).send({ error: "invalid_id" });
    try { return await withCurrentUser(uid, async (c) => await confirmMatch(c, uid, id.data)); } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/scentsx/compliance/resale-certificates", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const b = z.object({
      contact_company_id: uuid, customer_id: uuid.nullish(), form_code: z.enum(["01-339", "out_of_state", "mexico_export_buyer"]).optional(),
      purchaser_tax_number: z.string().trim().max(40).nullish(), signed_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), file_id: uuid, notes: z.string().max(2000).nullish(),
    }).safeParse(req.body ?? {});
    if (!b.success) return reply.code(400).send({ error: "invalid_body", issues: b.error.issues });
    try { return await withCurrentUser(uid, async (c) => ({ certificate: await addResaleCertificate(c, uid, b.data) })); } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/scentsx/compliance/export-proofs", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const b = z.object({
      sales_order_id: uuid, invoice_id: uuid.nullish(), proof_kind: z.enum(["broker_export_certification", "foreign_import_papers", "bill_of_lading_outside_us"]),
      document_number: z.string().trim().max(80).nullish(), crossed_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(), port: z.string().trim().max(80).nullish(),
      file_id: uuid, notes: z.string().max(2000).nullish(),
    }).safeParse(req.body ?? {});
    if (!b.success) return reply.code(400).send({ error: "invalid_body", issues: b.error.issues });
    try { return await withCurrentUser(uid, async (c) => ({ proof: await addExportProof(c, uid, b.data) })); } catch (e) { return fail(reply, e); }
  });
  const voidTaxDoc = (kind: "resale_certificates" | "export_proofs") => async (req: FastifyRequest, reply: FastifyReply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = uuid.safeParse((req.params as { id?: string }).id);
    const b = z.object({ reason: z.string().trim().min(3).max(500) }).safeParse(req.body ?? {});
    if (!id.success || !b.success) return reply.code(400).send({ error: "invalid_body" });
    try { return await withCurrentUser(uid, async (c) => await voidTaxDocument(c, uid, kind, id.data, b.data.reason)); } catch (e) { return fail(reply, e); }
  };
  app.post("/api/v1/scentsx/compliance/resale-certificates/:id/void", RL_WRITE, voidTaxDoc("resale_certificates"));
  app.post("/api/v1/scentsx/compliance/export-proofs/:id/void", RL_WRITE, voidTaxDoc("export_proofs"));

  // ── B12: KYC profile, tax forms (W-9 / W-8), pagarés ──
  const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
  const txt = (n: number) => z.string().trim().max(n).nullish();
  const kycShape = z.object({
    residency: z.enum(["us", "mexico", "other"]), entity_kind: z.enum(["individual", "business"]), legal_name: z.string().trim().min(1).max(200),
    dba_name: txt(200), ein: txt(12), ssn_itin_last4: txt(4), sales_tax_permit_state: txt(2), sales_tax_permit_number: txt(20),
    sales_tax_permit_file_id: uuid.nullish(), rfc: txt(13), curp: txt(18), regimen_fiscal: txt(120), constancia_fiscal_file_id: uuid.nullish(),
    ine_file_id: uuid.nullish(), passport_number: txt(20), passport_country: txt(2), passport_expires_on: date.nullish(), passport_file_id: uuid.nullish(),
    visa_kind: z.enum(["b1_b2", "border_crossing_card", "other"]).nullish(), visa_number: txt(20), visa_expires_on: date.nullish(), visa_file_id: uuid.nullish(),
    contact_person: txt(200), phone: txt(40), email: txt(200), address_line: txt(300), city: txt(120), state_region: txt(120), postal_code: txt(20),
    country: txt(2), proof_of_address_file_id: uuid.nullish(), notes: txt(2000),
  });
  const partyOf = (req: FastifyRequest): KycParty | null => {
    const { kind, partyId } = req.params as { kind?: string; partyId?: string };
    if (!uuid.safeParse(partyId).success) return null;
    if (kind === "customer") return { kind, contact_company_id: partyId! };
    if (kind === "vendor") return { kind, perfume_vendor_id: partyId! };
    return null;
  };
  app.get("/api/v1/scentsx/compliance/kyc", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    try { return await withCurrentUser(uid, async (c) => await kycDesk(c)); } catch (e) { return fail(reply, e); }
  });
  app.get("/api/v1/scentsx/compliance/kyc/:kind/:partyId", RL_READ, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const party = partyOf(req); if (!party) return reply.code(400).send({ error: "invalid_party" });
    try { return await withCurrentUser(uid, async (c) => await partyKyc(c, party)); } catch (e) { return fail(reply, e); }
  });
  app.put("/api/v1/scentsx/compliance/kyc/:kind/:partyId", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const party = partyOf(req); if (!party) return reply.code(400).send({ error: "invalid_party" });
    const b = kycShape.partial().safeParse(req.body ?? {});
    if (!b.success) return reply.code(400).send({ error: "invalid_body", issues: b.error.issues });
    try { return await withCurrentUser(uid, async (c) => await saveKyc(c, uid, party, b.data)); } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/scentsx/compliance/kyc/:kind/:partyId/reviewed", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const party = partyOf(req); if (!party) return reply.code(400).send({ error: "invalid_party" });
    try { return await withCurrentUser(uid, async (c) => await markKycReviewed(c, uid, party)); } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/scentsx/compliance/kyc/:kind/:partyId/tax-forms", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const party = partyOf(req); if (!party) return reply.code(400).send({ error: "invalid_party" });
    const b = z.object({
      form_kind: z.enum(["W-9", "W-8BEN", "W-8BEN-E", "W-8ECI"]), signed_on: date, expires_on: date.nullish(), file_id: uuid,
      foreign_tin: txt(40), treaty_country: txt(2), chapter3_status: txt(80), notes: txt(2000),
    }).safeParse(req.body ?? {});
    if (!b.success) return reply.code(400).send({ error: "invalid_body", issues: b.error.issues });
    try { return await withCurrentUser(uid, async (c) => await addTaxForm(c, uid, party, b.data)); } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/scentsx/compliance/tax-forms/:id/void", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = uuid.safeParse((req.params as { id?: string }).id);
    const b = z.object({ reason: z.string().trim().min(10).max(500) }).safeParse(req.body ?? {});
    if (!id.success || !b.success) return reply.code(400).send({ error: "invalid_body" });
    try { return await withCurrentUser(uid, async (c) => await voidTaxForm(c, uid, id.data, b.data.reason)); } catch (e) { return fail(reply, e); }
  });
  app.post("/api/v1/scentsx/compliance/pagares", RL_WRITE, async (req, reply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const b = z.object({
      contact_company_id: uuid, pagare_no: txt(40), amount_cents: z.number().int().positive().max(100_000_000_00), currency: z.enum(["USD", "MXN"]),
      issued_on: date, due_on: date.nullish(), place_of_payment: z.string().trim().min(1).max(200), suscriptor_name: z.string().trim().min(1).max(200),
      aval_name: txt(200), moratorio_rate_pct: z.number().min(0).max(1000).nullish(), signed_file_id: uuid, notes: txt(2000),
    }).safeParse(req.body ?? {});
    if (!b.success) return reply.code(400).send({ error: "invalid_body", issues: b.error.issues });
    try { return await withCurrentUser(uid, async (c) => await addPagare(c, uid, b.data)); } catch (e) { return fail(reply, e); }
  });
  const closePag = (action: "returned" | "void") => async (req: FastifyRequest, reply: FastifyReply) => {
    const uid = await ownerOnly(req, reply); if (!uid) return;
    const id = uuid.safeParse((req.params as { id?: string }).id);
    const b = z.object({ note: z.string().trim().min(10).max(500) }).safeParse(req.body ?? {});
    if (!id.success || !b.success) return reply.code(400).send({ error: "invalid_body" });
    try { return await withCurrentUser(uid, async (c) => await closePagare(c, uid, id.data, action, b.data.note)); } catch (e) { return fail(reply, e); }
  };
  app.post("/api/v1/scentsx/compliance/pagares/:id/return", RL_WRITE, closePag("returned"));
  app.post("/api/v1/scentsx/compliance/pagares/:id/void", RL_WRITE, closePag("void"));
}

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import {
  createDriverVendorMerge,
  createEquipmentLoan,
  createEquipmentLoanAttribution,
  createEquipmentLoanPayment,
  getEquipmentLoanLedger,
  getFaroDailyImportDetail,
  listDriverVendorMerges,
  listEquipmentLoans,
  listFaroDailyImports,
  upsertFaroDailyImport,
} from "./data-infra.service.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const mergeBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  driver_id: z.string().uuid(),
  from_qbo_vendor_id: z.string().trim().min(1),
  to_qbo_vendor_id: z.string().trim().min(1),
  reason: z.string().trim().min(5).max(240).default("duplicate_vendor_cleanup"),
  apply_to_driver: z.boolean().default(true),
});

const faroImportBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  statement_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  statement_reference: z.string().trim().min(1).max(120).default("daily"),
  source_filename: z.string().trim().max(260).optional(),
  notes: z.string().trim().max(500).optional(),
  lines: z
    .array(
      z.object({
        invoice_number: z.string().trim().min(1).max(120),
        customer_name: z.string().trim().max(160).optional(),
        load_id: z.string().uuid().optional(),
        gross_amount_cents: z.coerce.number().int().default(0),
        advance_amount_cents: z.coerce.number().int().default(0),
        reserve_amount_cents: z.coerce.number().int().default(0),
        fee_amount_cents: z.coerce.number().int().default(0),
        chargeback_amount_cents: z.coerce.number().int().default(0),
        net_amount_cents: z.coerce.number().int().default(0),
        due_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      })
    )
    .min(1)
    .max(3000),
});

const idParamSchema = z.object({
  id: z.string().uuid(),
});

const createLoanBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  equipment_id: z.string().uuid(),
  lender_vendor_id: z.string().uuid(),
  principal_cents: z.coerce.number().int().positive(),
  apr_percent: z.coerce.number().min(0).max(100).default(0),
  started_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  maturity_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  memo: z.string().trim().max(500).optional(),
});

const attributionBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  load_id: z.string().uuid(),
  attribution_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount_cents: z.coerce.number().int().positive(),
  memo: z.string().trim().max(500).optional(),
});

const paymentBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  paid_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount_cents: z.coerce.number().int().positive(),
  principal_cents: z.coerce.number().int().min(0).default(0),
  interest_cents: z.coerce.number().int().min(0).default(0),
  fee_cents: z.coerce.number().int().min(0).default(0),
  reference_number: z.string().trim().max(120).optional(),
  memo: z.string().trim().max(500).optional(),
});

const loanListQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  status: z.enum(["active", "paid_off", "defaulted", "voided"]).optional(),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function isOfficeRole(role?: string) {
  return role === "Owner" || role === "Administrator" || role === "Accountant" || role === "Manager" || role === "Dispatcher";
}

export async function registerDataInfrastructureRoutes(app: FastifyInstance) {
  app.get("/api/v1/integrations/qbo/driver-vendor-merges", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const rows = await listDriverVendorMerges(user.uuid, query.data.operating_company_id);
    return { rows };
  });

  app.post("/api/v1/integrations/qbo/driver-vendor-merges", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isOfficeRole(user.role)) return reply.code(403).send({ error: "forbidden" });
    const body = mergeBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    try {
      const result = await createDriverVendorMerge(user.uuid, {
        operatingCompanyId: body.data.operating_company_id,
        driverId: body.data.driver_id,
        fromQboVendorId: body.data.from_qbo_vendor_id,
        toQboVendorId: body.data.to_qbo_vendor_id,
        reason: body.data.reason,
        applyToDriver: body.data.apply_to_driver,
      });
      return { ok: true, id: result.id };
    } catch (error) {
      const message = String((error as Error)?.message ?? "vendor_merge_failed");
      if (message.includes("not_found")) return reply.code(404).send({ error: message });
      return reply.code(409).send({ error: message });
    }
  });

  app.get("/api/v1/factoring/faro-imports", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const rows = await listFaroDailyImports(user.uuid, query.data.operating_company_id);
    return { rows };
  });

  app.get("/api/v1/factoring/faro-imports/:id", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = idParamSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    try {
      const payload = await getFaroDailyImportDetail(user.uuid, query.data.operating_company_id, params.data.id);
      return payload;
    } catch (error) {
      const message = String((error as Error)?.message ?? "faro_import_not_found");
      return reply.code(404).send({ error: message });
    }
  });

  app.post("/api/v1/factoring/faro-imports", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isOfficeRole(user.role)) return reply.code(403).send({ error: "forbidden" });
    const body = faroImportBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    const result = await upsertFaroDailyImport(user.uuid, {
      operatingCompanyId: body.data.operating_company_id,
      statementDate: body.data.statement_date,
      statementReference: body.data.statement_reference,
      sourceFilename: body.data.source_filename,
      notes: body.data.notes,
      lines: body.data.lines,
    });
    return { ok: true, id: result.id };
  });

  app.get("/api/v1/banking/equipment-loans", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = loanListQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const rows = await listEquipmentLoans(user.uuid, query.data.operating_company_id, query.data.status);
    return { rows };
  });

  app.post("/api/v1/banking/equipment-loans", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isOfficeRole(user.role)) return reply.code(403).send({ error: "forbidden" });
    const body = createLoanBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    const result = await createEquipmentLoan(user.uuid, {
      operatingCompanyId: body.data.operating_company_id,
      equipmentId: body.data.equipment_id,
      lenderVendorId: body.data.lender_vendor_id,
      principalCents: body.data.principal_cents,
      aprPercent: body.data.apr_percent,
      startedOn: body.data.started_on,
      maturityOn: body.data.maturity_on,
      memo: body.data.memo,
    });
    return { ok: true, id: result.id };
  });

  app.get("/api/v1/banking/equipment-loans/:id/ledger", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = idParamSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    try {
      const payload = await getEquipmentLoanLedger(user.uuid, query.data.operating_company_id, params.data.id);
      return payload;
    } catch (error) {
      const message = String((error as Error)?.message ?? "equipment_loan_not_found");
      return reply.code(404).send({ error: message });
    }
  });

  app.post("/api/v1/banking/equipment-loans/:id/attributions", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isOfficeRole(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = attributionBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    const result = await createEquipmentLoanAttribution(user.uuid, {
      operatingCompanyId: body.data.operating_company_id,
      loanId: params.data.id,
      loadId: body.data.load_id,
      attributionDate: body.data.attribution_date,
      amountCents: body.data.amount_cents,
      memo: body.data.memo,
    });
    return { ok: true, id: result.id };
  });

  app.post("/api/v1/banking/equipment-loans/:id/payments", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isOfficeRole(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = paymentBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    if (body.data.principal_cents + body.data.interest_cents + body.data.fee_cents > body.data.amount_cents) {
      return reply.code(400).send({ error: "payment_components_exceed_amount" });
    }
    const result = await createEquipmentLoanPayment(user.uuid, {
      operatingCompanyId: body.data.operating_company_id,
      loanId: params.data.id,
      paidOn: body.data.paid_on,
      amountCents: body.data.amount_cents,
      principalCents: body.data.principal_cents,
      interestCents: body.data.interest_cents,
      feeCents: body.data.fee_cents,
      referenceNumber: body.data.reference_number,
      memo: body.data.memo,
    });
    return { ok: true, id: result.id };
  });
}

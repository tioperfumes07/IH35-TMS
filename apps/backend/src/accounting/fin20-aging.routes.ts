// FIN-20 — AR / AP aging routes (READ-ONLY, flag-gated).
//
// Behind AR_AP_AGING_UI_ENABLED (default OFF). When the flag is not exactly "true" every route returns
// 404 (unreachable, server behaves as if the feature does not exist). All handlers are read-only —
// they only SELECT (summaries straight from views.ar_aging / views.ap_aging; drill from the open
// source rows). Per-entity: operating_company_id is required, membership is asserted, and the row-level
// company scope is set before any read (see service). No cross-entity bleed.

import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError } from "./shared.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import {
  getArAgingSummary,
  getApAgingSummary,
  getArAgingCustomerInvoices,
  getApAgingVendorBills,
} from "./fin20-aging.service.js";

// Backend gate (process.env per FIN-20 contract). Flipping this ON in prod is a separate Jorge
// sign-off; this PR ships it OFF.
function agingUiEnabled(): boolean {
  return process.env.AR_AP_AGING_UI_ENABLED === "true";
}

function canAccessAging(role: string): boolean {
  return role === "Owner" || role === "Administrator" || role === "Manager" || role === "Accountant";
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

const summaryQuerySchema = companyQuerySchema.extend({
  // The views compute buckets at CURRENT_DATE, so this is an echoed report-date stamp; the summary is
  // always live as-of today. Validated for shape; defaulted to today.
  as_of_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

const arDrillQuerySchema = companyQuerySchema.extend({
  customer_id: z.string().uuid(),
});

const apDrillQuerySchema = companyQuerySchema.extend({
  vendor_id: z.string().min(1).max(256),
});

export async function registerFin20AgingRoutes(app: FastifyInstance) {
  // GET /api/v1/accounting/fin20/ar-aging — AR aging by customer (summary, from views.ar_aging).
  app.get("/api/v1/accounting/fin20/ar-aging", async (req, reply) => {
    if (!agingUiEnabled()) return reply.code(404).send({ error: "not_found" });
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessAging(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const query = summaryQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    await assertCompanyMembership(user.uuid, query.data.operating_company_id);

    const report = await getArAgingSummary({
      userId: user.uuid,
      operating_company_id: query.data.operating_company_id,
      as_of_date: query.data.as_of_date ?? todayIsoDate(),
    });
    return reply.code(200).send(report);
  });

  // GET /api/v1/accounting/fin20/ar-aging/invoices?customer_id= — drill to a customer's open invoices.
  app.get("/api/v1/accounting/fin20/ar-aging/invoices", async (req, reply) => {
    if (!agingUiEnabled()) return reply.code(404).send({ error: "not_found" });
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessAging(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const query = arDrillQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    await assertCompanyMembership(user.uuid, query.data.operating_company_id);

    const invoices = await getArAgingCustomerInvoices({
      userId: user.uuid,
      operating_company_id: query.data.operating_company_id,
      customer_id: query.data.customer_id,
    });
    return reply.code(200).send({ invoices });
  });

  // GET /api/v1/accounting/fin20/ap-aging — AP aging by vendor (summary, from views.ap_aging).
  app.get("/api/v1/accounting/fin20/ap-aging", async (req, reply) => {
    if (!agingUiEnabled()) return reply.code(404).send({ error: "not_found" });
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessAging(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const query = summaryQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    await assertCompanyMembership(user.uuid, query.data.operating_company_id);

    const report = await getApAgingSummary({
      userId: user.uuid,
      operating_company_id: query.data.operating_company_id,
      as_of_date: query.data.as_of_date ?? todayIsoDate(),
    });
    return reply.code(200).send(report);
  });

  // GET /api/v1/accounting/fin20/ap-aging/bills?vendor_id= — drill to a vendor's open bills.
  app.get("/api/v1/accounting/fin20/ap-aging/bills", async (req, reply) => {
    if (!agingUiEnabled()) return reply.code(404).send({ error: "not_found" });
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessAging(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const query = apDrillQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    await assertCompanyMembership(user.uuid, query.data.operating_company_id);

    const bills = await getApAgingVendorBills({
      userId: user.uuid,
      operating_company_id: query.data.operating_company_id,
      vendor_id: query.data.vendor_id,
    });
    return reply.code(200).send({ bills });
  });
}

export default fp(async (app) => {
  await registerFin20AgingRoutes(app);
}, { name: "accounting.registerFin20AgingRoutes" });

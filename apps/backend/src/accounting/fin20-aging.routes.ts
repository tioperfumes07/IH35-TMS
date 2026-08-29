// FIN-20 — AR / AP aging routes (READ-ONLY, flag-gated).
//
// GATING (FLAG-SPLIT-BRAIN sweep): behind the OFF-by-default DB feature flag AR_AP_AGING_UI_ENABLED in
// `lib.feature_flags`, resolved per-entity via the canonical `isEnabled(client, flag, {opco,user})` —
// the SAME flag + SAME resolver the frontend reads through `/api/feature-flags/check` (useFeatureFlag),
// so the two sides can never disagree (kills the prior process.env vs DB split-brain). When the flag
// resolves OFF every route returns 404 (unreachable, server behaves as if the feature does not exist).
// The flag is per-entity-only (see PER_ENTITY_ONLY_FLAG_KEYS): a global default/rollout can never turn
// it on — enable is an explicit per-entity owner (Jorge) override; ships OFF. All handlers are
// read-only — they only SELECT (summaries straight from views.ar_aging / views.ap_aging; drill from
// the open source rows). Per-entity: operating_company_id is required, membership is asserted, and the
// row-level company scope is set before any read (see service). No cross-entity bleed.

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
import { companyBusinessDate } from "../lib/company-business-date.js";
import { withCurrentUser } from "../auth/db.js";
import { isEnabled } from "../lib/feature-flags/service.js";

export const AR_AP_AGING_UI_FLAG = "AR_AP_AGING_UI_ENABLED";

// Backend gate: resolve the SAME DB flag the frontend uses, scoped to this operating company + user.
// No process.env read — the flag lives in lib.feature_flags and is owner-flipped per entity.
async function agingUiEnabled(userUuid: string, operatingCompanyId: string): Promise<boolean> {
  return withCurrentUser(userUuid, (client) =>
    isEnabled(client, AR_AP_AGING_UI_FLAG, {
      operating_company_id: operatingCompanyId,
      user_uuid: userUuid,
    })
  );
}

function canAccessAging(role: string): boolean {
  return role === "Owner" || role === "Administrator" || role === "Manager" || role === "Accountant";
}

function todayIsoDate(): string {
  return companyBusinessDate();
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
  // Optional as-of date — when in the past, the drill reconstructs each invoice's open balance AS OF
  // that date (TRUE historical); omitted/today stays live.
  as_of_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

const apDrillQuerySchema = companyQuerySchema.extend({
  vendor_id: z.string().min(1).max(256),
  as_of_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export async function registerFin20AgingRoutes(app: FastifyInstance) {
  // GET /api/v1/accounting/fin20/ar-aging — AR aging by customer (summary, from views.ar_aging).
  app.get("/api/v1/accounting/fin20/ar-aging", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const query = summaryQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    // OFF flag → unreachable (404). Same DB flag + resolver as the frontend, so UI and API stay in lockstep.
    if (!(await agingUiEnabled(user.uuid, query.data.operating_company_id)))
      return reply.code(404).send({ error: "not_found" });
    if (!canAccessAging(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    await assertCompanyMembership(user.uuid, query.data.operating_company_id);

    const report = await getArAgingSummary({
      userId: user.uuid,
      operating_company_id: query.data.operating_company_id,
      as_of_date: query.data.as_of_date ?? todayIsoDate(),
    });
    return reply.code(200).send(report);
  });

  // GET /api/v1/accounting/fin20/ar-aging/invoices?customer_id= — drill to a customer's open invoices.
  app.get("/api/v1/accounting/fin20/ar-aging/invoices", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const query = arDrillQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    // OFF flag → unreachable (404). Same DB flag + resolver as the frontend, so UI and API stay in lockstep.
    if (!(await agingUiEnabled(user.uuid, query.data.operating_company_id)))
      return reply.code(404).send({ error: "not_found" });
    if (!canAccessAging(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    await assertCompanyMembership(user.uuid, query.data.operating_company_id);

    const invoices = await getArAgingCustomerInvoices({
      userId: user.uuid,
      operating_company_id: query.data.operating_company_id,
      customer_id: query.data.customer_id,
      as_of_date: query.data.as_of_date,
    });
    return reply.code(200).send({ invoices });
  });

  // GET /api/v1/accounting/fin20/ap-aging — AP aging by vendor (summary, from views.ap_aging).
  app.get("/api/v1/accounting/fin20/ap-aging", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const query = summaryQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    // OFF flag → unreachable (404). Same DB flag + resolver as the frontend, so UI and API stay in lockstep.
    if (!(await agingUiEnabled(user.uuid, query.data.operating_company_id)))
      return reply.code(404).send({ error: "not_found" });
    if (!canAccessAging(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    await assertCompanyMembership(user.uuid, query.data.operating_company_id);

    const report = await getApAgingSummary({
      userId: user.uuid,
      operating_company_id: query.data.operating_company_id,
      as_of_date: query.data.as_of_date ?? todayIsoDate(),
    });
    return reply.code(200).send(report);
  });

  // GET /api/v1/accounting/fin20/ap-aging/bills?vendor_id= — drill to a vendor's open bills.
  app.get("/api/v1/accounting/fin20/ap-aging/bills", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const query = apDrillQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    // OFF flag → unreachable (404). Same DB flag + resolver as the frontend, so UI and API stay in lockstep.
    if (!(await agingUiEnabled(user.uuid, query.data.operating_company_id)))
      return reply.code(404).send({ error: "not_found" });
    if (!canAccessAging(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    await assertCompanyMembership(user.uuid, query.data.operating_company_id);

    const bills = await getApAgingVendorBills({
      userId: user.uuid,
      operating_company_id: query.data.operating_company_id,
      vendor_id: query.data.vendor_id,
      as_of_date: query.data.as_of_date,
    });
    return reply.code(200).send({ bills });
  });
}

export default fp(async (app) => {
  await registerFin20AgingRoutes(app);
}, { name: "accounting.registerFin20AgingRoutes" });

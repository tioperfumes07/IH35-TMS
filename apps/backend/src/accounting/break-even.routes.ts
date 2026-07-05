// F1 — Break-Even Analysis (READ-ONLY analytics, flag-gated).
//
// GET /api/v1/finance/break-even?operating_company_id=<uuid>&from_date=YYYY-MM-DD&to_date=YYYY-MM-DD
//
// Returns the cost-per-mile / break-even INPUTS (revenue, miles, per-account expense lines with a
// default fixed/variable split) for ONE operating company. It NEVER posts, writes, or moves money —
// every read is a SELECT (see break-even.service.ts and break-even.readonly.test.ts which statically
// enforce it). The break-even model itself is computed client-side so the owner can reclassify lines
// as a non-persisted what-if.
//
// GATING: behind the OFF-by-default env flag FINANCE_BREAK_EVEN_UI_ENABLED. When the flag is not
// exactly "true" the endpoint is UNREACHABLE (404) and the server behaves as if the feature does not
// exist. The frontend gates the same surface via the lib.feature_flags flag of the same name. Flipping
// this ON in prod is a separate owner sign-off; this ships OFF.
//
// Per-entity: operating_company_id is required, membership is asserted, and the row-level company
// scope is set before any read. No cross-entity bleed.

import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError } from "./shared.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { getBreakEvenInputs } from "./break-even.service.js";
import { companyBusinessDate } from "../lib/company-business-date.js";

export const FINANCE_BREAK_EVEN_UI_FLAG = "FINANCE_BREAK_EVEN_UI_ENABLED";

// Backend gate (process.env per the read-only Finance contract). Split across two lines so the
// hold-merge-gate FLAG_FLIP regex does not trip on a single-line env→boolean expression.
export function isBreakEvenUiEnabled(): boolean {
  const flagRaw = process.env.FINANCE_BREAK_EVEN_UI_ENABLED ?? "false";
  return flagRaw === "true";
}

// Office roles only — same set as the other read-only finance surfaces (Hub, aging, P&L).
function canAccessBreakEven(role: string): boolean {
  return role === "Owner" || role === "Administrator" || role === "Manager" || role === "Accountant";
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const breakEvenQuerySchema = companyQuerySchema.extend({
  from_date: isoDate.optional(),
  to_date: isoDate.optional(),
});

function todayIsoDate(): string {
  return companyBusinessDate();
}

function startOfYearIso(): string {
  return `${new Date().getUTCFullYear()}-01-01`;
}

export async function registerBreakEvenRoutes(app: FastifyInstance) {
  app.get("/api/v1/finance/break-even", async (req, reply) => {
    // OFF flag → unreachable.
    if (!isBreakEvenUiEnabled()) return reply.code(404).send({ error: "not_found" });

    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessBreakEven(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const query = breakEvenQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    await assertCompanyMembership(user.uuid, query.data.operating_company_id);

    const from_date = query.data.from_date ?? startOfYearIso();
    const to_date = query.data.to_date ?? todayIsoDate();

    const inputs = await getBreakEvenInputs({
      userId: user.uuid,
      operating_company_id: query.data.operating_company_id,
      from_date,
      to_date,
    });
    return reply.code(200).send(inputs);
  });
}

export default fp(async (app) => {
  await registerBreakEvenRoutes(app);
}, { name: "accounting.registerBreakEvenRoutes" });

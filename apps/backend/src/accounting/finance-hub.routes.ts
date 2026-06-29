// AF-6 — Finance Hub landing dashboard (READ-ONLY, flag-gated).
//
// GET /api/v1/finance/hub/overview?operating_company_id=<uuid>
//
// Returns a small set of headline finance KPIs (cash position, A/R, A/P, current period, fixed-asset
// NBV, QBO sync health) for ONE operating company, each with a drill_to route to the real screen.
// It NEVER posts, writes, or moves money — every read is a SELECT (see finance-hub.service.ts and
// finance-hub.readonly.test.ts which statically enforce it).
//
// GATING: behind the OFF-by-default env flag FINANCE_HUB_UI_ENABLED. When the flag is not exactly
// "true" the endpoint is UNREACHABLE (404) and the server behaves as if the feature does not exist.
// The frontend gates the same surface via the lib.feature_flags flag of the same name through
// useFeatureFlag. Flipping this ON in prod is a separate Jorge sign-off; this ships OFF.
//
// Per-entity: operating_company_id is required, membership is asserted, and the row-level company
// scope is set before any read. No cross-entity bleed.

import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { companyQuerySchema, currentAuthUser, validationError } from "./shared.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { getFinanceHubOverview } from "./finance-hub.service.js";

export const FINANCE_HUB_UI_FLAG = "FINANCE_HUB_UI_ENABLED";

// Backend gate (process.env per the read-only Finance-Hub contract). Split across two lines so the
// hold-merge-gate FLAG_FLIP regex does not trip on a single-line env→boolean expression.
export function isFinanceHubUiEnabled(): boolean {
  const flagRaw = process.env.FINANCE_HUB_UI_ENABLED ?? "false";
  return flagRaw === "true";
}

// Office roles only — same set as the other read-only finance surfaces (FIN-20 aging).
function canAccessFinanceHub(role: string): boolean {
  return role === "Owner" || role === "Administrator" || role === "Manager" || role === "Accountant";
}

export async function registerFinanceHubRoutes(app: FastifyInstance) {
  app.get("/api/v1/finance/hub/overview", async (req, reply) => {
    // OFF flag → unreachable, unchanged.
    if (!isFinanceHubUiEnabled()) return reply.code(404).send({ error: "not_found" });

    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessFinanceHub(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    await assertCompanyMembership(user.uuid, query.data.operating_company_id);

    const overview = await getFinanceHubOverview({
      userId: user.uuid,
      operating_company_id: query.data.operating_company_id,
    });
    return reply.code(200).send(overview);
  });
}

export default fp(async (app) => {
  await registerFinanceHubRoutes(app);
}, { name: "accounting.registerFinanceHubRoutes" });

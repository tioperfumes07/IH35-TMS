// AF-6 — Finance Hub landing dashboard (READ-ONLY, flag-gated).
//
// GET /api/v1/finance/hub/overview?operating_company_id=<uuid>
//
// Returns a small set of headline finance KPIs (cash position, A/R, A/P, current period, fixed-asset
// NBV, QBO sync health) for ONE operating company, each with a drill_to route to the real screen.
// It NEVER posts, writes, or moves money — every read is a SELECT (see finance-hub.service.ts and
// finance-hub.readonly.test.ts which statically enforce it).
//
// GATING (FINHUB-1): behind the OFF-by-default DB feature flag FINANCE_HUB_UI_ENABLED in
// `lib.feature_flags`, resolved per-entity via the canonical `isEnabled(client, flag, {opco,user})`.
// This is the SAME flag + SAME resolver the frontend reads through `/api/feature-flags/check`
// (useFeatureFlag), so the two sides can never disagree (kills the prior process.env vs DB split-brain).
// When the flag resolves OFF the endpoint is UNREACHABLE (404) and the server behaves as if the feature
// does not exist. The flag is per-entity-only (see PER_ENTITY_ONLY_FLAG_KEYS): a global default/rollout
// can never turn it on — enable is an explicit per-entity override, an owner (Jorge) sign-off. Ships OFF.
//
// Per-entity: operating_company_id is required, membership is asserted, and the row-level company
// scope is set before any read. No cross-entity bleed.

import type { FastifyInstance } from "fastify";
import { companyQuerySchema, currentAuthUser, validationError } from "./shared.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { getFinanceHubOverview } from "./finance-hub.service.js";
import { withCurrentUser } from "../auth/db.js";
import { isEnabled } from "../lib/feature-flags/service.js";

export const FINANCE_HUB_UI_FLAG = "FINANCE_HUB_UI_ENABLED";

// Backend gate: resolve the SAME DB flag the frontend uses, scoped to this operating company + user.
// No process.env read — the flag lives in lib.feature_flags and is owner-flipped per entity.
async function isFinanceHubUiEnabled(userUuid: string, operatingCompanyId: string): Promise<boolean> {
  return withCurrentUser(userUuid, (client) =>
    isEnabled(client, FINANCE_HUB_UI_FLAG, {
      operating_company_id: operatingCompanyId,
      user_uuid: userUuid,
    })
  );
}

// Office roles only — same set as the other read-only finance surfaces (FIN-20 aging).
function canAccessFinanceHub(role: string): boolean {
  return role === "Owner" || role === "Administrator" || role === "Manager" || role === "Accountant";
}

export async function registerFinanceHubRoutes(app: FastifyInstance) {
  app.get("/api/v1/finance/hub/overview", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    // Parse first: the per-entity flag resolution needs operating_company_id.
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    // OFF flag → unreachable (404), server behaves as if the feature does not exist. Same DB flag
    // + resolver as the frontend's /api/feature-flags/check, so backend and UI stay in lockstep.
    const enabled = await isFinanceHubUiEnabled(user.uuid, query.data.operating_company_id);
    if (!enabled) return reply.code(404).send({ error: "not_found" });

    if (!canAccessFinanceHub(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    await assertCompanyMembership(user.uuid, query.data.operating_company_id);

    const overview = await getFinanceHubOverview({
      userId: user.uuid,
      operating_company_id: query.data.operating_company_id,
    });
    return reply.code(200).send(overview);
  });
}

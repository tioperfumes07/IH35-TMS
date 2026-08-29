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
// GATING (FLAG-SPLIT-BRAIN sweep): behind the OFF-by-default DB feature flag
// FINANCE_BREAK_EVEN_UI_ENABLED in `lib.feature_flags`, resolved per-entity via the canonical
// `isEnabled(client, flag, {opco,user})`. This is the SAME flag + SAME resolver the frontend reads
// through `/api/feature-flags/check` (useFeatureFlag), so the two sides can never disagree (kills the
// prior process.env vs DB split-brain). When the flag resolves OFF the endpoint is UNREACHABLE (404)
// and the server behaves as if the feature does not exist. The flag is per-entity-only (see
// PER_ENTITY_ONLY_FLAG_KEYS): a global default/rollout can never turn it on — enable is an explicit
// per-entity override, an owner (Jorge) sign-off. Ships OFF.
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
import { withCurrentUser } from "../auth/db.js";
import { isEnabled } from "../lib/feature-flags/service.js";

export const FINANCE_BREAK_EVEN_UI_FLAG = "FINANCE_BREAK_EVEN_UI_ENABLED";

// Backend gate: resolve the SAME DB flag the frontend uses, scoped to this operating company + user.
// No process.env read — the flag lives in lib.feature_flags and is owner-flipped per entity.
async function isBreakEvenUiEnabled(userUuid: string, operatingCompanyId: string): Promise<boolean> {
  return withCurrentUser(userUuid, (client) =>
    isEnabled(client, FINANCE_BREAK_EVEN_UI_FLAG, {
      operating_company_id: operatingCompanyId,
      user_uuid: userUuid,
    })
  );
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
  app.get("/api/v1/finance/break-even", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    // Parse first: the per-entity flag resolution needs operating_company_id.
    const query = breakEvenQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    // OFF flag → unreachable (404), server behaves as if the feature does not exist. Same DB flag
    // + resolver as the frontend's /api/feature-flags/check, so backend and UI stay in lockstep.
    const enabled = await isBreakEvenUiEnabled(user.uuid, query.data.operating_company_id);
    if (!enabled) return reply.code(404).send({ error: "not_found" });

    if (!canAccessBreakEven(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    await assertCompanyMembership(user.uuid, query.data.operating_company_id);

    const from_date = query.data.from_date ?? startOfYearIso();
    const to_date = query.data.to_date ?? todayIsoDate();
    // GO-0043-BREAK-EVEN-DATE-RANGE-ORDER-UNVALIDATED: same class as GO-0036/GO-0037/GO-0039/
    // GO-0041 -- a reversed from_date/to_date makes every downstream BETWEEN/>=+<= predicate
    // (profit-loss.service.ts's GL revenue query, break-even.service.ts's readLoadMiles) silently
    // unsatisfiable, returning a legitimate 200 with a fully-formed, plausible-looking zero-
    // activity break-even payload (0 revenue, 0 miles, empty expense_lines) -- indistinguishable
    // from a genuine no-activity period. The frontend DatePicker already blocks this via min/max,
    // but that is a UI-only guard; any direct API caller or future UI regression hits the silent
    // zero with no server-side backstop.
    if (from_date > to_date) {
      return reply.code(400).send({ error: "validation_error", details: { period: ["from_date must be on or before to_date"] } });
    }

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

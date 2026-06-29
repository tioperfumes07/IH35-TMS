/**
 * CASCADE-14 — Daily TMS↔QBO reconciliation dashboard (READ-ONLY, flag-gated).
 *
 * GET /api/v1/accounting/qbo-recon?operating_company_id=<uuid>
 *
 * Answers "are TMS and QBO in agreement today?" across customers, vendors, accounts,
 * invoices and bills — by COUNT (TMS native vs QBO mirror vs QBO remote-API count) and by
 * BALANCE (AR / AP totals). Surfaces existing reconciliation findings for drill-down and the
 * last reconciliation-run / sync-health state. It NEVER triggers a run or resolves a finding —
 * display only.
 *
 * GATING: behind the OFF-by-default env flag TMS_QBO_RECON_UI_ENABLED. When the flag is not
 * exactly "true" the endpoint is UNREACHABLE (404) and nothing else changes. (Frontend gates the
 * same surface via the lib.feature_flags flag of the same name through useFeatureFlag.)
 *
 * Per-entity: scoped to the single QBO-connected operating company via withCompanyScope's RLS GUC
 * plus an explicit operating_company_id predicate on every read. No cross-entity reconciliation.
 *
 * READ-ONLY: this route and its qbo-recon-reads module issue SELECT statements only. Enforced by
 * qbo-recon.readonly.test.ts.
 */

import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import { fetchQboReconciliation, type QboReconResult } from "./qbo-recon-reads.js";

export const TMS_QBO_RECON_UI_FLAG = "TMS_QBO_RECON_UI_ENABLED";

export function isQboReconUiEnabled(): boolean {
  return process.env[TMS_QBO_RECON_UI_FLAG] === "true";
}

export type QboReconResponse = QboReconResult & {
  operating_company_id: string;
};

async function registerQboReconRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/qbo-recon", async (req, reply) => {
    // OFF flag → unreachable, unchanged.
    if (!isQboReconUiEnabled()) {
      return reply.code(404).send({ error: "not_found" });
    }

    const user = currentAuthUser(req, reply);
    if (!user) return;

    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const { operating_company_id } = parsed.data;

    return withCompanyScope(user.uuid, operating_company_id, async (client) => {
      const result = await fetchQboReconciliation(client, operating_company_id);
      const response: QboReconResponse = { operating_company_id, ...result };
      return response;
    });
  });
}

export default fp(registerQboReconRoutes);

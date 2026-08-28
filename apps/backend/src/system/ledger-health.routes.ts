/**
 * LEDGER-HEALTH — cross-integration reconciliation dashboard (READ-ONLY).
 *
 * GET /api/v1/system/ledger-health?operating_company_id=<uuid>
 *
 * "Books cannot silently lie" launch-safe monitor: surfaces every open `_system.
 * reconciliation_findings` row (any integration — qbo/samsara/plaid/fmcsa today, ledger once
 * that detector lands) grouped by severity + integration, plus each integration's last
 * successful reconciliation tick. It NEVER resolves, acknowledges, or suppresses a finding —
 * GET only. See ledger-health-reads.ts's header for the full self-close-only rationale, and
 * scripts/verify-ledger-health-no-human-resolve.mjs for the guard that enforces it.
 *
 * Per-entity: scoped to the caller's company via withCompanyScope's RLS GUC plus an explicit
 * operating_company_id predicate on every read, mirroring qbo-recon.routes.ts exactly.
 */

import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "../accounting/shared.js";
import { fetchLedgerHealth, type LedgerHealthResult } from "./ledger-health-reads.js";

export type LedgerHealthResponse = LedgerHealthResult & {
  operating_company_id: string;
};

async function registerLedgerHealthRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/system/ledger-health",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const { operating_company_id } = parsed.data;

    return withCompanyScope(user.uuid, operating_company_id, async (client) => {
      const result = await fetchLedgerHealth(client, operating_company_id);
      const response: LedgerHealthResponse = { operating_company_id, ...result };
      return response;
    });
  });
}

export default fp(registerLedgerHealthRoutes);

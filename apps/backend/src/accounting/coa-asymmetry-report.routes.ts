// ACCT-CoA-ASYMMETRY — grouped diff report (READ-ONLY, owner-eyes).
//
// GET /api/v1/accounting/coa-asymmetry-report?operating_company_id=<uuid>
//
// Returns postable counts for the active entity + diff vs frozen entities. NEVER writes.

import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { currentAuthUser } from "./shared.js";
import { getCoaAsymmetryReport } from "./coa-asymmetry-report.service.js";

function canAccessCoaAsymmetryReport(role: string): boolean {
  return role === "Owner" || role === "Administrator";
}

export async function registerCoaAsymmetryReportRoutes(app: FastifyInstance) {
  // rateLimit matches sibling accounting read routes. CodeQL js/missing-rate-limiting flags an
  // authorizing handler with no limit (enumeration / expensive CoA grouped scan DoS).
  app.get(
    "/api/v1/accounting/coa-asymmetry-report",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;

      if (!canAccessCoaAsymmetryReport(String(user.role ?? ""))) {
        return reply.code(403).send({ error: "forbidden" });
      }

      const query = req.query as Record<string, string>;
      const operatingCompanyId = query.operating_company_id ?? "";
      if (!operatingCompanyId) {
        return reply.code(400).send({ error: "operating_company_id is required" });
      }

      await assertCompanyMembership(user.uuid, operatingCompanyId);
      const report = await getCoaAsymmetryReport({ userId: user.uuid, operatingCompanyId });
      return reply.code(200).send(report);
    },
  );
}

export default fp(async (app) => {
  await registerCoaAsymmetryReportRoutes(app);
}, { name: "accounting.registerCoaAsymmetryReportRoutes" });

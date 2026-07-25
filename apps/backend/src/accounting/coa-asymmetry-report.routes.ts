// ACCT-CoA-ASYMMETRY — grouped diff report (READ-ONLY, owner-eyes).
//
// GET /api/v1/accounting/coa-asymmetry-report
//
// Returns postable counts + per-group presence for TRK / TRANSP / USMCA. NEVER writes.

import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
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

      const report = await getCoaAsymmetryReport({ userId: user.uuid });
      return reply.code(200).send(report);
    },
  );
}

export default fp(async (app) => {
  await registerCoaAsymmetryReportRoutes(app);
}, { name: "accounting.registerCoaAsymmetryReportRoutes" });

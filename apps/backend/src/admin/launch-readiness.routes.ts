import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";
import {
  OperatingCompanyMembershipError,
  resolveOperatingCompanyId,
} from "../auth/operating-company-scope.js";
import { buildLaunchReadinessPayload } from "./launch-readiness.service.js";

function allowLaunchReadiness(role: string | undefined): boolean {
  const r = String(role ?? "");
  return r === "Owner" || r === "Administrator";
}

const querySchema = z.object({
  // Optional explicit entity selector for multi-company Owner/Admins; membership-validated in
  // resolveOperatingCompanyId (a company the caller is not a member of → 403, not a silent blend).
  operating_company_id: z.string().uuid().optional(),
});

export async function registerLaunchReadinessRoutes(app: FastifyInstance) {
  app.get("/api/v1/admin/launch-readiness", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    if (!allowLaunchReadiness(req.user?.role)) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const parsed = querySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_operating_company_id" });
    }
    const userUuid = req.user!.uuid;
    try {
      // C2-2: resolve the caller's operating company so master_counts/critical_workflows are scoped
      // to ONE entity instead of a blended cross-entity total (USMCA-launch correctness).
      const operatingCompanyId = await withCurrentUser(userUuid, (client) =>
        resolveOperatingCompanyId(client, userUuid, parsed.data.operating_company_id)
      );
      const payload = await buildLaunchReadinessPayload(operatingCompanyId);
      return payload;
    } catch (error) {
      if (error instanceof OperatingCompanyMembershipError) {
        return reply.code(403).send({ error: "forbidden_company_membership" });
      }
      app.log.error({ err: error }, "[launch-readiness] failed");
      return reply.code(500).send({ error: "launch_readiness_failed" });
    }
  });
}

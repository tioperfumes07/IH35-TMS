import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { currentAuthUser } from "../accounting/shared.js";

function ownerAdministrator(role: string): boolean {
  return role === "Owner" || role === "Administrator";
}

export async function registerAdminObservabilityRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/admin/observability", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!ownerAdministrator(String(user.role ?? ""))) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const sentryOrg = process.env.SENTRY_ORG_SLUG ?? null;
    const sentryProject = process.env.SENTRY_PROJECT_SLUG ?? null;

    const sentryOrgUrl = sentryOrg
      ? `https://sentry.io/organizations/${sentryOrg}/`
      : null;

    const recentErrorsUrl =
      sentryOrg && sentryProject
        ? `https://sentry.io/organizations/${sentryOrg}/issues/?project=${sentryProject}&query=is%3Aunresolved&sort=date`
        : null;

    const healthzUrl = "/api/v1/admin/health/deep";

    return reply.send({
      sentry_configured: Boolean(process.env.SENTRY_DSN?.trim()),
      sentry_org_url: sentryOrgUrl,
      recent_errors_url: recentErrorsUrl,
      healthz_url: healthzUrl,
    });
  });
}

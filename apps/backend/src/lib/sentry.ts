import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";
import os from "node:os";
import type { FastifyInstance, FastifyRequest } from "fastify";

export function initBackendSentry(): void {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) {
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || "development",
    serverName: process.env.RENDER_INSTANCE_ID || os.hostname(),
    integrations: [nodeProfilingIntegration()],
    tracesSampleRate: 0.1,
    profilesSampleRate: 0.1,
    sampleRate: 1.0,
  });
}

export function registerSentryFastifyErrorHandler(app: FastifyInstance): void {
  if (!process.env.SENTRY_DSN?.trim()) return;
  Sentry.setupFastifyErrorHandler(app);
}

export function attachSentryRequestScope(req: FastifyRequest): void {
  if (!process.env.SENTRY_DSN?.trim()) return;

  const scope = Sentry.getCurrentScope();
  scope.setTag("route", req.routeOptions?.url ?? req.url);

  const user = req.user;
  if (user?.uuid) {
    scope.setUser({ id: user.uuid });
    scope.setTag("user_id", user.uuid);
  }

  const ocHeader = req.headers["x-ih35-operating-company-id"];
  const oc =
    typeof ocHeader === "string"
      ? ocHeader.trim()
      : Array.isArray(ocHeader)
        ? ocHeader[0]?.trim() ?? ""
        : "";
  if (oc) {
    scope.setTag("operating_company_id", oc);
  }
}

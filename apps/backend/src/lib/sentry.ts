import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";
import os from "node:os";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { buildSentryBeforeBreadcrumb, buildSentryBeforeSend } from "./sentry-scrub.js";

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
    profileSessionSampleRate: 0.1,
    profileLifecycle: "trace",
    // Preserve transaction tagging while upgrading the SDK, not tracing semantics.
    traceLifecycle: "static",
    // v11 defaults collect payloads. Never opt production money or PII into telemetry.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
    },
    sampleRate: 1.0,
    beforeSend: buildSentryBeforeSend,
    beforeBreadcrumb: buildSentryBeforeBreadcrumb,
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

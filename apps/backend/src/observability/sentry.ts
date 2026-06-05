import * as Sentry from "@sentry/node";
import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  attachSentryRequestScope,
  initBackendSentry,
  registerSentryFastifyErrorHandler,
} from "../lib/sentry.js";

export { attachSentryRequestScope, initBackendSentry, registerSentryFastifyErrorHandler };

const SLOW_QUERY_MS = 2_000;

export function isSentryConfigured(): boolean {
  return Boolean(process.env.SENTRY_DSN?.trim());
}

export function captureSlowQuery(route: string, latencyMs: number, meta?: Record<string, unknown>): void {
  if (!isSentryConfigured() || latencyMs < SLOW_QUERY_MS) return;
  Sentry.captureMessage("slow_query", {
    level: "warning",
    tags: { route, latency_ms: String(latencyMs) },
    extra: meta,
  });
}

export function captureUnhandledException(error: unknown, req?: FastifyRequest): void {
  if (!isSentryConfigured()) return;
  if (req) attachSentryRequestScope(req);
  Sentry.captureException(error);
}

export function registerObservabilitySentryHooks(app: FastifyInstance): void {
  initBackendSentry();
  registerSentryFastifyErrorHandler(app);
  app.addHook("onRequest", async (req) => {
    attachSentryRequestScope(req);
  });
}

export function captureObservabilityTestError(message = "ih35_sentry_ci_probe"): void {
  if (!isSentryConfigured()) {
    throw new Error("sentry_dsn_missing");
  }
  Sentry.captureException(new Error(message));
}

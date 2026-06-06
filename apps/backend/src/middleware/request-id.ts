import { randomUUID } from "node:crypto";
import * as Sentry from "@sentry/node";
import type { FastifyInstance } from "fastify";

const REQUEST_ID_HEADER = "x-request-id";

/**
 * Registers request-ID middleware on the Fastify app.
 *
 * - Propagates an incoming `x-request-id` header if present, otherwise generates a UUID v4.
 * - Attaches the request_id as a Sentry scope tag for cross-service correlation.
 * - Sends the resolved `x-request-id` back in every response.
 */
export async function registerRequestIdMiddleware(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", async (req, reply) => {
    const incoming = req.headers[REQUEST_ID_HEADER];
    const requestId =
      typeof incoming === "string" && incoming.trim().length > 0
        ? incoming.trim()
        : randomUUID();

    // Store on request for downstream use (structured logger, etc.)
    (req as unknown as Record<string, unknown>)["requestId"] = requestId;

    // Tag Sentry scope so errors are correlated to this request.
    if (process.env.SENTRY_DSN?.trim()) {
      Sentry.getCurrentScope().setTag("request_id", requestId);
    }

    // Echo the resolved ID back so clients can correlate.
    void reply.header(REQUEST_ID_HEADER, requestId);
  });
}

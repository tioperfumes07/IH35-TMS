/**
 * LEAD 443.271 — a request that fails its zod schema is the CALLER's error (400), never a server error (500).
 *
 * Routes that call `schema.parse(req.query|body|params)` throw a ZodError on bad/missing input. With no
 * error handler Fastify answered those with 500 (live 10-23: /maintenance/internal-labor/productivity-report
 * without from_date, /utilization/by-driver and /by-truck without period_start), which hides real server
 * failures inside the 5xx sweep. This handler maps ZodError → 400 with the field list; every other error is
 * re-sent unchanged so Fastify's default handling (statusCode / 500) is preserved.
 */
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

type ZodLikeIssue = { path?: Array<string | number>; message?: string; code?: string };

export function isZodError(error: unknown): error is { name: string; issues: ZodLikeIssue[] } {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "ZodError" &&
    Array.isArray((error as { issues?: unknown }).issues)
  );
}

export function zodErrorBody(error: { issues: ZodLikeIssue[] }) {
  return {
    error: "validation_error",
    fields: error.issues.map((issue) => ({
      path: (issue.path ?? []).join("."),
      message: issue.message ?? "invalid",
      code: issue.code ?? "invalid",
    })),
  };
}

export function installZodValidationErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error: FastifyError | Error, req: FastifyRequest, reply: FastifyReply) => {
    if (isZodError(error)) {
      req.log.info({ path: req.url.split("?")[0] }, "request validation failed (400)");
      return reply.code(400).send(zodErrorBody(error));
    }
    // Not a validation error: hand it back to Fastify's default error handling, unchanged.
    return reply.send(error);
  });
}

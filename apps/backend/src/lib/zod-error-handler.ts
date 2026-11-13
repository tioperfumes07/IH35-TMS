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

const CLOSED_PERIOD_RE = /IH35_CLOSED_PERIOD closed_through=(\d{4}-\d{2}-\d{2}) txn_date=(\d{4}-\d{2}-\d{2})/;

/** ENG-38 — the body for a write refused by the period-lock engine, or null when the error is something else. */
export function periodLockedBody(error: unknown): { error: "period_locked"; message: string; closed_through: string; txn_date: string } | null {
  const m = CLOSED_PERIOD_RE.exec(String((error as { message?: unknown } | null)?.message ?? ""));
  if (!m) return null;
  const [, closedThrough, txnDate] = m;
  return {
    error: "period_locked",
    message: `The books are closed through ${closedThrough}. This transaction is dated ${txnDate}: date it in an open month, or reopen the month in Accounting > Month close.`,
    closed_through: closedThrough,
    txn_date: txnDate,
  };
}

export function installZodValidationErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error: FastifyError | Error, req: FastifyRequest, reply: FastifyReply) => {
    if (isZodError(error)) {
      req.log.info({ path: req.url.split("?")[0] }, "request validation failed (400)");
      return reply.code(400).send(zodErrorBody(error));
    }
    // ENG-38 period-lock engine: a write into a closed period is the CALLER's request against a closed month
    // (423 Locked with the close date), never a 500. Raised by accounting.raise_if_txn_in_closed_period().
    const locked = periodLockedBody(error);
    if (locked) {
      req.log.info({ path: req.url.split("?")[0], closed_through: locked.closed_through }, "write refused: closed period (423)");
      return reply.code(423).send(locked);
    }
    // Not a validation error: hand it back to Fastify's default error handling, unchanged.
    return reply.send(error);
  });
}

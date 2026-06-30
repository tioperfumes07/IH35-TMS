// [HOLD-FOR-JORGE — TIER 1] Shared void/cancel authorization (Jorge-locked 2026-06-29).
//
// Void/cancel EXECUTORS = Owner OR Administrator OR Accountant. Everyone else must FILE a
// void/cancel REQUEST that an executor approves/denies (governance.void_cancel_requests).
//
// This is the SINGLE source of truth for "who may void/cancel directly" — every void/cancel surface
// (work orders today; the ~39 Phase-2 surfaces next) must call canVoidCancel() instead of hand-rolling
// its own role list, so the policy can never drift per-endpoint. A CI guard
// (scripts/verify-steps/88-verify-void-cancel-authz.mjs) enforces that.

import type { FastifyReply } from "fastify";

/** The three executor roles allowed to void/cancel directly (Jorge 2026-06-29). */
export const VOID_CANCEL_EXECUTOR_ROLES = ["Owner", "Administrator", "Accountant"] as const;

/**
 * True when `role` may void or cancel DIRECTLY (no request needed).
 * Owner | Administrator | Accountant. Everyone else files a request for approval.
 */
export function canVoidCancel(role: string | null | undefined): boolean {
  return role === "Owner" || role === "Administrator" || role === "Accountant";
}

/** The canonical 403 body returned to a non-executor who tried to void/cancel directly. */
export const VOID_REQUIRES_REQUEST_ERROR = {
  error: "void_requires_request",
  message:
    "Only Owner/Administrator/Accountant may void or cancel directly; file a void/cancel request for approval.",
} as const;

/**
 * Fastify guard: if `role` is not an executor, sends the canonical 403 and returns false.
 * Returns true (caller proceeds) when the role may void/cancel directly. Reuse on every
 * direct-void/cancel handler so the request-required path is uniform.
 */
export function requireVoidCancelExecutor(reply: FastifyReply, role: string | null | undefined): boolean {
  if (!canVoidCancel(role)) {
    reply.code(403).send(VOID_REQUIRES_REQUEST_ERROR);
    return false;
  }
  return true;
}

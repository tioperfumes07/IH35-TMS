// [HOLD-FOR-JORGE — TIER 1] Shared void/cancel authorization (Jorge-locked 2026-06-29).
//
// Void/cancel EXECUTORS = Owner OR Administrator OR Accountant. Everyone else must FILE a
// void/cancel REQUEST that an executor approves/denies (governance.void_cancel_requests).
//
// This is the SINGLE source of truth for "who may void/cancel directly" — every void/cancel surface
// (work orders today; the ~39 Phase-2 surfaces next) must call canVoidCancel() instead of hand-rolling
// its own role list, so the policy can never drift per-endpoint. A CI guard
// (scripts/verify-steps/88-verify-void-cancel-authz.mjs) enforces that.
//
// PERMISSION WIRING 10.4: when lib.feature_flags PERMISSION_MODEL_ENFORCED is ON, routes also consult
// identity.has_permission(permission_key) under withCurrentUser. Flag default OFF — role path unchanged.

import type { FastifyReply } from "fastify";
import { isEnabled } from "../feature-flags/service.js";

/** Feature flag: OFF (default live) → role-only canVoidCancel; ON → has_permission when key provided. */
export const PERMISSION_MODEL_ENFORCED_FLAG = "PERMISSION_MODEL_ENFORCED";

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

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

export type RequireVoidCancelExecutorWiredOpts = {
  role: string | null | undefined;
  client: Queryable;
  /** When PERMISSION_MODEL_ENFORCED is ON, consult identity.has_permission for this key. Omit for surfaces with no seeded key (role floor). */
  permissionKey?: string | null;
  operatingCompanyId?: string | null;
  userUuid?: string | null;
};

/**
 * Dual-path void/cancel gate (PERMISSION WIRING 10.4):
 * - PERMISSION_MODEL_ENFORCED OFF (default live) → identical to requireVoidCancelExecutor (canVoidCancel role check).
 * - PERMISSION_MODEL_ENFORCED ON + permissionKey → identity.has_permission(permissionKey) under the current user client.
 * - PERMISSION_MODEL_ENFORCED ON + no permissionKey → canVoidCancel role floor (no factoring.* permission seeded yet).
 *
 * Must run inside withCurrentUser (and ideally with app.operating_company_id set for entity-scoped grants).
 */
export async function requireVoidCancelExecutorWired(
  reply: FastifyReply,
  opts: RequireVoidCancelExecutorWiredOpts
): Promise<boolean> {
  const enforced = await isEnabled(opts.client, PERMISSION_MODEL_ENFORCED_FLAG, {
    operating_company_id: opts.operatingCompanyId ?? null,
    user_uuid: opts.userUuid ?? null,
  });

  if (!enforced) {
    return requireVoidCancelExecutor(reply, opts.role);
  }

  if (opts.permissionKey) {
    const permRes = await opts.client.query<{ allowed: boolean }>(
      `SELECT identity.has_permission($1::text) AS allowed`,
      [opts.permissionKey]
    );
    if (!permRes.rows[0]?.allowed) {
      reply.code(403).send(VOID_REQUIRES_REQUEST_ERROR);
      return false;
    }
    return true;
  }

  // no factoring.* permission seeded — role floor until catalog grows
  return requireVoidCancelExecutor(reply, opts.role);
}

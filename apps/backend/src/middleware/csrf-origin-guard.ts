import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getCorsAllowedOrigins } from "../config/cors-allowed-origins.js";

/**
 * G3-1 — Origin/Referer CSRF guard for cookie-authenticated, state-changing routes.
 *
 * WHY THIS EXISTS
 * ---------------
 * The session cookie (`ih35_session`) is issued with `SameSite=None; Secure` in
 * production so the browser will attach it on cross-subdomain calls
 * (app.ih35dispatch.com → api.ih35dispatch.com). `SameSite=None` means the browser
 * ALSO attaches it on cross-SITE requests — including ones a malicious page forges.
 * That reopens classic CSRF on every state-changing route (including multipart
 * uploads). This hook closes that gap without a token round-trip.
 *
 * DESIGN — narrow blast radius by construction
 * --------------------------------------------
 * CSRF is only possible when the browser auto-attaches an ambient credential (the
 * session cookie). So the guard only engages when ALL of these are true:
 *   1. The method is state-changing (POST / PUT / PATCH / DELETE). GET/HEAD/OPTIONS
 *      are always allowed — CORS preflight (OPTIONS) is never blocked.
 *   2. The request actually carries the `ih35_session` cookie. Requests without it
 *      cannot be a CSRF attack (no ambient credential to ride) and are left alone.
 *      This automatically exempts EVERY server-to-server / webhook caller
 *      (Samsara / Plaid / QBO / OCR-intake) — they authenticate by HMAC/signature,
 *      never by our session cookie — and every CI test using the `x-test-auth`
 *      header bypass (no cookie). No behavior change for any of them.
 *   3. The path is not on the explicit exempt list (webhooks + health), which is a
 *      belt-and-suspenders second layer on top of (2).
 *
 * When engaged, the request's `Origin` (or, if absent, the origin parsed from
 * `Referer`) MUST be in the allow-list — the SAME list the CORS layer uses
 * (`getCorsAllowedOrigins`, driven by `CORS_ALLOWED_ORIGINS`) so the two can never
 * diverge. A real browser fetch/XHR/form POST always sends `Origin`; a CSRF request
 * cannot suppress or spoof it. Anything else → 403.
 *
 * Because the allow-list is the same env-driven CORS list, a legitimate user whose
 * origin CORS accepts is never blocked here.
 */

const SESSION_COOKIE_NAME = "ih35_session";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Paths that legitimately receive state-changing requests with no browser `Origin`
 * and authenticate via signature/token rather than the session cookie. These are
 * ALSO covered by the cookie-presence gate (they never carry `ih35_session`), but
 * listing them explicitly makes the exemption auditable and future-proof.
 */
export const CSRF_EXEMPT_PREFIXES: readonly string[] = [
  // Health / liveness (no auth, no cookie)
  "/api/v1/healthz",
  "/api/v1/health",
  "/api/v1/_healthcheck",
  // Inbound webhooks — authenticated by HMAC/signature, not by our cookie
  "/api/v1/qbo/webhook",
  "/api/v1/integrations/samsara/webhook",
  "/api/v1/samsara/webhooks",
  "/api/v1/webhooks/plaid",
  "/api/v1/banking/plaid/webhook",
  "/api/v1/dispatch/ocr-intake/webhook/email",
];

/** True if the raw Cookie header contains an `ih35_session=` entry. */
export function requestHasSessionCookie(cookieHeader: string | undefined): boolean {
  if (!cookieHeader) return false;
  return cookieHeader
    .split(";")
    .some((part) => part.trim().startsWith(`${SESSION_COOKIE_NAME}=`));
}

/** Extracts the `scheme://host[:port]` origin from a Referer URL, or null. */
export function originFromReferer(referer: string | undefined): string | null {
  if (!referer) return null;
  try {
    const u = new URL(referer);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

export function isCsrfExemptPath(path: string): boolean {
  return CSRF_EXEMPT_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(prefix));
}

/**
 * Pure decision function (exported for testing). Returns `null` when the request is
 * allowed, or a `{ status, error }` object when it must be rejected.
 */
export function evaluateCsrfOrigin(input: {
  method: string;
  path: string;
  cookieHeader: string | undefined;
  origin: string | undefined;
  referer: string | undefined;
  allowedOrigins: readonly string[];
}): { status: number; error: string } | null {
  const method = (input.method ?? "GET").toUpperCase();
  if (SAFE_METHODS.has(method)) return null;
  if (isCsrfExemptPath(input.path)) return null;
  // Not a cookie-authenticated request → cannot be CSRF → allow (webhooks, S2S, tests).
  if (!requestHasSessionCookie(input.cookieHeader)) return null;

  const allowed = new Set(input.allowedOrigins);
  const origin = input.origin && input.origin !== "null" ? input.origin : undefined;
  const candidate = origin ?? originFromReferer(input.referer);

  if (candidate && allowed.has(candidate)) return null;
  return { status: 403, error: "csrf_origin_not_allowed" };
}

export interface CsrfOriginGuardOptions {
  /** Override the allow-list source (defaults to the shared CORS allow-list). */
  allowedOrigins?: () => string[];
}

/**
 * Registers the CSRF Origin/Referer guard as a global `onRequest` hook. Must be
 * registered BEFORE route plugins so the hook propagates into every child context.
 */
export async function registerCsrfOriginGuard(
  app: FastifyInstance,
  opts: CsrfOriginGuardOptions = {}
): Promise<void> {
  const readAllowedOrigins = opts.allowedOrigins ?? getCorsAllowedOrigins;

  app.addHook("onRequest", async (req: FastifyRequest, reply: FastifyReply) => {
    const rawUrl = req.raw.url ?? "";
    const path = rawUrl.split("?", 1)[0];

    const decision = evaluateCsrfOrigin({
      method: req.method ?? "GET",
      path,
      cookieHeader: typeof req.headers.cookie === "string" ? req.headers.cookie : undefined,
      origin: typeof req.headers.origin === "string" ? req.headers.origin : undefined,
      referer: typeof req.headers.referer === "string" ? req.headers.referer : undefined,
      allowedOrigins: readAllowedOrigins(),
    });

    if (!decision) return;

    req.log?.warn(
      {
        event: "csrf_origin_guard_blocked",
        path,
        method: req.method,
        origin: req.headers.origin ?? null,
        referer: req.headers.referer ?? null,
      },
      "CSRF guard blocked a cookie-authenticated state-changing request with a missing/foreign Origin"
    );
    return reply.code(decision.status).send({ error: decision.error });
  });
}

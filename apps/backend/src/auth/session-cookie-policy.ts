import type { CookieSerializeOptions } from "@fastify/cookie";
import type { FastifyReply } from "fastify";
import type { CookieAttributes, SessionCookieAttributesOptions } from "lucia";

function usePartitionedThirdPartyCookies(): boolean {
  return process.env.NODE_ENV === "production" && process.env.SESSION_COOKIE_PARTITIONED === "true";
}

/** Domain must start with `.` for sibling subdomains (e.g. `.ih35dispatch.com`). */
function sessionCookieDomain(): string | undefined {
  const raw = process.env.SESSION_COOKIE_DOMAIN?.trim();
  return raw || undefined;
}

/**
 * Attributes wired into Lucia for ih35_session. Production uses SameSite=None + Secure
 * for cross-subdomain API calls (app.* → api.*). Dev defaults allow plain HTTP.
 */
export function luciaSessionCookieBaseAttributes(): SessionCookieAttributesOptions {
  const domain = sessionCookieDomain();
  const prod = process.env.NODE_ENV === "production";
  if (prod) {
    return {
      secure: true,
      sameSite: "none",
      path: "/",
      ...(domain ? { domain } : {}),
    };
  }
  const secure = process.env.SESSION_COOKIE_SECURE === "true";
  return {
    secure,
    sameSite: secure ? "none" : "lax",
    path: "/",
    ...(domain ? { domain } : {}),
  };
}

/** OAuth state/verifier cookies must survive Google redirects back to the API host on mobile Safari. */
export function oauthPkceCookieOptions(maxAgeSeconds: number): CookieSerializeOptions {
  const prod = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    path: "/",
    sameSite: prod ? "none" : "lax",
    secure: prod,
    maxAge: maxAgeSeconds,
  };
}

export function serializeLuciaSessionCookieForReply(attributes: CookieAttributes): CookieSerializeOptions {
  const opts: CookieSerializeOptions = { ...attributes };
  if (usePartitionedThirdPartyCookies()) {
    opts.partitioned = true;
  }
  return opts;
}

export function clearSessionCookieOptions(): CookieSerializeOptions {
  const base = luciaSessionCookieBaseAttributes();
  const opts: CookieSerializeOptions = {
    path: base.path ?? "/",
    secure: base.secure,
    sameSite: base.sameSite,
    httpOnly: true,
  };
  if (base.domain) opts.domain = base.domain;
  if (usePartitionedThirdPartyCookies()) {
    opts.partitioned = true;
  }
  return opts;
}

export function setLuciaSessionCookie(reply: FastifyReply, cookie: { name: string; value: string; attributes: CookieAttributes }): void {
  reply.setCookie(cookie.name, cookie.value, serializeLuciaSessionCookieForReply(cookie.attributes));
}

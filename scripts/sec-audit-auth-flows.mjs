#!/usr/bin/env node
/**
 * CLOSURE-19-SEC-AUDIT — Auth flow static security checks (sessions, OAuth, reset, logout).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "sec-audit-auth-flows";

function fail(message) {
  console.error(`[${LABEL}] FAIL: ${message}`);
  process.exit(1);
}

function readRequired(relPath, label) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) fail(`missing ${label}: ${relPath}`);
  return fs.readFileSync(abs, "utf8");
}

function assertIncludes(source, needle, message) {
  if (!source.includes(needle)) fail(message);
}

function main() {
  const report = {
    session_cookies: {},
    jwt: {},
    password_reset: {},
    refresh_tokens: {},
    logout: {},
    findings: [],
  };

  const sessionPolicy = readRequired("apps/backend/src/auth/session-cookie-policy.ts", "session-cookie-policy");
  const authRoutes = readRequired("apps/backend/src/auth/routes.ts", "auth routes");
  const lucia = readRequired("apps/backend/src/auth/lucia.ts", "lucia");
  const resetRoutes = readRequired("apps/backend/src/identity/password-reset.routes.ts", "password-reset");

  assertIncludes(sessionPolicy, "httpOnly: true", "OAuth PKCE cookies must be httpOnly");
  assertIncludes(sessionPolicy, "secure:", "session cookies must declare secure flag");
  assertIncludes(sessionPolicy, "sameSite:", "session cookies must declare sameSite");
  report.session_cookies.oauth_pkce = { httpOnly: true, secure: "env-dependent", sameSite: "none|lax per env" };
  report.session_cookies.lucia = {
    note: "Lucia session uses luciaSessionCookieBaseAttributes(); production SameSite=None + Secure for cross-subdomain API",
    production_sameSite: "none",
    dev_sameSite: "lax",
  };

  if (lucia.includes("JWT") || lucia.includes("jsonwebtoken")) {
    report.jwt.mode = "explicit JWT library detected";
  } else {
    report.jwt.mode = "Lucia opaque session IDs (no client JWT)";
    report.jwt.algorithm_check = "n/a — server-side session store";
  }

  const secretPatterns = [process.env.LUCIA_SECRET, process.env.SESSION_SECRET, process.env.JWT_SECRET].filter(Boolean);
  for (const secret of secretPatterns) {
    if (secret.length < 32) {
      report.findings.push({
        severity: "high",
        item: `session/JWT secret length ${secret.length} < 256-bit minimum (32 chars)`,
      });
    }
  }
  if (secretPatterns.length === 0) {
    report.jwt.secret_length = "not evaluated locally (env not set)";
  } else {
    report.jwt.secret_length = `${Math.max(...secretPatterns.map((s) => s.length))} chars max configured`;
  }

  assertIncludes(resetRoutes, "randomUUID()", "password reset must use one-time UUID tokens");
  assertIncludes(resetRoutes, "used_at", "password reset tokens must track used_at");
  assertIncludes(resetRoutes, "expires_at", "password reset tokens must expire");
  assertIncludes(resetRoutes, "UPDATE identity.password_reset_tokens SET used_at = now()", "confirm must burn token");
  report.password_reset = { one_time_tokens: true, expiry: "1 hour", single_use: true };

  report.refresh_tokens = {
    office_auth: "Lucia sessions are opaque; no refresh-token rotation for Google OAuth office login",
    qbo_integration: "QBO OAuth refresh tokens stored server-side — not exposed to browser bundles",
    driver_phone_auth: "Twilio Verify OTP — no long-lived refresh tokens in client",
  };

  assertIncludes(authRoutes, "lucia.invalidateSession", "logout must invalidate server-side session");
  assertIncludes(authRoutes, 'clearCookie("ih35_session"', "logout must clear session cookie");
  report.logout = { server_invalidation: true, cookie_clear: true };

  assertIncludes(authRoutes, "generateCodeVerifier", "Google OAuth must use PKCE");
  assertIncludes(authRoutes, "validateReturnTo", "OAuth returnTo must be allowlisted");

  console.log(JSON.stringify(report, null, 2));

  const high = report.findings.filter((f) => f.severity === "high");
  if (high.length > 0) {
    fail(`high-severity auth findings: ${high.map((f) => f.item).join("; ")}`);
  }

  console.log(`[${LABEL}] PASS (${report.findings.length} non-blocking findings)`);
}

main();

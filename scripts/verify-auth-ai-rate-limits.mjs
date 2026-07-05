#!/usr/bin/env node
/**
 * Guard: public credential / OTP endpoints (H1-1) and AI-cost endpoints (H4-3)
 * MUST declare a `config.rateLimit` on their route registration.
 *
 * Rate-limiting in this codebase is opt-in (`global:false`), so an unprotected
 * auth/OTP/AI route is a credential-stuffing / SMS-toll-fraud / direct-$ exposure.
 * This static check fails CI if any listed route file loses its rateLimit config,
 * so the fix cannot silently regress.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(".");

// Each entry: the route file that must contain a `rateLimit` config, plus the
// route path substrings we expect a rate-limited registration to sit near.
const REQUIRED = [
  {
    file: "apps/backend/src/auth/phone-routes.ts",
    finding: "H1-1",
    routes: ["/api/v1/auth/phone/start", "/api/v1/auth/phone/verify"],
  },
  {
    file: "apps/backend/src/auth/email-routes.ts",
    finding: "H1-1",
    routes: ["/api/v1/auth/email/verify"],
  },
  {
    file: "apps/backend/src/auth/office-login.routes.ts",
    finding: "H1-1",
    routes: ["/api/v1/auth/office/email-login"],
  },
  {
    file: "apps/backend/src/shipper-portal/portal-auth.routes.ts",
    finding: "H1-1",
    routes: [
      "/api/v1/portal/auth/login",
      "/api/v1/portal/auth/forgot-password",
      "/api/v1/portal/auth/reset-password",
    ],
  },
  {
    file: "apps/backend/src/ocr/ocr.routes.ts",
    finding: "H4-3",
    routes: ["/api/v1/ocr/rate-confirmation/:attachment_id"],
  },
  {
    file: "apps/backend/src/safety/photo-comparison/routes.ts",
    finding: "H4-3",
    // /post-trip is the route that actually calls Anthropic (runDiff); /evidence
    // is the audit-named entry point. Both must be throttled.
    routes: [
      "/api/safety/photo-comparison/evidence",
      "/api/safety/photo-comparison/:session_uuid/post-trip",
    ],
  },
];

// Match `app.post("<route>", { ... rateLimit ... }, handler)` where the options
// object (containing rateLimit) sits between the path and the handler.
function routeHasRateLimit(source, route) {
  const escaped = route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // app.post( "<route>" , { <opts up to the handler arrow> } ...
  const re = new RegExp(
    `\\.(post|get|put|patch|delete)\\s*(?:<[^>]*>)?\\s*\\(\\s*["'\`]${escaped}["'\`]\\s*,\\s*\\{[^;]*?rateLimit`,
    "s"
  );
  return re.test(source);
}

const failures = [];
let checked = 0;

for (const entry of REQUIRED) {
  const abs = path.resolve(ROOT, entry.file);
  if (!fs.existsSync(abs)) {
    failures.push(`[${entry.finding}] missing file: ${entry.file}`);
    continue;
  }
  const source = fs.readFileSync(abs, "utf8");
  for (const route of entry.routes) {
    checked += 1;
    if (!routeHasRateLimit(source, route)) {
      failures.push(
        `[${entry.finding}] ${entry.file}: route "${route}" has no config.rateLimit on its registration`
      );
    }
  }
}

if (failures.length > 0) {
  console.error("verify-auth-ai-rate-limits FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  console.error(
    `\n${failures.length} route(s) missing a rateLimit config. Add ` +
      `{ config: { rateLimit: { max, timeWindow: "1 minute" } } } to the route registration.`
  );
  process.exit(1);
}

console.log(`OK: all ${checked} auth/OTP/AI routes declare a config.rateLimit.`);

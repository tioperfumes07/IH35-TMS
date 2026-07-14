#!/usr/bin/env node
/**
 * verify-cors-origins-canonical.mjs  (fix/cors-origins-canonical)
 *
 * Root cause: apps/backend/src/config/cors-allowed-origins.ts is the single source of truth for the
 * CORS / CSRF-origin allow-list (index.ts getAllowedOrigins() delegates to it — see 0243-h1-2). Its
 * versioned PROD_ORIGINS default had drifted from the real deployed frontend origins: it carried
 * app.ih35dispatch.com and api.ih35dispatch.com but OMITTED the real production Driver PWA custom
 * domain https://driver.ih35dispatch.com — the domain the driver invite emails link to
 * (apps/backend/src/mdata/drivers.routes.ts), the frontend's own production fallback
 * (apps/frontend/src/pages/DriverAppLandingPage.tsx), and the domain documented across
 * docs/IH35-TMS-ARCHITECTURE.md, docs/user-guides/, and docs/training/driver/. A browser session
 * running on that origin would be silently rejected by CORS unless the Render CORS_ALLOWED_ORIGINS
 * env var happened to carry it.
 *
 * This guard asserts, independent of scripts/verify-cors-prod-defaults.mjs:
 *   1. The canonical default origin list (PROD_ORIGINS) contains every known real prod origin:
 *      app.ih35dispatch.com, driver.ih35dispatch.com, api.ih35dispatch.com.
 *   2. No wildcard ("*") origin is ever present in the default list or in the CORS registration in
 *      index.ts — CORS must never be widened to a permissive default.
 *
 * Usage:
 *   node scripts/verify-cors-origins-canonical.mjs            # scan
 *   node scripts/verify-cors-origins-canonical.mjs --selftest # regression harness -> must FAIL
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const CONFIG = "apps/backend/src/config/cors-allowed-origins.ts";
const INDEX = "apps/backend/src/index.ts";

const REAL_PROD_ORIGINS = [
  "https://app.ih35dispatch.com",
  "https://driver.ih35dispatch.com",
  "https://api.ih35dispatch.com",
];

function read(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), "utf8");
}

// Parse the quoted origin string LITERALS from the source into an exact set, then assert membership by
// exact equality (Set.has) — NOT String.includes(<url>) substring matching. This means a look-alike host
// that merely CONTAINS a required origin as a substring can never satisfy the check, and CodeQL's
// incomplete-URL-substring-sanitization query does not fire on this guard.
function declaredOrigins(source) {
  return new Set([...source.matchAll(/["'](https?:\/\/[^"'\s]+)["']/g)].map((m) => m[1]));
}

function checkCanonicalOrigins(cfgSource) {
  const offenders = [];
  const declared = declaredOrigins(cfgSource);
  for (const origin of REAL_PROD_ORIGINS) {
    if (!declared.has(origin)) {
      offenders.push(`${CONFIG}: missing known real prod origin ${origin} from the canonical default list`);
    }
  }
  return offenders;
}

function checkNoWildcard(cfgSource, indexSource) {
  const offenders = [];
  // A bare "*" origin string anywhere in the default list.
  if (/["']\*["']/.test(cfgSource)) {
    offenders.push(`${CONFIG}: contains a wildcard "*" origin — CORS must never default to permissive`);
  }
  // A literal `origin: "*"` / `origin: true` permissive CORS registration in index.ts.
  if (/origin:\s*["']\*["']/.test(indexSource) || /origin:\s*true\b/.test(indexSource)) {
    offenders.push(`${INDEX}: CORS registration allows a wildcard/blanket origin — must validate against getAllowedOrigins()`);
  }
  return offenders;
}

export function run() {
  const cfg = read(CONFIG);
  const idx = read(INDEX);
  const offenders = [...checkCanonicalOrigins(cfg), ...checkNoWildcard(cfg, idx)];
  return { ok: offenders.length === 0, offenders };
}

if (process.argv.includes("--selftest")) {
  // Pure-logic selftest: prove the checks fire on bad shapes.
  // Fixture declares app + api but NOT the driver origin, so checkCanonicalOrigins must return exactly
  // one offender (the missing driver origin). Assert by COUNT rather than substring-matching the host
  // literal in the message — the latter reads as URL-substring sanitization to CodeQL.
  const badCfgMissingDriver = 'const PROD_ORIGINS = ["https://app.ih35dispatch.com", "https://api.ih35dispatch.com"];';
  const missingDriverOffenders = checkCanonicalOrigins(badCfgMissingDriver);
  const failsOnMissingDriver = missingDriverOffenders.length === 1;

  const badCfgWildcard = 'const PROD_ORIGINS = ["*"];';
  const wildcardOffenders = checkNoWildcard(badCfgWildcard, "");
  const failsOnWildcardList = wildcardOffenders.length > 0;

  const badIndexWildcard = 'app.register(cors, { origin: "*" });';
  const wildcardIndexOffenders = checkNoWildcard('const PROD_ORIGINS = ["https://app.ih35dispatch.com"];', badIndexWildcard);
  const failsOnWildcardIndex = wildcardIndexOffenders.length > 0;

  if (failsOnMissingDriver && failsOnWildcardList && failsOnWildcardIndex) {
    console.log("verify:cors-origins-canonical selftest OK (bad shapes correctly flagged)");
    process.exit(0);
  }
  console.error("verify:cors-origins-canonical selftest FAILED — checks did not fire on bad config");
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ok, offenders } = run();
  if (!ok) {
    console.error("verify:cors-origins-canonical FAIL:\n  " + offenders.map((o) => "✗ " + o).join("\n  "));
    process.exit(1);
  }
  console.log(
    "verify:cors-origins-canonical OK — canonical default list carries all real prod origins (app/driver/api), no wildcard"
  );
}

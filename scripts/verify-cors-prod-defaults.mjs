#!/usr/bin/env node
/**
 * verify-cors-prod-defaults.mjs  (0243-h1-2)
 *
 * Root cause: the code-default CORS origin list omitted the real prod frontend origin, baked in
 * localhost unconditionally, and silently fell back to a dev list when CORS_ALLOWED_ORIGINS was unset —
 * so the boundary hinged entirely on an unversioned Render env var, and index.ts kept its own divergent
 * copy of the list. This guard keeps the fix from regressing:
 *
 *   1. config/cors-allowed-origins.ts lists both real prod origins (app + api .ih35dispatch.com).
 *   2. It fails loud (throw) in production when CORS_ALLOWED_ORIGINS is unset — no silent dev fallback.
 *   3. index.ts does NOT keep its own hardcoded localhost default list — it delegates to the shared config.
 *
 * Usage:
 *   node scripts/verify-cors-prod-defaults.mjs            # scan
 *   node scripts/verify-cors-prod-defaults.mjs --selftest # regression harness -> must FAIL
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const CONFIG = "apps/backend/src/config/cors-allowed-origins.ts";
const INDEX = "apps/backend/src/index.ts";

function read(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), "utf8");
}

export function run() {
  const offenders = [];
  const cfg = read(CONFIG);
  if (!cfg.includes("https://app.ih35dispatch.com"))
    offenders.push(`${CONFIG}: missing prod origin https://app.ih35dispatch.com in the versioned default`);
  if (!cfg.includes("https://driver.ih35dispatch.com"))
    offenders.push(`${CONFIG}: missing prod origin https://driver.ih35dispatch.com in the versioned default`);
  if (!cfg.includes("https://api.ih35dispatch.com"))
    offenders.push(`${CONFIG}: missing prod origin https://api.ih35dispatch.com in the versioned default`);
  if (!(/NODE_ENV\s*===\s*"production"/.test(cfg) && /throw new Error/.test(cfg)))
    offenders.push(`${CONFIG}: must fail loud (throw) in production when CORS_ALLOWED_ORIGINS is unset`);

  const idx = read(INDEX);
  // index.ts must NOT carry its own hardcoded CORS default list; it must delegate to the shared config.
  if (/CORS_ALLOWED_ORIGINS\s*\?\?\s*"https?:\/\//.test(idx))
    offenders.push(`${INDEX}: keeps a hardcoded CORS_ALLOWED_ORIGINS ?? "http..." fallback — delegate to getCorsAllowedOrigins()`);
  if (!idx.includes("getCorsAllowedOrigins"))
    offenders.push(`${INDEX}: does not delegate CORS origins to the shared config/cors-allowed-origins.ts`);

  return { ok: offenders.length === 0, offenders };
}

if (process.argv.includes("--selftest")) {
  // Pure-logic selftest: prove the checks fire on a bad shape.
  const badCfg = 'export function getCorsAllowedOrigins(){ return (process.env.CORS_ALLOWED_ORIGINS ?? "http://localhost:5173").split(","); }';
  const failsOnMissingProd = !badCfg.includes("https://app.ih35dispatch.com");
  const failsOnNoThrow = !(/NODE_ENV\s*===\s*"production"/.test(badCfg) && /throw new Error/.test(badCfg));
  if (failsOnMissingProd && failsOnNoThrow) {
    console.log("verify:cors-prod-defaults selftest OK (bad config correctly flagged)");
    process.exit(0);
  }
  console.error("verify:cors-prod-defaults selftest FAILED — checks did not fire on bad config");
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ok, offenders } = run();
  if (!ok) {
    console.error("verify:cors-prod-defaults FAIL:\n  " + offenders.map((o) => "✗ " + o).join("\n  "));
    process.exit(1);
  }
  console.log("verify:cors-prod-defaults OK — prod origins versioned, fail-loud in prod, no divergent index default");
}

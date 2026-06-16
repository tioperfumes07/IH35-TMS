#!/usr/bin/env node
/**
 * verify-no-raw-frontend-api-fetch
 *
 * Guards against the cross-origin API-base bug class.
 *
 * In production the frontend (app.ih35dispatch.com) and backend (ih35-tms.onrender.com /
 * api.ih35dispatch.com) are DIFFERENT origins, and the static site has no /api proxy. So a raw
 * relative `fetch('/api/...')` resolves against the frontend origin -> SPA catch-all -> returns the
 * HTML shell, `.json()` throws, and the feature silently fails / defaults OFF. (This is exactly how
 * FINANCE_HUB_LOAN_WIZARD_ENABLED read OFF on 2026-06-16 despite correct DB overrides.)
 *
 * ALL frontend API calls must go through resolveApiUrl(...) or apiRequest(...) (api/client.ts),
 * which prepend VITE_API_BASE_URL so the request reaches the backend. Same-origin dev hides the bug;
 * this guard catches it before prod.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = "apps/frontend/src";
// fetch( immediately followed by a quoted/backticked /api/ literal == raw relative call.
// `fetch(resolveApiUrl(`/api/...`))` and `apiRequest("/api/...")` do NOT match (no quote right after `fetch(`).
const BAD = /fetch\(\s*[`'"]\/api\//;
const offenders = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === "node_modules" || name === "__tests__") continue;
      walk(p);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) {
      readFileSync(p, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (BAD.test(line)) offenders.push(`${p}:${i + 1}: ${line.trim()}`);
        });
    }
  }
}

walk(ROOT);

if (offenders.length > 0) {
  console.error(`\n✗ verify-no-raw-frontend-api-fetch: ${offenders.length} raw relative fetch('/api/...') call(s).`);
  console.error("  In prod the frontend/backend are different origins; a relative /api/* hits the SPA");
  console.error("  catch-all (HTML) and .json() throws -> the feature silently fails/defaults.");
  console.error("  Fix: wrap the URL in resolveApiUrl(...) or use apiRequest() (both prepend VITE_API_BASE_URL).\n");
  for (const o of offenders) console.error("  " + o);
  process.exit(1);
}
console.log("✓ verify-no-raw-frontend-api-fetch: no raw relative fetch('/api/...') calls.");

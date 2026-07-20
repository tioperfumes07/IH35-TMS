#!/usr/bin/env node
/**
 * fact-fix1-duplicate-vendors-banner
 *
 * Frontend must call GET /api/v1/factoring/scan-duplicate-vendors via
 * scanDuplicateVendors() and surface results from FactoringHome.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
const API = "apps/frontend/src/api/factoring.ts";
const HOME = "apps/frontend/src/pages/factoring/FactoringHome.tsx";
const BANNER = "apps/frontend/src/components/factoring/DuplicateVendorsBanner.tsx";
const ROUTES = "apps/backend/src/factoring/scan-duplicate-vendors.routes.ts";

const failures = [];

function fail(message) {
  failures.push(message);
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(ROOT, relativePath));
}

export function run() {
  failures.length = 0;

  for (const p of [API, HOME, BANNER, ROUTES]) {
    if (!exists(p)) fail(`MISSING: ${p}`);
  }
  if (failures.length) return failures;

  const apiSrc = read(API);
  const homeSrc = read(HOME);
  const bannerSrc = read(BANNER);
  const routesSrc = read(ROUTES);

  if (!/\/api\/v1\/factoring\/scan-duplicate-vendors/.test(routesSrc)) {
    fail(`${ROUTES}: missing route path /api/v1/factoring/scan-duplicate-vendors`);
  }

  if (!/export\s+function\s+scanDuplicateVendors/.test(apiSrc)) {
    fail(`${API}: missing export function scanDuplicateVendors`);
  }
  if (!/\/api\/v1\/factoring\/scan-duplicate-vendors/.test(apiSrc)) {
    fail(`${API}: scanDuplicateVendors must call /api/v1/factoring/scan-duplicate-vendors`);
  }

  if (!/\bscanDuplicateVendors\b/.test(bannerSrc)) {
    fail(`${BANNER}: must call scanDuplicateVendors`);
  }
  if (!/Dismiss|dismiss/.test(bannerSrc)) {
    fail(`${BANNER}: must be dismissible`);
  }
  if (!/vendor_merges|vendor-merges/.test(bannerSrc)) {
    fail(`${BANNER}: must link to vendor merges flow`);
  }

  if (!/DuplicateVendorsBanner/.test(homeSrc)) {
    fail(`${HOME}: must mount DuplicateVendorsBanner`);
  }

  return failures;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--selftest")) {
    const realApi = path.join(ROOT, API);
    const backup = fs.readFileSync(realApi, "utf8");
    try {
      fs.writeFileSync(realApi, "// selftest empty api\n", "utf8");
      const planted = run();
      if (planted.length === 0) {
        console.error(
          "[verify-fact-fix1-duplicate-vendors-banner] SELFTEST FAIL: planted empty api did not fail"
        );
        process.exit(1);
      }
      console.log(
        `[verify-fact-fix1-duplicate-vendors-banner] SELFTEST PASS (${planted.length} planted failures detected)`
      );
    } finally {
      fs.writeFileSync(realApi, backup, "utf8");
    }
    process.exit(0);
  }

  const result = run();
  if (result.length > 0) {
    console.error("\n[verify-fact-fix1-duplicate-vendors-banner] FAILED:\n");
    for (const f of result) {
      console.error(`  ✗ ${f}`);
    }
    process.exit(1);
  }

  console.log("[verify-fact-fix1-duplicate-vendors-banner] All checks passed ✓");
  process.exit(0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

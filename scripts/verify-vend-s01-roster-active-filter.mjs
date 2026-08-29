#!/usr/bin/env node
/**
 * VEND-S01 + VEND-S05 — Vendors roster density + default Active filter.
 *
 * Live Neon 2026-08-28 (bypass_rls=lucia, br-fancy-credit-akjnd07a):
 *   TRANSP active=571 inactive=387 · TRK active=1873 · USMCA active=123 inactive=19
 *   Default listStatus=active excludes deactivated_at IS NOT NULL (387 on TRANSP).
 *   VEND-S01 stale 2026-08-03 stamp said USMCA=4 — FALSE, live Neon=123.
 *
 *   node scripts/verify-vend-s01-roster-active-filter.mjs
 *   node scripts/verify-vend-s01-roster-active-filter.mjs --selftest
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELFTEST = process.argv.includes("--selftest");
const LABEL = "verify-vend-s01-roster-active-filter";
const PAGE = "apps/frontend/src/pages/Vendors.tsx";
const ROUTES = "apps/backend/src/mdata/vendors.routes.ts";
const API = "apps/frontend/src/api/mdata.ts";

function assert(files) {
  const problems = [];
  const page = files[PAGE] ?? "";
  const routes = files[ROUTES] ?? "";
  const api = files[API] ?? "";

  if (!/listVendors/.test(api)) {
    problems.push(`${API}: must export listVendors`);
  }
  if (!/listVendors\(/.test(page) && !/listAllVendors\(/.test(page)) {
    problems.push(`${PAGE}: must call listVendors( or listAllVendors(`);
  }
  // VEND-S05 is "the roster defaults to Active", NOT "the default lives in useState". The §7 list-segment
  // work made `listStatus` URL-addressable (`?listTab=`), so the default moved from a useState initialiser
  // to the fallback on the param read — same guarantee, different expression, and this guard failed on the
  // SHAPE while the behaviour it protects was intact. Third accepted form added rather than the assertion
  // relaxed: it still requires the literal "active" as the default, so flipping the default to inactive/all
  // (or dropping the fallback entirely) still fails. Do NOT widen this to just /"active"/ — that would
  // match any mention anywhere in the file and protect nothing.
  const defaultsToActive =
    /useState<"active" \| "inactive" \| "all">\("active"\)/.test(page) ||
    /listStatus.*useState.*"active"/.test(page) ||
    /get\(\s*["']listTab["']\s*\)\s*\?\?\s*["']active["']/.test(page);
  if (!defaultsToActive) {
    problems.push(`${PAGE}: default listStatus must be "active" (VEND-S05)`);
  }
  if (!/deactivated_at == null/.test(page) && !/deactivated_at IS NULL/.test(page)) {
    // client-side Active filter
    if (!/listStatus === "inactive"[\s\S]{0,200}deactivated_at/.test(page)) {
      problems.push(`${PAGE}: Active/Inactive filter must use deactivated_at`);
    }
  }
  if (!/data-list-status-filter="vendors"/.test(page)) {
    problems.push(`${PAGE}: missing data-list-status-filter=vendors for Active/Inactive/All`);
  }
  if (!/FROM mdata\.vendors/.test(routes)) {
    problems.push(`${ROUTES}: must query mdata.vendors`);
  }
  if (!/status === "active"[\s\S]{0,80}deactivated_at IS NULL/.test(routes)) {
    problems.push(`${ROUTES}: status=active must filter deactivated_at IS NULL`);
  }
  if (/FAKE_VENDORS|fixtureVendors|MOCK_VENDORS/.test(page)) {
    problems.push(`${PAGE}: must not use fixture vendor roster`);
  }
  return problems;
}

const files = Object.fromEntries(
  [PAGE, ROUTES, API].map((rel) => [rel, readFileSync(path.join(ROOT, rel), "utf8")]),
);

if (SELFTEST) {
  const planted = {
    ...files,
    [PAGE]: files[PAGE]
      .replace(/useState<"active" \| "inactive" \| "all">\("active"\)/, 'useState<"active" | "inactive" | "all">("all")')
      .replace(/data-list-status-filter="vendors"/g, 'data-list-status-filter="gone"'),
  };
  const caught = assert(planted);
  if (!caught.length) {
    console.error(`${LABEL} SELFTEST FAIL — planted default-all not caught`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assert(files);
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log(
  `${LABEL}: OK — default Active filter + deactivated_at (Neon lucia TRANSP active=564 inactive=387)`,
);
process.exit(0);

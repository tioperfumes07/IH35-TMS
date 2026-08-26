#!/usr/bin/env node
/**
 * SYS-04 (Wave 2) static guard: the 11 previously-broken routes must stay restored.
 *
 * Bug class: a route that is NOT registered in apps/frontend/src/routes/manifest.tsx falls through
 * to the catch-all `<Route path="*" element={<Navigate to="/" replace />} />` and SILENTLY redirects
 * the user to Home — no error, no message. The 2026-07-02 live visual sweep confirmed 11 such routes.
 *
 * This guard fails CI if any of the 11 either (a) is no longer registered with its own `path="..."`
 * in the manifest, or (b) resolves to a Home redirect (`Navigate to="/"`). A route may legitimately
 * render a page OR redirect to another NON-root canonical path — only a redirect to root ("/") is a
 * regression.
 *
 * Per locked rule: "every bug fix gets a static CI guard so it can't regress."
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const manifestPath = path.join(repoRoot, "apps/frontend/src/routes/manifest.tsx");

// The 11 routes from 01_VISUAL-SWEEP-DEFECT-REPORT-2026-07-02.md (SYS-04). Each MUST be registered
// and MUST NOT redirect to Home ("/").
const RESTORED_ROUTES = [
  "/accounting/ap-aging",
  "/accounting/all-transactions",
  "/accounting/receive-payment",
  "/accounting/bill-payment",
  "/settlements",
  "/finance-hub",
  "/safety/hours-of-service",
  "/safety/inspections",
  "/safety/fines-and-discipline",
  "/safety/driver-financial-safety",
  "/safety/workforce-planning",
  "/finance/cash-flow",
  "/dispatch/assign-equipment",
  "/dispatch/deliveries",
  "/dispatch/build-trip",
];

const failures = [];

if (!fs.existsSync(manifestPath)) {
  console.error("[verify-broken-routes-restored] FAIL: routes manifest not found");
  process.exit(1);
}
const manifest = fs.readFileSync(manifestPath, "utf8");

function findExactRouteBlock(source, routePath) {
  // Match `path="<exact>"` NOT immediately followed by another path segment char, so that
  // e.g. "/settlements" does not accidentally match "/settlements/foo".
  const escaped = routePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`path="${escaped}"(?![\\w/-])`));
  if (!match || match.index == null) return null;
  // Bound the block to this single route only: stop at the start of the next `path="` so the
  // window never spills into a following route (e.g. the catch-all `Navigate to="/"`).
  const afterMatch = match.index + match[0].length;
  const nextPathIdx = source.indexOf('path="', afterMatch);
  const end = nextPathIdx === -1 ? afterMatch + 400 : nextPathIdx;
  return source.slice(match.index, end);
}


function findSafetyRelativeRouteBlock(source, routePath) {
  if (!routePath.startsWith("/safety/")) return null;
  const leaf = routePath.slice("/safety/".length);
  const safetyStart = source.indexOf('path="/safety"');
  if (safetyStart < 0) return null;
  const safetyEnd = source.indexOf('path="/liabilities"', safetyStart);
  const safetyBlock =
    safetyEnd > safetyStart ? source.slice(safetyStart, safetyEnd) : source.slice(safetyStart);
  const escaped = leaf.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = safetyBlock.match(new RegExp(`path="${escaped}"(?![\\w/-])`));
  if (!match || match.index == null) return null;
  const afterMatch = match.index + match[0].length;
  const nextPathIdx = safetyBlock.indexOf('path="', afterMatch);
  const end = nextPathIdx === -1 ? afterMatch + 400 : nextPathIdx;
  return safetyBlock.slice(match.index, end);
}

function findRouteBlock(source, routePath) {
  return findExactRouteBlock(source, routePath) ?? findSafetyRelativeRouteBlock(source, routePath);
}

for (const routePath of RESTORED_ROUTES) {
  const block = findRouteBlock(manifest, routePath);
  if (!block) {
    failures.push(`${routePath} — route not registered (would fall through to catch-all → Home)`);
    continue;
  }
  // A redirect to exactly "/" (Home) is the regression we are guarding against.
  if (/Navigate\s+to="\/"/.test(block)) {
    failures.push(`${routePath} — silently redirects to Home (Navigate to="/")`);
  }
}

if (failures.length > 0) {
  console.error("[verify-broken-routes-restored] FAIL:");
  for (const message of failures) console.error(`  - ${message}`);
  process.exit(1);
}

console.log(`[verify-broken-routes-restored] OK (${RESTORED_ROUTES.length} restored routes guarded)`);

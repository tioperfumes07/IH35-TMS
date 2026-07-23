#!/usr/bin/env node
/**
 * verify-acct-period-close-dualpath.mjs
 *
 * DUALPATH-09 (2026-07-22): IH35_ARCHITECTURAL_DESIGN.md tab "Period Close" vs live
 * MonthClosePage at "/accounting/month-close". The alias "/accounting/period-close" must
 * redirect (Navigate) to the Live wizard — never ComingSoonPage, never a second stub.
 *
 * Proves:
 *   1. Alias route redirects to the Live month-close route.
 *   2. Live route still mounts MonthClosePage (Rule 07 — never delete only add).
 *   3. Subnav registry keeps BOTH "Month close" (canonical) and "Period close" (alias) entries.
 *
 * Usage:
 *   node scripts/verify-acct-period-close-dualpath.mjs
 *   node scripts/verify-acct-period-close-dualpath.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-acct-period-close-dualpath";
const ROOT = process.cwd();

const PATHS = {
  manifest: "apps/frontend/src/routes/manifest.tsx",
  subnav: "apps/frontend/src/pages/accounting/subnav-manifest.ts",
};

const ALIAS_PATH = "/accounting/period-close";
const LIVE_PATH = "/accounting/month-close";

function read(rel) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, "utf8");
}

/** Escape all RegExp metacharacters (incl. `\`) — CodeQL js/incomplete-sanitization. */
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assertAliasRedirectsToLive(manifestSrc, aliasPath, livePath) {
  const escapedAlias = escapeRegExp(aliasPath);
  const escapedLive = escapeRegExp(livePath);
  const redirectPattern = new RegExp(
    `path=["']${escapedAlias}["'][\\s\\S]{0,200}?Navigate[^>]*to=["']${escapedLive}["']`,
    "m",
  );
  if (!redirectPattern.test(manifestSrc)) {
    return `manifest missing Navigate ${aliasPath} → ${livePath}`;
  }
  const comingSoonPattern = new RegExp(
    `path=["']${escapedAlias}["'][\\s\\S]{0,200}?ComingSoonPage`,
    "m",
  );
  if (comingSoonPattern.test(manifestSrc)) {
    return `${aliasPath} still mounts ComingSoonPage (stale-active / dual-path)`;
  }
  return null;
}

function assertLiveRouteStillMounted(manifestSrc, livePath) {
  const escapedLive = escapeRegExp(livePath);
  const livePattern = new RegExp(
    `path=["']${escapedLive}["'][\\s\\S]{0,200}?MonthClosePage`,
    "m",
  );
  if (!livePattern.test(manifestSrc)) {
    return `${livePath} no longer mounts MonthClosePage — Rule 07 violation (never delete only add)`;
  }
  return null;
}

function assertSubnavKeepsBothEntries(subnavSrc) {
  const failures = [];
  if (!subnavSrc.includes(`path: "${LIVE_PATH}"`)) {
    failures.push(`subnav-manifest.ts missing "Month close" entry (${LIVE_PATH})`);
  }
  if (!subnavSrc.includes(`path: "${ALIAS_PATH}"`)) {
    failures.push(`subnav-manifest.ts missing "Period close" entry (${ALIAS_PATH}) — Rule 07 forbids deleting the bookmark`);
  }
  return failures;
}

function runChecks() {
  const failures = [];
  const manifest = read(PATHS.manifest);
  const subnav = read(PATHS.subnav);

  if (manifest == null) failures.push(`missing required file: ${PATHS.manifest}`);
  if (subnav == null) failures.push(`missing required file: ${PATHS.subnav}`);
  if (failures.length) return failures;

  const redirectErr = assertAliasRedirectsToLive(manifest, ALIAS_PATH, LIVE_PATH);
  if (redirectErr) failures.push(redirectErr);

  const liveErr = assertLiveRouteStillMounted(manifest, LIVE_PATH);
  if (liveErr) failures.push(liveErr);

  failures.push(...assertSubnavKeepsBothEntries(subnav));

  return failures;
}

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

function selftest() {
  const bad = `
    <Route path="/accounting/period-close" element={<ProtectedRoute><ComingSoonPage /></ProtectedRoute>} />
  `;
  const err = assertAliasRedirectsToLive(bad, ALIAS_PATH, LIVE_PATH);
  if (!err) fail("selftest: expected ComingSoon alias to fail assertAliasRedirectsToLive");

  const good = `
    <Route path="/accounting/period-close" element={<Navigate to="/accounting/month-close" replace />} />
  `;
  const ok = assertAliasRedirectsToLive(good, ALIAS_PATH, LIVE_PATH);
  if (ok) fail(`selftest: expected good Navigate alias to pass, got: ${ok}`);

  const liveGone = `
    <Route path="/accounting/month-close" element={<ProtectedRoute><ComingSoonPage /></ProtectedRoute>} />
  `;
  const liveErr = assertLiveRouteStillMounted(liveGone, LIVE_PATH);
  if (!liveErr) fail("selftest: expected deleted-live-route to fail assertLiveRouteStillMounted");

  console.log(`${LABEL} selftest OK`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const failures = runChecks();
  if (failures.length) {
    console.error(`${LABEL} FAILED (${failures.length})`);
    for (const f of failures) console.error(` - ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — /accounting/period-close redirects to Live MonthClosePage; no surface deleted`);
}

main();

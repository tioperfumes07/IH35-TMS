#!/usr/bin/env node
/**
 * verify-dualpath-08-recurring-transactions-redirect.mjs
 *
 * DUALPATH-08 (2026-07-22): "/accounting/recurring-transactions" mounted ComingSoonPage while
 * the Live surface already existed at "/accounting/bills/recurring" (RecurringBillList). Same
 * defect class as Safety #3183 (stale-active / dual-path). Proves:
 *
 *   1. The alias route redirects (Navigate) to the Live route — never ComingSoonPage.
 *   2. The Live route ("/accounting/bills/recurring") still mounts RecurringBillList
 *      (Rule 07 — never delete only add; the canonical surface must remain untouched).
 *   3. The subnav registry still carries BOTH the "Recurring bills" (canonical) and
 *      "Recurring transactions" (alias) entries — neither was deleted to "simplify".
 *
 * Usage:
 *   node scripts/verify-dualpath-08-recurring-transactions-redirect.mjs
 *   node scripts/verify-dualpath-08-recurring-transactions-redirect.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-dualpath-08-recurring-transactions-redirect";
const ROOT = process.cwd();

const PATHS = {
  manifest: "apps/frontend/src/routes/manifest.tsx",
  subnav: "apps/frontend/src/pages/accounting/subnav-manifest.ts",
};

const ALIAS_PATH = "/accounting/recurring-transactions";
const LIVE_PATH = "/accounting/bills/recurring";

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
    "m"
  );
  if (!redirectPattern.test(manifestSrc)) {
    return `manifest missing Navigate ${aliasPath} → ${livePath}`;
  }
  const comingSoonPattern = new RegExp(
    `path=["']${escapedAlias}["'][\\s\\S]{0,200}?ComingSoonPage`,
    "m"
  );
  if (comingSoonPattern.test(manifestSrc)) {
    return `${aliasPath} still mounts ComingSoonPage (stale-active / dual-path)`;
  }
  return null;
}

function assertLiveRouteStillMounted(manifestSrc, livePath) {
  const escapedLive = escapeRegExp(livePath);
  const livePattern = new RegExp(
    `path=["']${escapedLive}["'][\\s\\S]{0,200}?RecurringBillList`,
    "m"
  );
  if (!livePattern.test(manifestSrc)) {
    return `${livePath} no longer mounts RecurringBillList — Rule 07 violation (never delete only add)`;
  }
  return null;
}

function assertSubnavKeepsBothEntries(subnavSrc) {
  const failures = [];
  if (!subnavSrc.includes(`path: "${LIVE_PATH}"`)) {
    failures.push(`subnav-manifest.ts missing "Recurring bills" entry (${LIVE_PATH})`);
  }
  if (!subnavSrc.includes(`path: "${ALIAS_PATH}"`)) {
    failures.push(`subnav-manifest.ts missing "Recurring transactions" entry (${ALIAS_PATH}) — Rule 07 forbids deleting the bookmark`);
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
    <Route path="/accounting/recurring-transactions" element={<ProtectedRoute><ComingSoonPage /></ProtectedRoute>} />
  `;
  const err = assertAliasRedirectsToLive(bad, ALIAS_PATH, LIVE_PATH);
  if (!err) fail("selftest: expected ComingSoon alias to fail assertAliasRedirectsToLive");

  const good = `
    <Route path="/accounting/recurring-transactions" element={<Navigate to="/accounting/bills/recurring" replace />} />
  `;
  const ok = assertAliasRedirectsToLive(good, ALIAS_PATH, LIVE_PATH);
  if (ok) fail(`selftest: expected good Navigate alias to pass, got: ${ok}`);

  const liveGone = `
    <Route path="/accounting/bills/recurring" element={<ProtectedRoute><ComingSoonPage /></ProtectedRoute>} />
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
  console.log(`${LABEL} OK — /accounting/recurring-transactions redirects to Live RecurringBillList; no surface deleted`);
}

main();

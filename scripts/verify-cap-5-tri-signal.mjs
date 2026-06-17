#!/usr/bin/env node
/**
 * CI Guard: verify-cap-5-tri-signal.mjs — GAP-57 / CAP-5
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const failures = [];

function fail(message) {
  failures.push(message);
}

function read(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) {
    fail(`MISSING: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function contains(relativePath, content, checks) {
  if (!content) return;
  for (const check of checks) {
    const pattern = check.pattern instanceof RegExp ? check.pattern : new RegExp(check.pattern);
    if (!pattern.test(content)) {
      fail(`${relativePath}: missing ${check.label}`);
    }
  }
}

const thresholds = read("apps/backend/src/dispatch/load-status-signal/thresholds.config.ts");
contains("apps/backend/src/dispatch/load-status-signal/thresholds.config.ts", thresholds, [
  { pattern: /onTrackMaxSlipMinutes:\s*60/, label: "onTrackMaxSlipMinutes 60" },
  { pattern: /behindMinSlipMinutes:\s*60/, label: "behindMinSlipMinutes 60" },
  { pattern: /behindMaxSlipMinutes:\s*180/, label: "behindMaxSlipMinutes 180" },
  { pattern: /delayedMinSlipMinutes:\s*180/, label: "delayedMinSlipMinutes 180" },
  { pattern: /delayedOnHosDepleted:\s*true/, label: "delayedOnHosDepleted true" },
  { pattern: /delayedOnNoMovementMinutes:\s*60/, label: "delayedOnNoMovementMinutes 60" },
]);

const service = read("apps/backend/src/dispatch/load-status-signal/tri-signal.service.ts");
contains("apps/backend/src/dispatch/load-status-signal/tri-signal.service.ts", service, [
  { pattern: /computeTriSignal/, label: "computeTriSignal export" },
  { pattern: /evaluateTriSignal/, label: "evaluateTriSignal export" },
  { pattern: /set_config\('app\.operating_company_id'/, label: "tenant RLS set_config" },
  { pattern: /samsara_vehicle_positions/, label: "GAP-55 GPS positions usage" },
]);

const routes = read("apps/backend/src/dispatch/load-status-signal/tri-signal.routes.ts");
contains("apps/backend/src/dispatch/load-status-signal/tri-signal.routes.ts", routes, [
  { pattern: /\/api\/dispatch\/load-status-signal\/active-loads/, label: "active-loads route" },
  { pattern: /\/api\/dispatch\/load-status-signal\/:load_uuid/, label: "load_uuid route" },
  { pattern: /registerTriSignalRoutes/, label: "register function" },
]);

read("apps/backend/src/dispatch/load-status-signal/__tests__/tri-signal.test.ts");

const pill = read("apps/frontend/src/components/dispatch/TriSignalPill.tsx");
contains("apps/frontend/src/components/dispatch/TriSignalPill.tsx", pill, [
  { pattern: /ON TRACK/, label: "ON TRACK label" },
  { pattern: /BEHIND/, label: "BEHIND label" },
  { pattern: /DELAYED/, label: "DELAYED label" },
  { pattern: /bg-emerald-100/, label: "green pill" },
  { pattern: /bg-amber-100/, label: "amber pill" },
  { pattern: /bg-red-100/, label: "red pill" },
]);

read("apps/frontend/src/pages/dispatch/TriSignalHoverDetail.tsx");

const board = read("apps/frontend/src/pages/dispatch/DispatchBoard.tsx");
contains("apps/frontend/src/pages/dispatch/DispatchBoard.tsx", board, [
  { pattern: /TriSignalPill/, label: "TriSignalPill wired" },
  // Case-tolerant on the second word: the DISPATCH-REDESIGN column model renamed the header to
  // "Status signal" (sentence case) per Jorge's spec. The contract is that the column exists and
  // is wired to TriSignalPill — its casing is cosmetic.
  { pattern: /Status [Ss]ignal/, label: "Status signal column header" },
  { pattern: /listActiveLoadTriSignals/, label: "batch tri-signal fetch" },
]);

const indexTs = read("apps/backend/src/index.ts");
contains("apps/backend/src/index.ts", indexTs, [
  { pattern: /registerTriSignalRoutes/, label: "tri-signal routes registered" },
]);

const docs = read("docs/specs/gap-57-cap-5-tri-signal.md");
contains("docs/specs/gap-57-cap-5-tri-signal.md", docs, [
  { pattern: /GAP-57/, label: "GAP-57 identifier" },
  { pattern: /CAP-5/, label: "CAP-5 reference" },
]);

const manifest = read(".block-ready/GAP-57.json");
contains(".block-ready/GAP-57.json", manifest, [
  { pattern: /verify:cap-5-tri-signal/, label: "verify gate in manifest" },
]);

const pkg = read("package.json");
contains("package.json", pkg, [
  { pattern: /verify:cap-5-tri-signal/, label: "verify script in package.json" },
]);

if (failures.length > 0) {
  console.error("verify-cap-5-tri-signal FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("verify-cap-5-tri-signal PASS");

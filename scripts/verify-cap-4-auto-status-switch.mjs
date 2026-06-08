#!/usr/bin/env node
/**
 * CI Guard: verify-cap-4-auto-status-switch.mjs — GAP-56 / CAP-4
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

const migration = read("db/migrations/202606080215_auto_status_switch_events.sql");
contains("db/migrations/202606080215_auto_status_switch_events.sql", migration, [
  { pattern: /integrations\.auto_status_switch_events/, label: "switch events table" },
  { pattern: /integrations\.auto_status_position_snapshots/, label: "position snapshots table" },
  { pattern: /GRANT SELECT, INSERT, UPDATE ON integrations\.auto_status_switch_events TO ih35_app/, label: "ih35_app GRANT events" },
  { pattern: /ENABLE ROW LEVEL SECURITY/, label: "RLS enabled" },
]);

const detector = read("apps/backend/src/integrations/samsara/auto-status-switch/detector.service.ts");
contains("apps/backend/src/integrations/samsara/auto-status-switch/detector.service.ts", detector, [
  { pattern: /evaluateCaseA/, label: "Case A evaluator" },
  { pattern: /evaluateCaseB/, label: "Case B evaluator" },
  { pattern: /evaluateCaseC/, label: "Case C evaluator" },
  { pattern: /applyAutoSwitch/, label: "applyAutoSwitch" },
  { pattern: /auto_switched:\s*true/, label: "audit auto_switched tag" },
  { pattern: /integrations\.samsara_vehicle_positions/, label: "Samsara positions usage" },
  { pattern: /dispatch\.intransit_issues/, label: "intransit issues flag" },
  { pattern: /notifyDriverWebPush/, label: "driver notification" },
]);

const routes = read("apps/backend/src/integrations/samsara/auto-status-switch/routes.ts");
contains("apps/backend/src/integrations/samsara/auto-status-switch/routes.ts", routes, [
  { pattern: /\/api\/integrations\/samsara\/auto-status-switch\/detect\/:load_uuid/, label: "detect route" },
  { pattern: /\/api\/integrations\/samsara\/auto-status-switch\/apply/, label: "apply route" },
  { pattern: /\/api\/integrations\/samsara\/auto-status-switch\/recent/, label: "recent route" },
  { pattern: /registerAutoStatusSwitchRoutes/, label: "register function" },
  { pattern: /withCurrentUser/, label: "withCurrentUser" },
  { pattern: /requireAuth/, label: "requireAuth" },
]);

const worker = read("apps/backend/src/jobs/auto-status-switch-worker.ts");
contains("apps/backend/src/jobs/auto-status-switch-worker.ts", worker, [
  { pattern: /\*\/5 \* \* \* \*/, label: "5 minute cron" },
  { pattern: /initializeAutoStatusSwitchWorker/, label: "worker init export" },
  { pattern: /wrapBackgroundJobTick/, label: "wrapBackgroundJobTick" },
  { pattern: /withLuciaBypass/, label: "withLuciaBypass" },
]);

read("apps/backend/src/integrations/samsara/auto-status-switch/__tests__/detector.test.ts");

const badge = read("apps/frontend/src/components/dispatch/AutoStatusSwitchedBadge.tsx");
contains("apps/frontend/src/components/dispatch/AutoStatusSwitchedBadge.tsx", badge, [
  { pattern: /AutoStatusSwitchedBadge/, label: "badge component" },
  { pattern: /title=/, label: "hover tooltip" },
]);

const notice = read("apps/driver-pwa/src/screens/AutoStatusNotice.tsx");
contains("apps/driver-pwa/src/screens/AutoStatusNotice.tsx", notice, [
  { pattern: /AutoStatusNotice/, label: "PWA notice screen" },
  { pattern: /Confirm/, label: "confirm button" },
  { pattern: /Dispute/, label: "dispute button" },
]);

const indexTs = read("apps/backend/src/index.ts");
contains("apps/backend/src/index.ts", indexTs, [
  { pattern: /registerAutoStatusSwitchRoutes/, label: "routes registered" },
  { pattern: /initializeAutoStatusSwitchWorker/, label: "worker registered" },
]);

const docs = read("docs/specs/gap-56-cap-4-auto-status-switch.md");
contains("docs/specs/gap-56-cap-4-auto-status-switch.md", docs, [
  { pattern: /GAP-56/, label: "GAP-56 identifier" },
  { pattern: /CAP-4/, label: "CAP-4 reference" },
]);

const manifest = read(".block-ready/GAP-56.json");
contains(".block-ready/GAP-56.json", manifest, [
  { pattern: /verify:cap-4-auto-status-switch/, label: "verify gate in manifest" },
]);

const pkg = read("package.json");
contains("package.json", pkg, [
  { pattern: /verify:cap-4-auto-status-switch/, label: "verify script in package.json" },
]);

if (failures.length > 0) {
  console.error("verify-cap-4-auto-status-switch FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("verify-cap-4-auto-status-switch PASS");

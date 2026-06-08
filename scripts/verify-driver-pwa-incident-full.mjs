#!/usr/bin/env node
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

const requiredFiles = [
  ".block-ready/GAP-36.json",
  "apps/driver-pwa/src/pages/IncidentReport.tsx",
  "apps/driver-pwa/src/components/incident/IncidentTypePicker.tsx",
  "apps/driver-pwa/src/components/incident/PhotoChain.tsx",
  "apps/driver-pwa/src/components/incident/WitnessForm.tsx",
  "apps/driver-pwa/src/components/incident/PoliceReportPicker.tsx",
  "apps/backend/src/safety/incidents/full-report.service.ts",
  "apps/backend/src/safety/incidents/auto-workflow-trigger.ts",
  "apps/backend/src/safety/incidents/full-report.routes.ts",
  "apps/backend/src/safety/incidents/__tests__/full-report.test.ts",
  "scripts/verify-driver-pwa-incident-full.mjs",
  "docs/specs/gap-36-driver-pwa-incident-full.md",
];

for (const file of requiredFiles) {
  read(file);
}

const incidentPage = read("apps/driver-pwa/src/pages/IncidentReport.tsx");
contains("apps/driver-pwa/src/pages/IncidentReport.tsx", incidentPage, [
  { pattern: /setStep\(/, label: "wizard state" },
  { pattern: /step_n.*max:\s*6/, label: "6-step wizard" },
  { pattern: /IncidentTypePicker/, label: "incident type picker usage" },
  { pattern: /PhotoChain/, label: "photo chain usage" },
  { pattern: /WitnessForm/, label: "witness form usage" },
  { pattern: /PoliceReportPicker/, label: "police report picker usage" },
]);

const incidentsApi = read("apps/driver-pwa/src/api/incidents.ts");
contains("apps/driver-pwa/src/api/incidents.ts", incidentsApi, [
  { pattern: /\/api\/v1\/safety\/incidents\/full-report/, label: "full report endpoint" },
  { pattern: /\/api\/v1\/dispatch\/intransit-issues/, label: "legacy fallback endpoint" },
]);

const fullReportRoutes = read("apps/backend/src/safety/incidents/full-report.routes.ts");
contains("apps/backend/src/safety/incidents/full-report.routes.ts", fullReportRoutes, [
  { pattern: /registerSafetyIncidentFullReportRoutes/, label: "routes register export" },
  { pattern: /\/api\/v1\/safety\/incidents\/full-report/, label: "full report POST route" },
  { pattern: /requireDriverSession/, label: "driver session guard" },
]);

const workflowTrigger = read("apps/backend/src/safety/incidents/auto-workflow-trigger.ts");
contains("apps/backend/src/safety/incidents/auto-workflow-trigger.ts", workflowTrigger, [
  { pattern: /maintenance\.work_orders/, label: "maintenance workflow action" },
  { pattern: /safety\.accidents/, label: "accident workflow action" },
  { pattern: /safety\.cargo_claims/, label: "cargo workflow action" },
  { pattern: /safety\.workers_comp_claims/, label: "workers comp workflow action" },
  { pattern: /dispatchNotification/, label: "stakeholder notification dispatch" },
]);

const indexTs = read("apps/backend/src/index.ts");
contains("apps/backend/src/index.ts", indexTs, [
  { pattern: /registerSafetyIncidentFullReportRoutes/, label: "full report routes import + register" },
]);

const docs = read("docs/specs/gap-36-driver-pwa-incident-full.md");
contains("docs/specs/gap-36-driver-pwa-incident-full.md", docs, [
  { pattern: /GAP-36/, label: "GAP-36 identifier" },
  { pattern: /WF-048/, label: "WF-048 reference" },
  { pattern: /full-report/, label: "full-report endpoint docs" },
]);

const blockManifest = read(".block-ready/GAP-36.json");
contains(".block-ready/GAP-36.json", blockManifest, [
  { pattern: /"block_id"\s*:\s*"GAP-36"/, label: "GAP-36 block id" },
  { pattern: /verify:driver-pwa-incident-full/, label: "verify gate in manifest" },
]);

const packageJson = read("package.json");
contains("package.json", packageJson, [
  { pattern: /verify:driver-pwa-incident-full/, label: "npm script for verify gate" },
]);

const ci = read(".github/workflows/ci.yml");
contains(".github/workflows/ci.yml", ci, [
  { pattern: /verify:driver-pwa-incident-full/, label: "CI workflow runs verify gate" },
]);

if (failures.length > 0) {
  console.error("verify:driver-pwa-incident-full — FAILED");
  for (const entry of failures) {
    console.error(`  ✗ ${entry}`);
  }
  process.exit(1);
}

console.log("verify:driver-pwa-incident-full — OK");

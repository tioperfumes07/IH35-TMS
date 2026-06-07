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

const migration = read("db/migrations/0123_p6_pre_ledger_drift_reconciliation.sql");
contains("db/migrations/0123_p6_pre_ledger_drift_reconciliation.sql", migration, [
  { pattern: /CREATE TABLE IF NOT EXISTS safety\.dot_inspections/, label: "dot_inspections table" },
  { pattern: /outcome TEXT NOT NULL CHECK \(outcome IN \('PASS','WARNING','OOS'\)\)/, label: "inspection outcome enum" },
]);

const routes = read("apps/backend/src/routes/safety/dot-inspections.ts");
contains("apps/backend/src/routes/safety/dot-inspections.ts", routes, [
  { pattern: /\/api\/v1\/safety\/dot-inspections\/clean-rate/, label: "clean-rate route" },
  { pattern: /clean_rate_percent/, label: "clean_rate_percent response field" },
  { pattern: /trailing_months/, label: "trailing_months response field" },
  { pattern: /outcome <> 'OOS'/, label: "clean inspection SQL filter" },
  { pattern: /make_interval\(months => \$2\)/, label: "12-month trailing window" },
]);

read("apps/frontend/src/pages/safety/tabs/DOTInspectionsTab.tsx");

const badge = read("apps/frontend/src/components/safety/InspectionScoreBadge.tsx");
contains("apps/frontend/src/components/safety/InspectionScoreBadge.tsx", badge, [
  { pattern: /InspectionScoreBadge/, label: "badge component export" },
  { pattern: /dot-inspections\/clean-rate/, label: "clean-rate API call" },
  { pattern: /emerald-100/, label: "green badge state" },
  { pattern: /amber-100/, label: "amber badge state" },
  { pattern: /red-100/, label: "red badge state" },
]);

const packageJson = read("package.json");
contains("package.json", packageJson, [
  { pattern: /"verify:dot-inspection-history": "node scripts\/verify-dot-inspection-history\.mjs"/, label: "verify npm script" },
]);

const ci = read(".github/workflows/ci.yml");
contains(".github/workflows/ci.yml", ci, [
  { pattern: /npm run verify:dot-inspection-history/, label: "CI verify step" },
]);

const perBlockManifest = read(".block-ready/GAP-84-DOT-INSPECTION-GAP-CLOSE.json");
contains(".block-ready/GAP-84-DOT-INSPECTION-GAP-CLOSE.json", perBlockManifest, [
  { pattern: /GAP-84-DOT-INSPECTION-GAP-CLOSE/, label: "GAP-84 per-block manifest" },
  { pattern: /verify:dot-inspection-history/, label: "verify extra gate in per-block manifest" },
  { pattern: /InspectionScoreBadge\.tsx/, label: "badge component in allowed_files" },
]);

if (failures.length > 0) {
  console.error("verify:dot-inspection-history — FAILED");
  for (const entry of failures) {
    console.error(`  ✗ ${entry}`);
  }
  process.exit(1);
}

console.log("verify:dot-inspection-history — OK");

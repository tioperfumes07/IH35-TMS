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

const service = read("apps/backend/src/safety-officer/role-views/safety-home.service.ts");
function certFreshnessScopeFailures(source) {
  return [
    "driver_company_authorizations safety_home_cert_stale_dca",
    "safety_home_cert_stale_dca.driver_id = d.id",
    "safety_home_cert_stale_dca.company_id = $1::uuid",
    "safety_home_cert_stale_dca.is_authorized = true",
    "safety_home_cert_stale_dca.deactivated_at IS NULL",
  ].filter((token) => !source.includes(token));
}
contains("apps/backend/src/safety-officer/role-views/safety-home.service.ts", service, [
  { pattern: /getSafetyHomeData/, label: "getSafetyHomeData export" },
  { pattern: /open_dvir_major_defects/, label: "DVIR defects KPI" },
  { pattern: /hos_violations_today/, label: "HOS violations KPI" },
  { pattern: /expiring_certs_30d/, label: "expiring certs KPI" },
  { pattern: /severity_rank/, label: "alerts sorted by severity" },
]);
for (const token of certFreshnessScopeFailures(service)) {
  fail(`apps/backend/src/safety-officer/role-views/safety-home.service.ts: missing cert freshness scope ${token}`);
}

const routes = read("apps/backend/src/safety-officer/role-views/routes.ts");
contains("apps/backend/src/safety-officer/role-views/routes.ts", routes, [
  { pattern: /\/api\/safety-officer\/role-home/, label: "role-home route" },
  { pattern: /registerSafetyOfficerRoleHomeRoutes/, label: "routes register export" },
]);

read("apps/backend/src/safety-officer/role-views/__tests__/safety-home.test.ts");

const indexTs = read("apps/backend/src/index.ts");
contains("apps/backend/src/index.ts", indexTs, [
  { pattern: /registerSafetyOfficerRoleHomeRoutes/, label: "safety officer routes registered in index" },
]);

const homePage = read("apps/frontend/src/pages/home/HomePage.tsx");
contains("apps/frontend/src/pages/home/HomePage.tsx", homePage, [
  { pattern: /SafetyHome/, label: "Safety role branch" },
  { pattern: /case "Safety"/, label: "Safety case in role router" },
]);

const safetyHome = read("apps/frontend/src/pages/home/roles/SafetyHome.tsx");
contains("apps/frontend/src/pages/home/roles/SafetyHome.tsx", safetyHome, [
  { pattern: /SafetyKpiBar/, label: "SafetyKpiBar render" },
  { pattern: /SafetyAlertsPanel/, label: "SafetyAlertsPanel render" },
  { pattern: /fetchSafetyOfficerRoleHome/, label: "role-home API fetch" },
]);

read("apps/frontend/src/components/home/SafetyKpiBar.tsx");
read("apps/frontend/src/components/home/SafetyAlertsPanel.tsx");

const docs = read("docs/specs/gap-68-safety-officer-home-view.md");
contains("docs/specs/gap-68-safety-officer-home-view.md", docs, [
  { pattern: /GAP-68/, label: "GAP-68 identifier" },
  { pattern: /api\/safety-officer\/role-home/, label: "route documented" },
]);

const manifest = read(".block-ready/GAP-68-SAFETY-OFFICER-HOME.json");
contains(".block-ready/GAP-68-SAFETY-OFFICER-HOME.json", manifest, [
  { pattern: /GAP-68-SAFETY-OFFICER-HOME/, label: "GAP-68 block id in manifest" },
  { pattern: /verify:safety-officer-home/, label: "verify gate in manifest" },
]);

const pkg = read("package.json");
contains("package.json", pkg, [
  { pattern: /verify:safety-officer-home/, label: "npm script for verify gate" },
]);

const ci = read(".github/workflows/ci.yml");
contains(".github/workflows/ci.yml", ci, [
  { pattern: /verify:safety-officer-home/, label: "CI workflow runs verify gate" },
]);

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["authorization table", "driver_company_authorizations safety_home_cert_stale_dca", "drivers safety_home_cert_stale_dca"],
    ["authorization company", "safety_home_cert_stale_dca.company_id = $1::uuid", "safety_home_cert_stale_dca.company_id = d.operating_company_id"],
    ["authorization active", "safety_home_cert_stale_dca.is_authorized = true", "safety_home_cert_stale_dca.is_authorized = false"],
    ["authorization lifecycle", "safety_home_cert_stale_dca.deactivated_at IS NULL", "safety_home_cert_stale_dca.deactivated_at IS NOT NULL"],
  ];
  for (const [name, before, after] of mutations) {
    const mutated = service.replace(before, after);
    if (mutated === service || certFreshnessScopeFailures(mutated).length === 0) {
      console.error(`verify:safety-officer-home --selftest FAILED: ${name} mutation escaped`);
      process.exit(1);
    }
  }
  console.log(`verify:safety-officer-home --selftest OK — ${mutations.length}/${mutations.length} mutations detected`);
  process.exit(0);
}

if (failures.length > 0) {
  console.error("verify:safety-officer-home — FAILED");
  for (const entry of failures) {
    console.error(`  ✗ ${entry}`);
  }
  process.exit(1);
}

console.log("verify:safety-officer-home — OK");

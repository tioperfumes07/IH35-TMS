#!/usr/bin/env node
// GAP-42 — IFTA 4-step quarterly preparer + Owner-only WF-064 confirmation
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const failures = [];

/**
 * LEAD 443.134 AJK-13 — a re-prepare never modifies an approved / filed return: no UPSERT that resets status / filed_at /
 * confirmation_number; an approved / filed quarter gets a NEW draft version (version + 1, supersedes_filing_uuid); the
 * database refuses changing a filed row (trg_ifta_filing_immutable_once_approved). Pure, for --selftest.
 */
export function ajk13Failures(preparerSrc, versionsMigrationSrc) {
  const out = [];
  if (/ON CONFLICT \(operating_company_id, quarter\)[\s\S]{0,200}DO UPDATE/.test(preparerSrc))
    out.push("AJK-13 prepareFiling UPSERTs on (company, quarter) — a filed / approved return is reset to draft");
  if (/filed_at = NULL|confirmation_number = NULL/.test(preparerSrc))
    out.push("AJK-13 prepareFiling clears filed_at / confirmation_number of a return");
  if (!/version, supersedes_filing_uuid/.test(preparerSrc) || !/Number\(latest\.version\) \+ 1/.test(preparerSrc))
    out.push("AJK-13 a re-prepare of an approved / filed quarter is not a new draft version");
  if (!/UNIQUE \(operating_company_id, quarter, version\)/.test(versionsMigrationSrc))
    out.push("AJK-13 the versions migration does not key filings by (company, quarter, version)");
  if (!/CREATE TRIGGER trg_ifta_filing_immutable_once_approved BEFORE UPDATE/.test(versionsMigrationSrc) || !/OLD\.status = 'filed'/.test(versionsMigrationSrc))
    out.push("AJK-13 the database does not refuse changing a filed return");
  return out;
}

if (process.argv.includes("--selftest")) {
  const prep = fs.readFileSync(path.join(ROOT, "apps/backend/src/reports/ifta/quarterly-preparer.service.ts"), "utf8");
  const mig = fs.readFileSync(path.join(ROOT, "db/migrations/202615910700_ifta_filing_versions_filed_immutable.sql"), "utf8");
  const cases = [
    ["real sources pass", ajk13Failures(prep, mig).length === 0],
    ["the old reset-UPSERT is refused", ajk13Failures(prep + "\nON CONFLICT (operating_company_id, quarter)\n DO UPDATE SET filed_at = NULL", mig).length > 0],
    ["no new version on re-prepare is refused", ajk13Failures(prep.replace("Number(latest.version) + 1", "1"), mig).length > 0],
    ["no DB immutability trigger is refused", ajk13Failures(prep, mig.replace("CREATE TRIGGER trg_ifta_filing_immutable_once_approved BEFORE UPDATE", "-- gone")).length > 0],
  ];
  const bad = cases.filter(([, ok]) => !ok);
  for (const [name, ok] of cases) console.log(`  ${ok ? "ok" : "FAIL"}  ${name}`);
  console.log(bad.length ? "verify:ifta-quarterly-preparer --selftest FAIL" : `verify:ifta-quarterly-preparer --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad.length ? 1 : 0);
}

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

const migration = read("db/migrations/202606080205_ifta_filings.sql");
contains("db/migrations/202606080205_ifta_filings.sql", migration, [
  { pattern: /CREATE SCHEMA IF NOT EXISTS reports/, label: "reports schema" },
  { pattern: /reports\.ifta_filings/, label: "ifta_filings table" },
  { pattern: /ENABLE ROW LEVEL SECURITY/, label: "RLS enabled" },
  { pattern: /TO ih35_app/, label: "ih35_app grants" },
  { pattern: /owner_approved/, label: "owner_approved status" },
]);

const ratesFile = read("apps/backend/src/ifta/ifta-tax-rates.json");
if (ratesFile && !ratesFile.includes("iftach.org")) {
  fail("ifta-tax-rates.json must cite iftach.org source (no hardcoded rates in services)");
}

const preparerService = read("apps/backend/src/reports/ifta/quarterly-preparer.service.ts");
contains("apps/backend/src/reports/ifta/quarterly-preparer.service.ts", preparerService, [
  { pattern: /from "\.\.\/\.\.\/ifta\/ifta-tax-rates\.json"/, label: "catalog import via relative path" },
  { pattern: /from "\.\.\/\.\.\/ifta\/ifta-tax-calculator\.js"/, label: "tax calculator reuse" },
  { pattern: /ownerApproveFiling/, label: "owner approve service" },
  { pattern: /reports\.ifta_filings/, label: "ifta_filings persistence" },
]);

for (const f of ajk13Failures(preparerService, read("db/migrations/202615910700_ifta_filing_versions_filed_immutable.sql"))) fail(f);

const routes = read("apps/backend/src/reports/ifta/routes.ts");
contains("apps/backend/src/reports/ifta/routes.ts", routes, [
  { pattern: /\/api\/v1\/reports\/ifta\/prepare/, label: "prepare route" },
  { pattern: /\/api\/v1\/reports\/ifta\/draft\/:uuid\/owner-approve/, label: "owner-approve route" },
  { pattern: /owner_only/, label: "owner-only RBAC" },
  { pattern: /wf064_confirmation_required/, label: "WF-064 confirmation enforcement" },
  { pattern: /registerReportsIftaRoutes/, label: "route register export" },
]);

read("apps/backend/src/reports/ifta/__tests__/mileage-aggregator.test.ts");
read("apps/backend/src/reports/ifta/__tests__/fuel-aggregator.test.ts");
read("apps/backend/src/reports/ifta/__tests__/quarterly-preparer.test.ts");

const indexTs = read("apps/backend/src/reports/index.ts");
contains("apps/backend/src/reports/index.ts", indexTs, [
  { pattern: /registerReportsIftaRoutes/, label: "routes wired in reports index" },
]);

const iftaPreparer = read("apps/frontend/src/pages/reports/tax-regulatory/IftaPreparer.tsx");
contains("apps/frontend/src/pages/reports/tax-regulatory/IftaPreparer.tsx", iftaPreparer, [
  { pattern: /StepWizard/, label: "StepWizard host" },
  { pattern: /ownerApproveIftaFiling/, label: "owner approve API wired" },
]);

const stepWizard = read("apps/frontend/src/components/reports/ifta/StepWizard.tsx");
contains("apps/frontend/src/components/reports/ifta/StepWizard.tsx", stepWizard, [
  { pattern: /Step1MileageReview/, label: "step 1 component" },
  { pattern: /Step2FuelReview/, label: "step 2 component" },
  { pattern: /Step3JurisdictionCalc/, label: "step 3 component" },
  { pattern: /Step4FinalReview/, label: "step 4 component" },
  { pattern: /data-ifta-step-wizard/, label: "wizard marker" },
]);

for (const stepFile of [
  "apps/frontend/src/components/reports/ifta/Step1MileageReview.tsx",
  "apps/frontend/src/components/reports/ifta/Step2FuelReview.tsx",
  "apps/frontend/src/components/reports/ifta/Step3JurisdictionCalc.tsx",
  "apps/frontend/src/components/reports/ifta/Step4FinalReview.tsx",
]) {
  const src = read(stepFile);
  contains(stepFile, src, [{ pattern: /data-ifta-step="/, label: "step render marker" }]);
}

const step4 = read("apps/frontend/src/components/reports/ifta/Step4FinalReview.tsx");
contains("apps/frontend/src/components/reports/ifta/Step4FinalReview.tsx", step4, [
  { pattern: /data-ifta-wf064-trigger/, label: "owner-approve lightning trigger" },
  { pattern: /data-ifta-wf064-confirm-modal/, label: "2-step confirm modal" },
  { pattern: /APPROVE/, label: "typed APPROVE phrase" },
  { pattern: /isOwner/, label: "owner role gate in UI" },
  { pattern: /⚡/, label: "lightning-bolt icon" },
]);

const manifest = read("apps/frontend/src/routes/manifest.tsx");
contains("apps/frontend/src/routes/manifest.tsx", manifest, [
  { pattern: /\/reports\/ifta-preparer/, label: "/reports/ifta-preparer route" },
  { pattern: /IftaPreparer/, label: "IftaPreparer page import" },
]);

const pkg = read("package.json");
contains("package.json", pkg, [
  { pattern: /verify:ifta-quarterly-preparer/, label: "verify script in package.json" },
]);

const ci = read(".github/workflows/ci.yml");
contains(".github/workflows/ci.yml", ci, [
  { pattern: /verify:ifta-quarterly-preparer/, label: "verify script in CI" },
]);

const docs = read("docs/specs/gap-42-ifta-quarterly-preparer.md");
contains("docs/specs/gap-42-ifta-quarterly-preparer.md", docs, [
  { pattern: /GAP-42/, label: "GAP-42 identifier" },
  { pattern: /WF-064/, label: "WF-064 citation" },
  { pattern: /iftach\.org/, label: "rate source URL" },
]);

if (failures.length > 0) {
  console.error("verify:ifta-quarterly-preparer — FAILED");
  for (const entry of failures) {
    console.error(`  x ${entry}`);
  }
  process.exit(1);
}

console.log("verify:ifta-quarterly-preparer — OK");

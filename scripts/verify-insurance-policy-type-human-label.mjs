#!/usr/bin/env node
/**
 * LV-INSURANCE-POLICY-TYPE-RAW-CODE — policy list/detail must resolve the canonical
 * insurance.type_catalog human name under the same company scope instead of painting `auto_liability`.
 *
 * Usage:
 *   node scripts/verify-insurance-policy-type-human-label.mjs
 *   node scripts/verify-insurance-policy-type-human-label.mjs --selftest
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const FILES = {
  routes: "apps/backend/src/insurance/policy.routes.ts",
  api: "apps/frontend/src/api/insurance.ts",
  list: "apps/frontend/src/pages/insurance/PoliciesList.tsx",
  detail: "apps/frontend/src/pages/insurance/PolicyDetail.tsx",
  gaps: "apps/frontend/src/pages/insurance/CoverageGapDashboard.tsx",
  vendor: "apps/frontend/src/components/insurance/VendorInsurancePoliciesReverseSection.tsx",
  vehicle: "apps/frontend/src/components/vehicle-profile/InsuranceSummarySection.tsx",
  helper: "apps/frontend/src/lib/insurance-type-label.ts",
  completion: "docs/module-completion/insurance.json",
  board: "docs/audit/GUARD-WORKORDERS.md",
};

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function audit(sources) {
  const failures = [];
  const { routes, api, list, detail, gaps, vendor, vehicle, helper, completion, board } = sources;
  const scopedCatalogJoin = /LEFT JOIN insurance\.type_catalog tc[\s\S]*?tc\.id = p\.coverage_type_id[\s\S]*?tc\.tenant_id = p\.tenant_id/;
  if ((routes.match(new RegExp(scopedCatalogJoin.source, "g")) ?? []).length < 2) {
    failures.push("policy list and detail must each resolve type names through the same-company catalog FK");
  }
  if ((routes.match(/tc\.name AS coverage_type_name/g) ?? []).length < 2) {
    failures.push("policy list and detail serializers must expose coverage_type_name");
  }
  if (!/coverage_type_name\?:\s*string\s*\|\s*null/.test(api)) {
    failures.push("InsurancePolicy must type the canonical coverage_type_name response");
  }
  if (!/typesQuery\.data\?\.find\(\(entry\) => entry\.code === policy\.coverage_type\)\?\.name/.test(list)) {
    failures.push("PoliciesList must resolve the catalog name by canonical coverage code");
  }
  if (!/typesQuery\.isError \? undefined : typesQuery\.data\?\.find/.test(list)) failures.push("policy list must not resolve labels from a failed retained catalog");
  if (!/render:\s*\(p:\s*InsurancePolicy\)\s*=>\s*coverageTypeName\(p\)/.test(list)) {
    failures.push("PoliciesList Type column must render the resolved human label");
  }
  if (/key:\s*"coverage_type",\s*label:\s*"Type",\s*sortable:\s*true\s*}/.test(list)) {
    failures.push("PoliciesList must not fall back to DataTable's raw coverage_type code renderer");
  }
  if (!/listInsuranceTypeCatalog/.test(detail) || !/typesQuery\.data\?\.find\(\(entry\) => entry\.code === policy\.coverage_type\)\?\.name/.test(detail)) {
    failures.push("PolicyDetail must resolve the same canonical type catalog label");
  }
  if (!/typesQuery\.isError \? undefined : typesQuery\.data\?\.find/.test(detail)) failures.push("policy detail must not resolve labels from a failed retained catalog");
  if (/subtitle=\{`\$\{policy\.insurer_name} · \$\{policy\.coverage_type} ·/.test(detail)) {
    failures.push("PolicyDetail subtitle must not render the raw coverage_type code");
  }
  if (!/subtitle=\{`\$\{policy\.insurer_name} · \$\{coverageTypeName} · \$\{policy\.status}`}/.test(detail)) {
    failures.push("PolicyDetail subtitle must render coverageTypeName");
  }
  if (!/export function insuranceTypeLabel/.test(helper) || !/split\("_"\)/.test(helper)) {
    failures.push("shared insuranceTypeLabel must humanize storage codes when a catalog name is unavailable");
  }
  if (!/listInsuranceTypeCatalog/.test(gaps) || !/new Map<string, string>/.test(gaps)) {
    failures.push("CoverageGapDashboard must read and index the company-scoped Type Catalog");
  }
  if ((gaps.match(/missingTypeLabels\(row\.missing_types, typeNameByCode\)/g) ?? []).length !== 2) {
    failures.push("both coverage-gap tables must render human missing-type labels");
  }
  if (/row\.missing_types\.join\(/.test(gaps)) {
    failures.push("coverage-gap tables must not render raw missing-type codes");
  }
  if (!/insuranceTypeLabel\(policy\.coverage_type, policy\.coverage_type_name\)/.test(vendor)) {
    failures.push("vendor reverse policies must render the canonical type name");
  }
  if (/\{policy\.coverage_type}\s*· expires/.test(vendor)) {
    failures.push("vendor reverse policies must not render the raw type code");
  }
  if (!/insuranceTypeLabel\(policy\.coverage_type, null\)/.test(vehicle)) {
    failures.push("vehicle insurance summary must use the shared type-label contract");
  }
  const completionJson = JSON.parse(completion);
  for (const id of ["INS-T01", "INS-T03"]) {
    const item = completionJson.items.find((entry) => entry.id === id);
    const evidence = String(item?.evidence ?? "");
    if (!item?.prod_verified || !item?.live_verified_sha || !/PASS/.test(evidence) || !/Auto Liability/.test(evidence) || /auto_liability/.test(evidence)) {
      failures.push(`${id} must retain bound Live evidence with human labels and no raw storage code`);
    }
  }
  if (!/FIXED DEPLOYED \(Codex Live 2026-08-16\):\*\* `LV-INSURANCE-LEGACY-FRONTEND-BUNDLE-BEHIND-BACKEND`/.test(board)) {
    failures.push("insurance split-deploy blocker must remain closed with exact deployed evidence");
  }
  return failures;
}

const real = Object.fromEntries(Object.entries(FILES).map(([key, rel]) => [key, read(rel)]));

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["missing company predicate", { ...real, routes: real.routes.replaceAll("AND tc.tenant_id = p.tenant_id", "") }],
    ["missing serializer label", { ...real, routes: real.routes.replaceAll("tc.name AS coverage_type_name", "p.coverage_type AS coverage_type_name") }],
    ["raw list renderer", { ...real, list: real.list.replace('render: (p: InsurancePolicy) => coverageTypeName(p)', 'render: (p: InsurancePolicy) => p.coverage_type') }],
    ["list cached catalog survives error", { ...real, list: real.list.replace("typesQuery.isError ? undefined : typesQuery.data?.find", "false ? undefined : typesQuery.data?.find") }],
    ["raw detail subtitle", { ...real, detail: real.detail.replace("${coverageTypeName}", "${policy.coverage_type}") }],
    ["detail cached catalog survives error", { ...real, detail: real.detail.replace("typesQuery.isError ? undefined : typesQuery.data?.find", "false ? undefined : typesQuery.data?.find") }],
    ["raw uncovered labels", { ...real, gaps: real.gaps.replace("missingTypeLabels(row.missing_types, typeNameByCode)", 'row.missing_types.join(", ")') }],
    ["raw mismatched labels", { ...real, gaps: real.gaps.replaceAll("missingTypeLabels(row.missing_types, typeNameByCode)", 'row.missing_types.join(", ")') }],
    ["raw vendor reverse label", { ...real, vendor: real.vendor.replace("insuranceTypeLabel(policy.coverage_type, policy.coverage_type_name)", "policy.coverage_type") }],
    ["missing shared humanizer", { ...real, helper: real.helper.replace('split("_")', 'split(" ")') }],
    ["lost exact Live verification", { ...real, completion: real.completion.replace('"id": "INS-T01"', '"id": "INS-T01-REGRESSED"') }],
    ["lost bound Live SHA", { ...real, completion: real.completion.replace('"live_verified_sha": "ed4e2f2"', '"live_verified_sha": ""') }],
    ["raw code returned to evidence", { ...real, completion: real.completion.replace("Auto Liability", "auto_liability") }],
    ["reopened split-deploy blocker", { ...real, board: real.board.replace("FIXED DEPLOYED (Codex Live 2026-08-16):** `LV-INSURANCE-LEGACY-FRONTEND-BUNDLE-BEHIND-BACKEND`", "OPEN HANDOFF (Codex Live 2026-08-16):** `LV-INSURANCE-LEGACY-FRONTEND-BUNDLE-BEHIND-BACKEND`") }],
  ];
  const missed = mutations.filter(([, sources]) => audit(sources).length === 0).map(([name]) => name);
  if (audit(real).length || missed.length) {
    for (const failure of [...audit(real).map((x) => `real tree: ${x}`), ...missed.map((x) => `mutation not detected: ${x}`)]) {
      console.error(`  ✗ verify-insurance-policy-type-human-label: ${failure}`);
    }
    process.exit(1);
  }
  console.log(`verify-insurance-policy-type-human-label selftest PASS — ${mutations.length}/${mutations.length} planted defects detected`);
  process.exit(0);
}

const failures = audit(real);
if (failures.length) {
  for (const failure of failures) console.error(`  ✗ verify-insurance-policy-type-human-label: ${failure}`);
  process.exit(1);
}
console.log("verify-insurance-policy-type-human-label PASS — all policy/gap/reverse consumers render catalog human labels");

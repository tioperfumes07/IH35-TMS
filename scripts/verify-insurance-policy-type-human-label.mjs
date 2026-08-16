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
};

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function audit(sources) {
  const failures = [];
  const { routes, api, list, detail } = sources;
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
  if (!/render:\s*\(p:\s*InsurancePolicy\)\s*=>\s*coverageTypeName\(p\)/.test(list)) {
    failures.push("PoliciesList Type column must render the resolved human label");
  }
  if (/key:\s*"coverage_type",\s*label:\s*"Type",\s*sortable:\s*true\s*}/.test(list)) {
    failures.push("PoliciesList must not fall back to DataTable's raw coverage_type code renderer");
  }
  if (!/listInsuranceTypeCatalog/.test(detail) || !/typesQuery\.data\?\.find\(\(entry\) => entry\.code === policy\.coverage_type\)\?\.name/.test(detail)) {
    failures.push("PolicyDetail must resolve the same canonical type catalog label");
  }
  if (/subtitle=\{`\$\{policy\.insurer_name} · \$\{policy\.coverage_type} ·/.test(detail)) {
    failures.push("PolicyDetail subtitle must not render the raw coverage_type code");
  }
  if (!/subtitle=\{`\$\{policy\.insurer_name} · \$\{coverageTypeName} · \$\{policy\.status}`}/.test(detail)) {
    failures.push("PolicyDetail subtitle must render coverageTypeName");
  }
  return failures;
}

const real = Object.fromEntries(Object.entries(FILES).map(([key, rel]) => [key, read(rel)]));

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["missing company predicate", { ...real, routes: real.routes.replaceAll("AND tc.tenant_id = p.tenant_id", "") }],
    ["missing serializer label", { ...real, routes: real.routes.replaceAll("tc.name AS coverage_type_name", "p.coverage_type AS coverage_type_name") }],
    ["raw list renderer", { ...real, list: real.list.replace('render: (p: InsurancePolicy) => coverageTypeName(p)', 'render: (p: InsurancePolicy) => p.coverage_type') }],
    ["raw detail subtitle", { ...real, detail: real.detail.replace("${coverageTypeName}", "${policy.coverage_type}") }],
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
console.log("verify-insurance-policy-type-human-label PASS — list/detail resolve same-company catalog human labels");

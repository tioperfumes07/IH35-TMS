#!/usr/bin/env node
import fs from "node:fs";

const FILE = "apps/backend/src/insurance/type-catalog.routes.ts";
const source = fs.readFileSync(FILE, "utf8");

function failures(candidate) {
  const route = candidate.slice(candidate.indexOf('/api/v1/insurance/type-catalog"'));
  const checks = [
    ["insert identity", /const catalogType = result\.rows\[0\][\s\S]{0,110}if \(!catalogType\?\.id\) throw new Error\("insurance_type_catalog_insert_failed"\)/],
    ["create audit", /appendCrudAudit\([\s\S]{0,120}"insurance\.type_catalog\.created"/],
    ["canonical resource", /resource_type: "insurance\.type_catalog"[\s\S]{0,80}resource_id: catalogType\.id/],
    ["company and vocabulary", /operating_company_id: body\.operating_company_id[\s\S]{0,80}code: body\.code/],
    ["proven response row", /return catalogType;/],
  ];
  return checks.filter(([, pattern]) => !pattern.test(route)).map(([label]) => label);
}

const problems = failures(source);
if (problems.length) {
  console.error(`verify-insurance-type-catalog-create-truth FAILED:\n${problems.map((p) => ` - ${p}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ['if (!catalogType?.id) throw new Error("insurance_type_catalog_insert_failed");', ""],
    ['"insurance.type_catalog.created"', '"insurance.type_catalog.missing"'],
    ['resource_type: "insurance.type_catalog"', 'resource_type: "insurance.missing"'],
    ["resource_id: catalogType.id", 'resource_id: ""'],
    ["return catalogType;", "return result.rows[0];"],
  ];
  for (const [from, to] of mutations) {
    const changed = source.replace(from, to);
    if (changed === source || failures(changed).length === 0) {
      console.error(`verify-insurance-type-catalog-create-truth selftest mutation escaped: ${from}`);
      process.exit(1);
    }
  }
  console.log(`verify-insurance-type-catalog-create-truth --selftest PASS (${mutations.length}/${mutations.length} planted defects red)`);
  process.exit(0);
}

console.log("verify-insurance-type-catalog-create-truth PASS — type catalog create requires and audits a canonical row");

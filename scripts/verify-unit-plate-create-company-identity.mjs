#!/usr/bin/env node
import fs from "node:fs";
import process from "node:process";

const FILE = "apps/backend/src/mdata/unit-plates.routes.ts";

function inspect(source) {
  const failures = [];
  const create = source.slice(
    source.indexOf('app.post("/api/v1/mdata/units/:id/plates"'),
    source.indexOf('app.patch("/api/v1/mdata/units/:id/plates/:plate_id"'),
  );
  const checks = [
    ["insert-select parent", /INSERT INTO mdata\.unit_plates[\s\S]*?SELECT \$1::uuid, u\.id/],
    ["selected-company ownership", /u\.owner_company_id = \$1::uuid OR u\.currently_leased_to_company_id = \$1::uuid/],
    ["canonical identity", /if \(!created\?\.id\) return null/],
    ["audit identity", /resource_id: created\.id/],
    ["audit company", /operating_company_id: query\.data\.operating_company_id/],
    ["honest parent 404", /if \(!row\) return reply\.code\(404\)\.send\(\{ error: "mdata_unit_not_found" \}\)/],
  ];
  for (const [label, pattern] of checks) if (!pattern.test(create)) failures.push(label);
  if (/INSERT INTO mdata\.unit_plates[\s\S]{0,300}?VALUES/.test(create)) failures.push("bare VALUES insert remains");
  if (/assertUnitScope\(client/.test(create)) failures.push("separate parent precheck remains");
  return failures;
}

const source = fs.readFileSync(FILE, "utf8");
if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("SELECT $1::uuid, u.id", "VALUES ($1::uuid, $2::uuid"),
    source.replace("u.owner_company_id = $1::uuid", "u.owner_company_id IS NOT NULL"),
    source.replace("if (!created?.id) return null;", "// planted"),
    source.replace("resource_id: created.id", "resource_id: null"),
    source.replace("operating_company_id: query.data.operating_company_id", "operating_company_id: null"),
    source.replace('if (!row) return reply.code(404).send({ error: "mdata_unit_not_found" });', "// planted"),
  ];
  const survived = mutations.filter((mutated) => inspect(mutated).length === 0);
  if (survived.length) {
    console.error(`FAIL verify-unit-plate-create-company-identity --selftest: ${survived.length}/${mutations.length} survived`);
    process.exit(1);
  }
  console.log(`PASS verify-unit-plate-create-company-identity --selftest (${mutations.length}/${mutations.length} mutations killed)`);
  process.exit(0);
}

const failures = inspect(source);
if (failures.length) {
  console.error(`FAIL verify-unit-plate-create-company-identity: ${failures.join("; ")}`);
  process.exit(1);
}
console.log("PASS verify-unit-plate-create-company-identity — company-owned/leased unit → canonical plate identity → audit/201");

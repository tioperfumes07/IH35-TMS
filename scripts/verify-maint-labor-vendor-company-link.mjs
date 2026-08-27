#!/usr/bin/env node
import fs from "node:fs";

const file = "apps/backend/src/maintenance/labor.routes.ts";
const source = fs.readFileSync(file, "utf8");

function audit(value) {
  const failures = [];
  if (!/FROM mdata\.vendors[\s\S]{0,160}operating_company_id = \$2::uuid[\s\S]{0,100}deactivated_at IS NULL/.test(value)) failures.push("vendor validator must require active same-company vendor");
  if ((value.match(/laborVendorBelongsToCompany\(client, body\.data\.actor_vendor_id, body\.data\.operating_company_id\)/g) ?? []).length < 2) failures.push("both labor creators must validate actor_vendor_id");
  if ((value.match(/payload\.kind === "invalid_vendor"/g) ?? []).length < 2) failures.push("both labor creators must expose invalid-vendor outcomes");
  if ((value.match(/linked_entity_not_in_operating_company/g) ?? []).length < 2) failures.push("both labor creators must fail loud with stable 400");
  return failures;
}

const failures = audit(source);
if (failures.length) {
  console.error(`verify-maint-labor-vendor-company-link FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("operating_company_id = $2::uuid", "TRUE"),
    source.replace("laborVendorBelongsToCompany(client, body.data.actor_vendor_id, body.data.operating_company_id)", "true"),
    source.replace('payload.kind === "invalid_vendor"', 'payload.kind === "ok"'),
    source.replace("linked_entity_not_in_operating_company", "invalid_link"),
  ];
  for (const planted of mutations) {
    if (audit(planted).length === 0) throw new Error("planted labor vendor-link defect escaped");
  }
  console.log("verify-maint-labor-vendor-company-link SELFTEST PASS — 4/4 planted defects detected");
  process.exit(0);
}

console.log("verify-maint-labor-vendor-company-link PASS — both labor creators reject cross-company vendor links");

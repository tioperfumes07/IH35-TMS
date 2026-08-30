#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const FILE = fileURLToPath(new URL("../apps/backend/src/mdata/unit-aggregate.service.ts", import.meta.url));

function failures(source) {
  const errors = [];
  if (!source.includes("const unitCompanyScope = [")) errors.push("authorized unit company snapshot missing");
  if (!source.includes("unit.owner_company_id ?? null")) errors.push("owner company omitted from snapshot");
  if (!source.includes("unit.currently_leased_to_company_id ?? null")) errors.push("current lessee omitted from snapshot");
  if ((source.match(/operating_company_id IN \(\$2::uuid, \$[34]::uuid, \$[45]::uuid\)/g) ?? []).length !== 4) {
    errors.push("all four telemetry reads must use the authorized unit company snapshot");
  }
  if (/SELECT u\.(?:owner_company_id|currently_leased_to_company_id) FROM mdata\.units u WHERE u\.id = \$1::uuid/.test(source)) {
    errors.push("telemetry must not re-read unit ownership by bare id after authorization");
  }
  return errors;
}

const source = readFileSync(FILE, "utf8");
const errors = failures(source);
if (errors.length) {
  console.error(`verify-unit-aggregate-authorized-company-snapshot FAIL:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("unit.owner_company_id ?? null", "null"),
    source.replace("unit.currently_leased_to_company_id ?? null", "null"),
    source.replace("operating_company_id IN ($2::uuid, $4::uuid, $5::uuid)", "operating_company_id = $2::uuid"),
  ];
  mutations.forEach((mutation, index) => {
    if (failures(mutation).length === 0) {
      console.error(`verify-unit-aggregate-authorized-company-snapshot selftest FAIL mutation ${index + 1}`);
      process.exit(1);
    }
  });
  console.log(`verify-unit-aggregate-authorized-company-snapshot selftest PASS ${mutations.length}/${mutations.length}`);
}

console.log("verify-unit-aggregate-authorized-company-snapshot PASS");

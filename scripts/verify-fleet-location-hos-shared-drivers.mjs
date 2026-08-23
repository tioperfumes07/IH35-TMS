#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(root, "apps/backend/src/telematics/fleet-location-hos.service.ts"), "utf8");

function failures(candidate) {
  const problems = [];
  for (const alias of ["samsara_driver_dca", "load_driver_dca"]) {
    const checks = [
      `FROM mdata.driver_company_authorizations ${alias}`,
      `${alias}.driver_id = d.id`,
      `${alias}.company_id = $1::uuid`,
      `${alias}.is_authorized = true`,
      `${alias}.deactivated_at IS NULL`,
    ];
    for (const check of checks) {
      if (!candidate.includes(check)) problems.push(`${alias} missing ${check}`);
    }
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["Samsara authorization branch", /\s+OR EXISTS \(\n\s+SELECT 1\n\s+FROM mdata\.driver_company_authorizations samsara_driver_dca[\s\S]*?samsara_driver_dca\.deactivated_at IS NULL\n\s+\)/, ""],
    ["load authorization branch", /\s+OR EXISTS \(\n\s+SELECT 1\n\s+FROM mdata\.driver_company_authorizations load_driver_dca[\s\S]*?load_driver_dca\.deactivated_at IS NULL\n\s+\)/, ""],
    ["Samsara active authorization", "samsara_driver_dca.is_authorized = true", "samsara_driver_dca.is_authorized = false"],
    ["load active authorization", "load_driver_dca.is_authorized = true", "load_driver_dca.is_authorized = false"],
    ["Samsara non-deactivated authorization", "samsara_driver_dca.deactivated_at IS NULL", "samsara_driver_dca.deactivated_at IS NOT NULL"],
    ["load non-deactivated authorization", "load_driver_dca.deactivated_at IS NULL", "load_driver_dca.deactivated_at IS NOT NULL"],
  ];
  for (const [name, needle, replacement] of mutations) {
    const mutated = source.replace(needle, replacement);
    if (mutated === source) throw new Error(`selftest mutation did not apply: ${name}`);
    if (failures(mutated).length === 0) throw new Error(`selftest failed to catch: ${name}`);
  }
  console.log(`PASS verify-fleet-location-hos-shared-drivers --selftest (${mutations.length}/${mutations.length})`);
  process.exit(0);
}

const problems = failures(source);
if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log("PASS verify-fleet-location-hos-shared-drivers");

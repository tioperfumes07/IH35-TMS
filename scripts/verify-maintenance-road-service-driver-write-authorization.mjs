#!/usr/bin/env node
/**
 * DRV-F6188-ROAD-SERVICE-CREATE-REJECTS-AUTHORIZED-SHARED-DRIVER — same class as the
 * DRV-F61xx/F62xx sweep. Road-service ticket POST validated an optional selected driver through
 * home-company equality only (`d.operating_company_id = $1`), so an active authorized shared driver
 * — already visible in the corrected GET/picker path (DRV-F6187) — was rejected at submit.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-maintenance-road-service-driver-write-authorization";
const FILE = "apps/backend/src/maintenance/road-service/tickets.routes.ts";

export function collectProblems(src) {
  const problems = [];
  if (
    !/road_service_create_driver_dca\.driver_id = d\.id[\s\S]{0,180}road_service_create_driver_dca\.company_id = \$1::uuid[\s\S]{0,180}road_service_create_driver_dca\.is_authorized = true[\s\S]{0,180}road_service_create_driver_dca\.deactivated_at IS NULL/.test(
      src
    )
  ) {
    problems.push(`${FILE}: road-service ticket create driver_ok must admit home-company OR active mdata.driver_company_authorizations, not company equality alone`);
  }
  return problems;
}

const good = `
  WHERE d.id = $4::uuid
    AND (d.operating_company_id = $1::uuid OR EXISTS (
      SELECT 1 FROM mdata.driver_company_authorizations road_service_create_driver_dca
      WHERE road_service_create_driver_dca.driver_id = d.id
        AND road_service_create_driver_dca.company_id = $1::uuid
        AND road_service_create_driver_dca.is_authorized = true
        AND road_service_create_driver_dca.deactivated_at IS NULL
    ))
`;
const bad = `
  WHERE d.id = $4::uuid AND d.operating_company_id = $1::uuid
`;

if (process.argv.includes("--selftest")) {
  if (collectProblems(good).length) {
    console.error(`${LABEL} --selftest FAIL good`);
    process.exit(1);
  }
  if (collectProblems(bad).length < 1) {
    console.error(`${LABEL} --selftest FAIL bad too weak`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

const src = fs.readFileSync(path.join(ROOT, FILE), "utf8");
const problems = collectProblems(src);
if (problems.length) {
  console.error(`${LABEL}: FAIL\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — road-service ticket create admits authorized shared drivers`);
process.exit(0);

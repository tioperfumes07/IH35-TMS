#!/usr/bin/env node
/**
 * 0441-mod2 — road service ticket → WO must use source_type RS (Roadside Service),
 * not ES (External Shop). Self-test: --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-road-service-source-type-rs";
const INTEGRATION = path.join(ROOT, "apps/backend/src/maintenance/road-service/wo-integration.ts");

export function check(integration) {
  const errors = [];
  if (!integration.includes("createWorkOrderFromRoadServiceTicket")) {
    errors.push("wo-integration.ts must export createWorkOrderFromRoadServiceTicket");
  }
  if (!integration.includes('source_type: "RS"')) {
    errors.push('wo-integration.ts must set source_type: "RS" for road service WOs');
  }
  if (integration.includes('source_type: "ES"')) {
    errors.push('wo-integration.ts must not use source_type: "ES" for road service WOs (ES = External Shop)');
  }
  return errors;
}

if (process.argv.includes("--selftest")) {
  const good = [
    "export async function createWorkOrderFromRoadServiceTicket(",
    'source_type: "RS",',
    'repair_location: "roadside",',
  ].join("\n");
  if (check(good).length) {
    console.error(`${LABEL} --selftest FAILED good`);
    process.exit(1);
  }
  const badEs = [
    "export async function createWorkOrderFromRoadServiceTicket(",
    'source_type: "ES",',
  ].join("\n");
  const badErrors = check(badEs);
  if (badErrors.length !== 2) {
    console.error(`${LABEL} --selftest FAILED bad-ES (expected 2 errors, got ${badErrors.length})`);
    process.exit(1);
  }
  if (!badErrors.some((e) => e.includes("ES"))) {
    console.error(`${LABEL} --selftest FAILED bad-ES (missing ES rejection)`);
    process.exit(1);
  }
  const badMissing = "// no function";
  const missingErrors = check(badMissing);
  if (missingErrors.length !== 2) {
    console.error(`${LABEL} --selftest FAILED missing (expected 2 errors, got ${missingErrors.length})`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest — OK`);
} else {
  if (!fs.existsSync(INTEGRATION)) {
    console.error(`${LABEL} — FAILED\n- missing wo-integration.ts`);
    process.exit(1);
  }
  const integration = fs.readFileSync(INTEGRATION, "utf8");
  const errors = check(integration);
  if (errors.length) {
    console.error(`${LABEL} — FAILED`);
    for (const x of errors) console.error("- " + x);
    process.exit(1);
  }
  console.log(`${LABEL} — OK (road service WO source_type RS)`);
}

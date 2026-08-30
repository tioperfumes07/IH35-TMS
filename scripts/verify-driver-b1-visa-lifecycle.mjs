#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  migration: "db/migrations/202606080930_block14_mexico_ops.sql",
  route: "apps/backend/src/mdata/drivers.routes.ts",
  types: "apps/frontend/src/types/api.ts",
  profile: "apps/frontend/src/pages/DriverDetail.tsx",
};
const REQUIRED = {
  migration: ["has_b1_visa boolean", "b1_visa_number text", "b1_visa_expires_date date"],
  route: [
    "syncCanonicalB1VisaColumns",
    "SET has_b1_visa = ${B1_VISA_TYPE_SQL}",
    "b1_visa_number = CASE WHEN ${B1_VISA_TYPE_SQL} THEN visa_number ELSE NULL END",
    "b1_visa_expires_date = CASE WHEN ${B1_VISA_TYPE_SQL} THEN visa_expires_at ELSE NULL END",
    "AND operating_company_id = $2::uuid",
    "await syncCanonicalB1VisaColumns(client, String(row.id), String(resolvedOperatingCompanyId))",
    '"visa_type" in b || "visa_number" in b || "visa_expires_at" in b',
    "CASE WHEN has_b1_visa THEN COALESCE(NULLIF(visa_type, ''), 'B1')",
    "CASE WHEN has_b1_visa THEN COALESCE(visa_number, b1_visa_number)",
    "CASE WHEN has_b1_visa THEN COALESCE(visa_expires_at, b1_visa_expires_date)",
  ],
  types: ["has_b1_visa: boolean", "b1_visa_number: string | null", "b1_visa_expires_date: string | null"],
  profile: ['data-testid="driver-b1-visa-status"', 'driver.has_b1_visa ? "On file" : "Not on file"'],
};

function verify(sources) {
  const missing = [];
  for (const [name, tokens] of Object.entries(REQUIRED)) {
    for (const token of tokens) if (!sources[name].includes(token)) missing.push(`${name}: ${token}`);
  }
  return missing;
}
const sources = Object.fromEntries(Object.entries(FILES).map(([name, rel]) => [name, readFileSync(join(ROOT, rel), "utf8")]));
if (process.argv.includes("--selftest")) {
  let count = 0;
  for (const [name, tokens] of Object.entries(REQUIRED)) {
    for (const token of tokens) {
      const mutant = { ...sources, [name]: sources[name].replaceAll(token, "__PLANTED_REMOVED__") };
      if (verify(mutant).length === 0) throw new Error(`planted removal survived: ${name}: ${token}`);
      count += 1;
    }
  }
  console.log(`verify-driver-b1-visa-lifecycle --selftest PASS ${count}/${count}`);
  process.exit(0);
}
const missing = verify(sources);
if (missing.length) {
  console.error(`verify-driver-b1-visa-lifecycle FAIL\n${missing.map((item) => `  - ${item}`).join("\n")}`);
  process.exit(1);
}
console.log("verify-driver-b1-visa-lifecycle PASS — generic visa UI and dedicated B-1 operational columns round-trip together");

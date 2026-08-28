#!/usr/bin/env node
import fs from "node:fs";

const file = "apps/backend/src/telematics/fleet-location-hos.routes.ts";
const source = fs.readFileSync(file, "utf8");

function verify(text) {
  const failures = [];
  if (!text.includes('import { companyBusinessDate } from "../lib/company-business-date.js"')) failures.push("company business-date import missing");
  if (!text.includes("const stamp = companyBusinessDate(asOf)")) failures.push("export stamp is not tied to the request instant in company time");
  if (/const stamp\s*=\s*asOf\.toISOString\(\)\.slice\(0,\s*10\)/.test(text)) failures.push("raw UTC export stamp remains");
  if (!text.includes('filename="fleet-location-hos-${stamp}.xlsx"')) failures.push("business-date stamp is not used in Content-Disposition");
  if (!text.includes("generated_at: asOf.toISOString()")) failures.push("UTC generated-at audit instant was lost");
  return failures;
}

const failures = verify(source);
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("const stamp = companyBusinessDate(asOf)", "const stamp = asOf.toISOString().slice(0, 10)"),
    source.replace('import { companyBusinessDate } from "../lib/company-business-date.js";', ""),
    source.replace('filename="fleet-location-hos-${stamp}.xlsx"', 'filename="fleet-location-hos.xlsx"'),
  ];
  const caught = mutations.filter((mutation) => verify(mutation).length > 0).length;
  if (caught !== mutations.length) { console.error(`selftest caught ${caught}/${mutations.length}`); process.exit(1); }
  console.log(`PASS selftest: ${caught}/${mutations.length} planted regressions caught`);
} else {
  console.log("PASS: Fleet Location + HOS export filename uses the company business date");
}

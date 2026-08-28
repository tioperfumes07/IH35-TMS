#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MDATA = path.join(ROOT, "apps/backend/src/mdata");
function files(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(path.join(dir, entry.name)) : entry.name.endsWith(".ts") && !entry.name.includes(".test.") ? [path.join(dir, entry.name)] : []); }
const RAW = /new Date\(\)\.toISOString\(\)\.slice\(0,\s*10\)/;
export function audit(entries) {
  return entries.filter(({ source }) => RAW.test(source)).map(({ file }) => `${path.relative(ROOT, file)}: raw UTC calendar date must use companyBusinessDate()`);
}
const good = files(MDATA).map((file) => ({ file, source: fs.readFileSync(file, "utf8") }));
if (process.argv.includes("--selftest")) {
  if (audit(good).length) { console.error(audit(good).join("\n")); process.exit(1); }
  const mutated = [...good, { file: path.join(MDATA, "planted.ts"), source: "const today = new Date().toISOString().slice(0, 10);" }];
  if (audit(mutated).length !== 1) { console.error("verify-mdata-business-date-not-utc SELFTEST FAIL"); process.exit(1); }
  console.log("verify-mdata-business-date-not-utc SELFTEST PASS — raw UTC business-date mutation detected"); process.exit(0);
}
const failures = audit(good);
if (failures.length) { console.error(`verify-mdata-business-date-not-utc FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log(`verify-mdata-business-date-not-utc PASS — ${good.length} mdata source files use canonical business dates`);

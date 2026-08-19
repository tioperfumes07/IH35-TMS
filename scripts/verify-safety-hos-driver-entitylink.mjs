#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/frontend/src/pages/safety/tabs/HOSViolationsTab.tsx";
const LABEL = "verify-safety-hos-driver-entitylink";
const src = fs.readFileSync(path.join(ROOT, TARGET), "utf8");
const problems = [];
if (!/EntityLink(?:OrTombstone)? kind=\"driver\"/.test(src)) problems.push("missing EntityLink kind=driver");
if (/render: \(row\) => String\(row\.driver_id/.test(src)) problems.push("raw driver_id string render still present");
if (process.argv.includes("--selftest")) {
  if (problems.length) { console.error("selftest fail on good"); process.exit(1); }
  const bad = src.replace(/EntityLink(?:OrTombstone)? kind=\"driver\"[\s\S]*?\/>/, 'String(row.driver_id ?? "—")');
  if (!/String\(row\.driver_id/.test(bad)) { console.error("fixture"); process.exit(1); }
  console.log(LABEL+" --selftest OK");
  process.exit(0);
}
if (problems.length) { console.error(LABEL+" FAIL", problems); process.exit(1); }
console.log(LABEL+" PASS");

#!/usr/bin/env node
import fs from "node:fs";
import process from "node:process";

let source = fs.readFileSync("apps/backend/src/mdata/drivers.routes.ts", "utf8");
const checks = [
  ["phone constraint", /constraint\.includes\("phone"\)[\s\S]{0,220}identity_user_phone_conflict[\s\S]{0,180}fieldErrors: \{ phone:/],
  ["email constraint", /constraint\.includes\("email"\)[\s\S]{0,220}identity_user_email_conflict[\s\S]{0,180}fieldErrors: \{ email:/],
  ["CURP constraint", /constraint\.includes\("curp"\)[\s\S]{0,220}mdata_driver_curp_conflict[\s\S]{0,180}fieldErrors: \{ curp:/],
  ["INE constraint", /constraint\.includes\("ine"\)[\s\S]{0,220}mdata_driver_ine_conflict[\s\S]{0,180}fieldErrors: \{ ine_number:/],
  ["both 23505 handlers", (text) => (text.match(/code === "23505"\) return .*mapDriverUniqueConflict\(err\)/g) ?? []).length === 2],
  ["retired false CDL claim", (text) => !text.includes("Driver with this CDL already exists")],
];
if (process.argv.includes("--selftest")) {
  source = source.replace('constraint.includes("phone")', 'constraint.includes("not_phone")');
  const rule = checks[0][1];
  if (typeof rule === "function" ? rule(source) : rule.test(source)) process.exit(1);
  console.log("PASS selftest: planted phone-conflict mapping defect detected");
  process.exit(0);
}
const failures = checks.filter(([, rule]) => !(typeof rule === "function" ? rule(source) : rule.test(source))).map(([name]) => name);
if (failures.length) { console.error(`FAIL driver conflict honesty: ${failures.join(", ")}`); process.exit(1); }
console.log(`PASS driver create conflict field honesty ${checks.length}/${checks.length}`);

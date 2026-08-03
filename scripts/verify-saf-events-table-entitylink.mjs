#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELFTEST = process.argv.includes("--selftest");
const TABLE = "apps/frontend/src/pages/safety/components/SafetyEventsTable.tsx";
const PAGE = "apps/frontend/src/pages/safety/SafetyEventsPage.tsx";

function assert(table, page) {
  const problems = [];
  if (!/EntityLink/.test(table) || !/kind=\"driver\"/.test(table) || !/kind=\"unit\"/.test(table)) {
    problems.push(`${TABLE}: Driver/Unit columns must EntityLink`);
  }
  if (/render: \(row\) => String\(row\.driver_full_name/.test(table)) {
    problems.push(`${TABLE}: must not render driver as plain string when id exists`);
  }
  if (!/driver_id:\s*row\.subject_driver_id/.test(page) || !/unit_id:\s*row\.subject_unit_id/.test(page)) {
    problems.push(`${PAGE}: bulkTableRows must pass subject_driver_id / subject_unit_id`);
  }
  if (/subject_driver_name \|\| row\.subject_driver_id/.test(page)) {
    problems.push(`${PAGE}: must not fall back driver label to raw UUID`);
  }
  if (/subject_unit_number \|\| row\.subject_unit_id/.test(page)) {
    problems.push(`${PAGE}: must not fall back unit label to raw UUID`);
  }
  return problems;
}

const table = readFileSync(path.join(ROOT, TABLE), "utf8");
const page = readFileSync(path.join(ROOT, PAGE), "utf8");
if (SELFTEST) {
  const plantedTable = table.replace(/EntityLink/g, "PlainText");
  if (!assert(plantedTable, page).length) {
    console.error("SELFTEST FAIL");
    process.exit(1);
  }
  if (assert(table, page).length) {
    console.error("SELFTEST FAIL live unclean");
    process.exit(1);
  }
  console.log("verify-saf-events-table-entitylink SELFTEST PASS");
  process.exit(0);
}
const problems = assert(table, page);
if (problems.length) {
  console.error("verify-saf-events-table-entitylink FAIL\n" + problems.map((p) => ` - ${p}`).join("\n"));
  process.exit(1);
}
console.log("verify-saf-events-table-entitylink OK");

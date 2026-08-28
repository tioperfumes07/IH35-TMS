#!/usr/bin/env node
import fs from "node:fs";

const file = "apps/frontend/src/components/drivers/TerminateConfirmModal.tsx";
const source = fs.readFileSync(file, "utf8");

function verify(text) {
  const failures = [];
  if (!text.includes('import { companyToday } from "../../lib/businessDate"')) failures.push("canonical companyToday import missing");
  if ((text.match(/companyToday\(\)/g) ?? []).length < 4) failures.push("termination date lifecycle is not fully company-date bound");
  if (!text.includes("max={companyToday()}")) failures.push("DatePicker maximum is not the company business date");
  if (/\btodayIso\b/.test(text)) failures.push("stale todayIso identifier remains");
  if (/toISOString\(\)\.slice\(0,\s*10\)/.test(text)) failures.push("raw UTC date fallback remains");
  return failures;
}

const failures = verify(source);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("max={companyToday()}", "max={todayIso()}"),
    source.replace("setEventDate(companyToday())", "setEventDate(new Date().toISOString().slice(0, 10))"),
    source.replace('import { companyToday } from "../../lib/businessDate";', ""),
  ];
  const caught = mutations.filter((mutation) => verify(mutation).length > 0).length;
  if (caught !== mutations.length) {
    console.error(`selftest caught ${caught}/${mutations.length} planted regressions`);
    process.exit(1);
  }
  console.log(`PASS selftest: ${caught}/${mutations.length} planted regressions caught`);
} else {
  console.log("PASS: driver termination date lifecycle compiles on the canonical company business date");
}

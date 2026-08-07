#!/usr/bin/env node
/**
 * Integrity Reports outlier table must EntityLink driver/unit/vendor — never raw UUID text.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELFTEST = process.argv.includes("--selftest");
const PAGE = "apps/frontend/src/pages/safety/tabs/IntegrityReportsTab.tsx";

function assert(src) {
  const problems = [];
  if (!/EntityLink/.test(src)) problems.push(`${PAGE}: must import/use EntityLink`);
  if (!/kind=\"driver\"/.test(src) || !/kind=\"unit\"/.test(src) || !/kind=\"vendor\"/.test(src)) {
    problems.push(`${PAGE}: Entity column must link driver, unit, and vendor kinds`);
  }
  if (/String\(row\.unit_id\s*\?\?\s*row\.driver_id/.test(src)) {
    problems.push(`${PAGE}: must not stringify raw unit_id/driver_id as the Entity cell`);
  }
  return problems;
}

const live = readFileSync(path.join(ROOT, PAGE), "utf8");
if (SELFTEST) {
  const planted = live.replace(/IntegrityEntityCell[\s\S]*?function IntegrityReportsTab/, "function IntegrityReportsTab")
    .replace(/render: \(row\) => <IntegrityEntityCell row=\{row\} \/>/, 'render: (row) => String(row.unit_id ?? row.driver_id ?? row.vendor_id ?? row.subject_id ?? "—")')
    .replace(/import \{ EntityLink \}[^\n]+\n/, "");
  const caught = assert(planted);
  if (!caught.length) {
    console.error("SELFTEST FAIL — planted raw-UUID cell not caught");
    process.exit(1);
  }
  const ok = assert(live);
  if (ok.length) {
    console.error("SELFTEST FAIL — live unclean:\n" + ok.join("\n"));
    process.exit(1);
  }
  console.log("verify-saf-integrity-reports-entitylink SELFTEST PASS");
  process.exit(0);
}

const problems = assert(live);
if (problems.length) {
  console.error("verify-saf-integrity-reports-entitylink FAIL\n" + problems.map((p) => ` - ${p}`).join("\n"));
  process.exit(1);
}
console.log("verify-saf-integrity-reports-entitylink OK");

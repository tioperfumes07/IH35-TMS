#!/usr/bin/env node
/** LST-F138 — QBO class linkage picker names + PositionHistory/Disputes/AuditTrail human labels. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = [
  "apps/frontend/src/pages/admin/QboVendorLinkagePage.tsx",
  "apps/frontend/src/pages/safety/PositionHistoryPage.tsx",
  "apps/frontend/src/pages/driver/DisputesPage.tsx",
  "apps/frontend/src/pages/audit/AuditTrailPage.tsx",
];
const LABEL = "verify-qbo-class-linkage-human-labels";
const SELFTEST = process.argv.includes("--selftest");

function assertAll(srcs) {
  const problems = [];
  const qbo = srcs[FILES[0]];
  if (!/listClassesForJe/.test(qbo)) problems.push(`${FILES[0]}: missing listClassesForJe`);
  if (!/entityLabel\(classNameById\.get/.test(qbo)) problems.push(`${FILES[0]}: class column still raw id`);
  if (/placeholder="QBO class id"/.test(qbo)) problems.push(`${FILES[0]}: still free-text class id input`);
  if (!/<SelectCombobox[\s\S]*classesQuery\.data\?\.classes/.test(qbo)) {
    problems.push(`${FILES[0]}: class actions not SelectCombobox of catalog`);
  }
  for (const [file, src] of Object.entries(srcs)) {
    if (!/entityLabel\(/.test(src)) problems.push(`${file}: missing entityLabel`);
  }
  const pos = srcs[FILES[1]];
  if (/font-mono text-xs text-gray-900">\{row\.actor_id\}/.test(pos)) {
    problems.push(`${FILES[1]}: actor_id still raw font-mono`);
  }
  return problems;
}

const read = () => Object.fromEntries(FILES.map((f) => [f, fs.readFileSync(path.join(ROOT, f), "utf8")]));

if (SELFTEST) {
  const srcs = read();
  const planted = { ...srcs };
  planted[FILES[0]] = planted[FILES[0]]
    .replace(/entityLabel\(classNameById\.get\(row\.qbo_class_id\),\s*row\.qbo_class_id,\s*"Class"\)/, "row.qbo_class_id")
    .replace(/placeholder=\{?undefined\}?/, 'placeholder="QBO class id"');
  // force raw column
  planted[FILES[0]] = planted[FILES[0]].replace(
    /row\.qbo_class_id \? entityLabel\(classNameById\.get\(row\.qbo_class_id\), row\.qbo_class_id, "Class"\) : "—"/,
    "row.qbo_class_id ?? \"-\"",
  );
  if (!assertAll(planted).length) {
    // plant actor_id too if class plant insufficient
    planted[FILES[1]] = planted[FILES[1]].replace(
      /entityLabel\(null,\s*row\.actor_id,\s*"User"\)/,
      "row.actor_id",
    );
  }
  planted[FILES[0]] = planted[FILES[0]].replace(
    /<SelectCombobox[\s\S]*?<\/SelectCombobox>/,
    '<input placeholder="QBO class id" />',
  );
  if (!assertAll(planted).length) {
    console.error(`${LABEL} SELFTEST FAILED: planted defect not caught`);
    process.exit(1);
  }
  const live = assertAll(srcs);
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${live.join(" | ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assertAll(read());
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);

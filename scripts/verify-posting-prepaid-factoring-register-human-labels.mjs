#!/usr/bin/env node
/** LST-F131 — PostingLineage/Prepaid/FactoringDetail/Abandonment/AccountRegister human labels. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = [
  "apps/frontend/src/pages/accounting/PostingLineagePage.tsx",
  "apps/frontend/src/pages/accounting/PrepaidExpensesPage.tsx",
  "apps/frontend/src/pages/accounting/FactoringDetailPage.tsx",
  "apps/frontend/src/pages/accounting/AbandonmentQueuePage.tsx",
  "apps/frontend/src/pages/accounting/AccountRegisterPage.tsx",
];
const LABEL = "verify-posting-prepaid-factoring-register-human-labels";
const SELFTEST = process.argv.includes("--selftest");

function assertAll(srcs) {
  const problems = [];
  for (const [file, src] of Object.entries(srcs)) {
    if (/\.slice\(0,\s*8\)/.test(src)) problems.push(`${file}: still UUID-slices`);
    if (!/entityLabel\(/.test(src)) problems.push(`${file}: missing entityLabel`);
  }
  return problems;
}

const read = () => Object.fromEntries(FILES.map((f) => [f, fs.readFileSync(path.join(ROOT, f), "utf8")]));

if (SELFTEST) {
  const srcs = read();
  const planted = { ...srcs };
  // ACCT-F5571: real code evolved from entityLabel(null, e.journal_entry_id, "Journal entry") (the
  // original planted-defect target) to entityLabel(e.memo, e.journal_entry_id, "Journal entry") — a
  // more honest label using the entry's real memo when available, entityLabel's own id-fallback
  // otherwise. The old .replace() target no longer matched anything, so the "planted defect" was
  // silently never planted and this selftest was passing on an empty diff. Target the real call site.
  planted[FILES[4]] = planted[FILES[4]].replace(
    /entityLabel\(e\.memo,\s*e\.journal_entry_id,\s*"Journal entry"\)/,
    "e.journal_entry_id.slice(0, 8)",
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

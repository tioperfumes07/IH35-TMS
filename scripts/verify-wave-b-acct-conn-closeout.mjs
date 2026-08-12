#!/usr/bin/env node
/**
 * WAVE-B accounting connectivity closeout — je.create / coa_roles / period+month close.
 *
 * @matrix-built {"modules":["accounting"],"cols":["connectivity"],"leafRe":"^(je\\.create|coa_roles|period_close|month_close)$","task":"WAVE-B-acct-conn-closeout","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-wave-b-acct-conn-closeout.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-wave-b-acct-conn-closeout";

const CHECKS = [
  {
    name: "JE list mounts create modal",
    file: "apps/frontend/src/pages/accounting/ManualJEListPage.tsx",
    pattern: /<ManualJEModal[\s\S]*createOpen/,
  },
  {
    name: "JE create button",
    file: "apps/frontend/src/pages/accounting/ManualJEListPage.tsx",
    pattern: /\+ Create/,
  },
  {
    name: "CoA roles route mounted",
    file: "apps/frontend/src/routes/manifest.tsx",
    pattern: /path="\/accounting\/settings\/coa-roles"[\s\S]*?<CoaRolesPage/,
  },
  {
    name: "CoA roles account ReferenceSelect + createKind",
    file: "apps/frontend/src/pages/accounting/CoaRolesPage.tsx",
    pattern: /createKind="account"/,
  },
  {
    name: "Month close page mounted",
    file: "apps/frontend/src/routes/manifest.tsx",
    pattern: /path="\/accounting\/month-close"[\s\S]*?<MonthClosePage/,
  },
  {
    name: "Period close aliases to month close",
    file: "apps/frontend/src/routes/manifest.tsx",
    pattern: /path="\/accounting\/period-close"[\s\S]*?<Navigate to="\/accounting\/month-close" replace/,
  },
  {
    name: "Month close drills to JE list",
    file: "apps/frontend/src/pages/accounting/MonthClosePage.tsx",
    pattern: /href:\s*"\/accounting\/journal-entries"/,
  },
  {
    name: "Month close drills to AP aging report",
    file: "apps/frontend/src/pages/accounting/MonthClosePage.tsx",
    pattern: /href:\s*`\/reports\/ap-aging/,
  },
];

function checkAll(readFile) {
  const failures = [];
  for (const c of CHECKS) {
    const src = readFile(c.file);
    if (src == null) {
      failures.push(`${c.name}: missing ${c.file}`);
      continue;
    }
    if (!c.pattern.test(src)) failures.push(`${c.name}: shape missing in ${c.file}`);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const fail = checkAll(() => "POISON");
  if (!fail.length) {
    console.error(`${LABEL} --selftest FAIL`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (poison trips ${fail.length})`);
  process.exit(0);
}

const failures = checkAll((rel) => {
  const abs = path.join(ROOT, rel);
  return fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
});
if (failures.length) {
  console.error(`${LABEL} FAIL:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — accounting je.create/coa_roles/period_close/month_close connectivity ratcheted`);

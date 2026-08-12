#!/usr/bin/env node
/**
 * LOAD-LIABILITY-SCENARIO-DISPATCH-HONEST
 * - Load detail/drawers must not claim scoreboard `liability` without driver_liabilities drill
 *   (Driver Pay = driver_bills; Settlement = deductions totals — not liability objects).
 * - Tag customer loads list as scenario.dispatch (Dispatch load process col).
 * - Tag external_fines.list expense (FineDetailDrawer expense JE reverse drill).
 *
 * @matrix-built {"modules":["customers"],"cols":["scenario.dispatch"],"leafRe":"^detail\\.loads$","task":"SCENARIO-DISPATCH-customer-loads","vertical":"column-wave"}
 * @matrix-built {"modules":["safety"],"cols":["expense"],"leafRe":"^external_fines\\.list$","task":"SAFETY-fines-expense-JE","vertical":"column-wave"}
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-load-liability-scenario-dispatch-honest";

const FORBIDDEN_LOAD_LIABILITY = [
  "load.detail",
  "load.drawer.overview",
  "load.drawer.driver_pay",
  "load.drawer.factoring",
  "load.drawer.settlement",
  "load.drawer.pre_settlement",
];

const CHECKS = [
  { name: "customer loads EntityLink", file: "apps/frontend/src/pages/CustomerDetail.tsx", pattern: /kind=["']load["']/ },
  { name: "fine expense JE EntityLink", file: "apps/frontend/src/pages/safety/components/FineDetailDrawer.tsx", pattern: /Expense journal entry/ },
  { name: "fine journal_entry kind", file: "apps/frontend/src/pages/safety/components/FineDetailDrawer.tsx", pattern: /kind=["']journal_entry["']/ },
];

function checkAll(read) {
  const fails = [];
  for (const c of CHECKS) {
    const src = read(c.file);
    if (src == null) fails.push(`missing ${c.file}`);
    else if (!c.pattern.test(src)) fails.push(`${c.name} missing`);
  }
  return fails;
}

if (process.argv.includes("--selftest")) {
  const fail = checkAll(() => "POISON");
  if (!fail.length) {
    console.error(`${LABEL} --selftest FAIL`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

const failures = checkAll((rel) => {
  const abs = path.join(ROOT, rel);
  return fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
});

const dispatch = JSON.parse(
  fs.readFileSync(path.join(ROOT, "docs/specs/scoreboard/modules/dispatch.required.json"), "utf8"),
);
for (const id of FORBIDDEN_LOAD_LIABILITY) {
  const leaf = (dispatch.leaves || []).find((l) => l.id === id);
  if (!leaf) {
    failures.push(`missing dispatch leaf ${id}`);
    continue;
  }
  if ((leaf.required || []).includes("liability")) {
    failures.push(`${id} must NOT require liability`);
  }
}

const drawer = fs.readFileSync(
  path.join(ROOT, "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx"),
  "utf8",
);
if (/driver_liabilit|kind=["']liability["']/.test(drawer)) {
  failures.push("LoadDetailDrawer now has liability drill — re-scope FORBIDDEN_LOAD_LIABILITY");
}

if (failures.length) {
  console.error(`${LABEL} FAIL:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — load liability DROPs + customer scenario.dispatch + fines expense tags`);

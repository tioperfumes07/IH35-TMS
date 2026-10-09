#!/usr/bin/env node
import fs from "node:fs";

const paths = {
  parity: "apps/frontend/src/components/parity/ParityTable.tsx",
  tabs: "apps/frontend/src/components/forms/shared/HoverDropdownNav.css",
  subnav: "apps/frontend/src/pages/accounting/subnav-manifest.ts",
  register: "apps/frontend/src/pages/accounting/AccountRegisterPage.tsx",
  reclassify: "apps/backend/src/accounting/reclassify/reclassify.service.ts",
};

function load() {
  return Object.fromEntries(Object.entries(paths).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));
}

export function check(src) {
  const failures = [];
  if (!/\(w \/ proportionalTotal\) \* 100/.test(src.parity) || !/proportionalMinTable/.test(src.parity)) failures.push("U1 tables must resize with proportional widths and a legibility floor");
  const menu = src.tabs.slice(src.tabs.indexOf('.hover-dropdown-nav ul[role="menubar"]'), src.tabs.indexOf("}", src.tabs.indexOf('.hover-dropdown-nav ul[role="menubar"]')));
  if (!/flex-wrap:\s*wrap/.test(menu) || /min-width:\s*max-content/.test(menu)) failures.push("U2 tabs must remain visible without clipping at narrow widths");
  const liveItems = src.subnav.slice(src.subnav.indexOf("const SUBNAV_ITEMS"), src.subnav.indexOf("] as const;", src.subnav.indexOf("const SUBNAV_ITEMS")));
  if ((liveItems.match(/label:\s*"Expenses(?: List)?"/g) ?? []).length !== 1) failures.push("U4 live accounting subnav must expose exactly one Expenses tab");
  if (!/audit\.row_changes/.test(src.reclassify) || !/expense_number/.test(src.reclassify) || !/AS document_purged/.test(src.reclassify)) failures.push("U22 expense numbers must survive purged-document register rows");
  if (!/headerTitle:\s*"✓ blank = unmatched · C = cleared/.test(src.register) || !/data-b1-cleared-by-match/.test(src.register) || !/Not cleared — click to mark C/.test(src.register)) failures.push("U31 account register must visibly distinguish blank, cleared, and reconciled states");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const live = load();
  const plants = [
    ["U1", { ...live, parity: "fixed pixels" }],
    ["U2", { ...live, tabs: '.hover-dropdown-nav ul[role="menubar"] { flex-wrap: nowrap; min-width: max-content; }' }],
    ["U4", { ...live, subnav: live.subnav.replace('{ label: "Expenses", path: "/accounting/expenses", section: "expenses" },', '{ label: "Expenses List", path: "/accounting/expenses/list", section: "expenses" },\n  { label: "Expenses", path: "/accounting/expenses", section: "expenses" },') }],
    ["U22", { ...live, reclassify: "no audit fallback" }],
    ["U31", { ...live, register: "no cleared status" }],
  ];
  let passed = 0;
  for (const [name, planted] of plants) {
    const caught = check(planted).some((failure) => failure.startsWith(name));
    console.log(`  ${caught ? "PASS" : "FAIL"}  ${name} planted regression rejected`);
    if (caught) passed += 1;
  }
  console.log(`verify-r433-mechanical-u-items --selftest ${passed}/${plants.length}`);
  process.exit(passed === plants.length ? 0 : 1);
}

const failures = check(load());
if (failures.length) {
  console.error(`verify-r433-mechanical-u-items FAIL\n  ${failures.join("\n  ")}`);
  process.exit(1);
}
console.log("verify-r433-mechanical-u-items PASS — U1/U2/U4/U22/U31 remain measurable and visible");

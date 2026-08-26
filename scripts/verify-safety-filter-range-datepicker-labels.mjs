#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const specs = [
  ["apps/frontend/src/components/safety/SafetyDashboardFilter.tsx", ["safety-from-date", "safety-to-date"]],
  ["apps/frontend/src/pages/safety/AccidentsPage.tsx", ["accidents-from-date", "accidents-to-date"]],
  ["apps/frontend/src/pages/safety/IdvrPage.tsx", ["idvr-filter-from", "idvr-filter-to"]],
  ["apps/frontend/src/pages/safety/eld/EldAuditTrailViewer.tsx", ["eld-audit-from", "eld-audit-to"]],
  ["apps/frontend/src/pages/safety/tabs/DrugAlcoholTab.tsx", ["drug-alcohol-history-from", "drug-alcohol-history-to"]],
  ["apps/frontend/src/pages/safety/audit-425c/Audit425cPage.tsx", ["audit-425c-from-date", "audit-425c-to-date"]],
  ["apps/frontend/src/pages/safety/components/SafetyIncidentsClusterSurface.tsx", ["safety-incidents-from-date", "safety-incidents-to-date"]],
];

const sources = new Map(specs.map(([file]) => [file, fs.readFileSync(path.join(process.cwd(), file), "utf8")]));
function failures(values) {
  const found = [];
  for (const [file, ids] of specs) {
    const source = values.get(file) ?? "";
    for (const id of ids) {
      if (!source.includes(`htmlFor="${id}"`)) found.push(`${file}: missing label ${id}`);
      if (!source.includes(`id="${id}"`)) found.push(`${file}: missing DatePicker id ${id}`);
    }
  }
  return found;
}

const found = failures(sources);
if (found.length) {
  console.error(found.map((item) => `FAIL: ${item}`).join("\n"));
  process.exit(1);
}
if (process.argv.includes("--selftest")) {
  let caught = 0;
  for (const [file, ids] of specs) for (const id of ids) {
    const mutated = new Map(sources);
    mutated.set(file, sources.get(file).replace(`htmlFor="${id}"`, `htmlFor="${id}-orphan"`));
    if (failures(mutated).length > 0) caught += 1;
  }
  if (caught !== 14) {
    console.error(`FAIL: only ${caught}/14 planted orphan labels caught`);
    process.exit(1);
  }
  console.log("PASS: 14/14 planted Safety range-label defects caught");
}
console.log("PASS: seven Safety filter ranges associate all 14 canonical DatePickers");

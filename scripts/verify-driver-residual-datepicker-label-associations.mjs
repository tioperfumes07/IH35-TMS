#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const specs = [
  ["apps/frontend/src/components/drivers/AuditHistoryTab.tsx", ["driver-audit-filter-from", "driver-audit-filter-to"]],
  ["apps/frontend/src/components/drivers/LoadHistoryTab.tsx", ["driver-load-history-filter-from", "driver-load-history-filter-to"]],
  ["apps/frontend/src/pages/drivers/onboarding/OnboardingStepMedicalCard.tsx", ["onboarding-medical-card-expiry"]],
];

function failures(sources) {
  const found = [];
  for (const [file, ids] of specs) {
    const source = sources.get(file) ?? "";
    for (const id of ids) {
      if (!source.includes(`htmlFor="${id}"`)) found.push(`${file}: label missing ${id}`);
      if (!source.includes(`<DatePicker\n`) || !source.includes(`id="${id}"`)) found.push(`${file}: DatePicker missing ${id}`);
    }
  }
  return found;
}

const sources = new Map(specs.map(([file]) => [file, fs.readFileSync(path.join(root, file), "utf8")]));
const found = failures(sources);
if (found.length) {
  console.error(found.map((item) => `FAIL: ${item}`).join("\n"));
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  let caught = 0;
  for (const [file, ids] of specs) {
    for (const id of ids) {
      const mutated = new Map(sources);
      mutated.set(file, sources.get(file).replace(`htmlFor="${id}"`, `htmlFor="${id}-orphan"`));
      if (failures(mutated).length > 0) caught += 1;
    }
  }
  if (caught !== 5) {
    console.error(`FAIL: only ${caught}/5 planted orphan labels caught`);
    process.exit(1);
  }
  console.log("PASS: 5/5 planted orphan-label defects caught");
}

console.log("PASS: all five residual Drivers calendar labels target canonical DatePickers");

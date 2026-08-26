#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const specs = [
  ["apps/frontend/src/components/safety/MedicalCardsHistorySection.tsx", ["medical-card-issued-date", "medical-card-expiry-date"]],
  ["apps/frontend/src/components/safety/BackgroundChecksSection.tsx", ["background-check-checked-date", "background-check-expiry-date"]],
];
const sources = new Map(specs.map(([file]) => [file, fs.readFileSync(path.join(process.cwd(), file), "utf8")]));
function failures(values) {
  const found = [];
  for (const [file, ids] of specs) for (const id of ids) {
    const source = values.get(file) ?? "";
    if (!source.includes(`htmlFor="${id}"`)) found.push(`${file}: missing label ${id}`);
    if (!source.includes(`<DatePicker id="${id}"`)) found.push(`${file}: missing DatePicker id ${id}`);
  }
  return found;
}
const found = failures(sources);
if (found.length) { console.error(found.map((item) => `FAIL: ${item}`).join("\n")); process.exit(1); }
if (process.argv.includes("--selftest")) {
  let caught = 0;
  for (const [file, ids] of specs) for (const id of ids) {
    const mutated = new Map(sources);
    mutated.set(file, sources.get(file).replace(`htmlFor="${id}"`, `htmlFor="${id}-orphan"`));
    if (failures(mutated).length > 0) caught += 1;
  }
  if (caught !== 4) { console.error(`FAIL: only ${caught}/4 planted defects caught`); process.exit(1); }
  console.log("PASS: 4/4 planted profile-record date-label defects caught");
}
console.log("PASS: Safety medical-card and background-check dates have associated canonical DatePickers");

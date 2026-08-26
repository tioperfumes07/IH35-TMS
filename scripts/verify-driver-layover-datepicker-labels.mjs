#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const file = path.join(process.cwd(), "apps/frontend/src/pages/drivers/DriverLayoverHistory.tsx");

function failures(source) {
  const found = [];
  for (const [key, label] of [["from", "From"], ["to", "To"]]) {
    const id = `driver-layover-${key}`;
    if (!source.includes(`<label htmlFor="${id}"`)) found.push(`${label} label is not associated`);
    if (!source.includes(`<DatePicker id="${id}"`)) found.push(`${label} DatePicker has no matching id`);
  }
  if (!source.includes("&from=${from}&to=${to}")) found.push("date range no longer reaches canonical query");
  return found;
}

const source = fs.readFileSync(file, "utf8");
const found = failures(source);
if (found.length) {
  console.error(found.map((item) => `FAIL: ${item}`).join("\n"));
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace('htmlFor="driver-layover-from"', 'htmlFor="driver-layover-date"'),
    source.replace('id="driver-layover-to"', 'id="driver-layover-date"'),
  ];
  if (mutations.some((mutation) => failures(mutation).length === 0)) {
    console.error("FAIL: planted orphan-label mutation escaped");
    process.exit(1);
  }
  console.log("PASS: 2/2 planted orphan-label defects caught");
}

console.log("PASS: Driver layover range labels target canonical DatePickers and query params");

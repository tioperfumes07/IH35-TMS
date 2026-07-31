#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/safety/AccidentsPage.tsx";
export function run(root = ROOT) {
  const failures = [];
  const src = fs.readFileSync(path.join(root, PAGE), "utf8");
  if (src.includes("Filter by driver ID") || src.includes("Filter by unit ID")) {
    failures.push(`${PAGE}: must not use raw UUID filter placeholders (SAF-F26)`);
  }
  if (!src.includes('kind="driver"') || !src.includes('kind="unit"')) {
    failures.push(`${PAGE}: filterBar must use EntityPicker kind=driver and kind=unit`);
  }
  if (!src.includes("allowCreate={false}")) {
    failures.push(`${PAGE}: accident filters must set allowCreate={false}`);
  }
  if (!src.includes('dataTestId="accidents-driver-filter"')) {
    failures.push(`${PAGE}: must keep dataTestId=accidents-driver-filter on driver picker`);
  }
  return failures;
}
function selftest() {
  const clean = run();
  if (clean.length) { console.error("SELFTEST FAIL already red", clean); process.exit(1); }
  const abs = path.join(ROOT, PAGE);
  const original = fs.readFileSync(abs, "utf8");
  try {
    fs.writeFileSync(abs, original.replace(/allowCreate=\{false\}/g, "allowCreate={true}"));
    if (!run().some((f) => f.includes("allowCreate"))) { console.error("SELFTEST FAIL"); process.exit(1); }
  } finally { fs.writeFileSync(abs, original); }
  console.log("verify-saf-f26-accident-filter-pickers --selftest OK");
}
if (process.argv.includes("--selftest")) selftest();
else {
  const f = run();
  if (f.length) { console.error("FAIL\n  - " + f.join("\n  - ")); process.exit(1); }
  console.log("verify-saf-f26-accident-filter-pickers OK");
}

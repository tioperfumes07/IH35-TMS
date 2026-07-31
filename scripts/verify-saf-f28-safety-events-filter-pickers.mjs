#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/safety/SafetyEventsPage.tsx";

export function run(root = ROOT) {
  const failures = [];
  const src = fs.readFileSync(path.join(root, PAGE), "utf8");
  if (src.includes('placeholder="Filter by driver"') || src.includes('placeholder="Filter by unit"')) {
    failures.push(`${PAGE}: must not use raw text filter placeholders (SAF-F28)`);
  }
  if (!src.includes('dataTestId="safety-events-driver-filter"') || !src.includes('dataTestId="safety-events-unit-filter"')) {
    failures.push(`${PAGE}: filterBar must keep dataTestId on driver/unit EntityPickers`);
  }
  const filterRegion = src.slice(src.indexOf("SAF-F28"), src.indexOf("Export CSV"));
  if (!filterRegion.includes('kind="driver"') || !filterRegion.includes('kind="unit"')) {
    failures.push(`${PAGE}: filterBar must use EntityPicker kind=driver and kind=unit`);
  }
  if (!filterRegion.includes("allowCreate={false}")) {
    failures.push(`${PAGE}: safety-events filters must set allowCreate={false}`);
  }
  return failures;
}

function selftest() {
  const clean = run();
  if (clean.length) {
    console.error("SELFTEST FAIL already red", clean);
    process.exit(1);
  }
  const abs = path.join(ROOT, PAGE);
  const original = fs.readFileSync(abs, "utf8");
  try {
    fs.writeFileSync(abs, original.replace(/allowCreate=\{false\}/g, "allowCreate={true}"));
    if (!run().some((f) => f.includes("allowCreate"))) {
      console.error("SELFTEST FAIL planted allowCreate miss not detected");
      process.exit(1);
    }
  } finally {
    fs.writeFileSync(abs, original);
  }
  console.log("verify-saf-f28-safety-events-filter-pickers --selftest OK");
}

if (process.argv.includes("--selftest")) selftest();
else {
  const f = run();
  if (f.length) {
    console.error("FAIL\n  - " + f.join("\n  - "));
    process.exit(1);
  }
  console.log("verify-saf-f28-safety-events-filter-pickers OK");
}

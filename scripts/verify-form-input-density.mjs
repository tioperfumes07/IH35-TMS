#!/usr/bin/env node
// Guard (DENSITY-SWEEP-QB): the oversized form-input density signature `px-2 py-2 text-sm`
// (py-2 = 8px vertical pad, text-sm = 14px -> 38-45px tall controls) must NEVER appear in any
// apps/frontend/src/**/*.tsx. Form inputs/selects are standardized to QuickBooks density via
// apps/frontend/src/components/forms/inputClass.ts (h-9 / 36px, text-[13px]); textareas use
// `px-2 py-1.5 text-[13px]`. Any reintroduction of the oversized triplet fails this guard.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = "apps/frontend/src";
const SIGNATURE = "px-2 py-2 text-sm";

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "node_modules") continue;
      out.push(...walk(full));
    } else if (entry.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

const failures = [];
for (const file of walk(ROOT)) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    if (line.includes(SIGNATURE)) {
      failures.push(`${file}:${i + 1}: ${line.trim()}`);
    }
  });
}

if (failures.length) {
  console.error("verify:form-input-density — FAIL");
  console.error(`  Found ${failures.length} occurrence(s) of the oversized form-input signature "${SIGNATURE}".`);
  console.error("  Use QuickBooks density instead: inputs/selects -> `h-9 px-2 text-[13px]` (or FORM_INPUT_CLASS); textareas -> `px-2 py-1.5 text-[13px]`.");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log(`verify:form-input-density — OK (no "${SIGNATURE}" in ${ROOT}/**/*.tsx)`);

#!/usr/bin/env node
/**
 * Book Load sample-data checkbox survives template save/apply.
 *
 * Root fix lives in apps/frontend/src/pages/dispatch/LoadTemplateLibrary.tsx:
 *   - templateJsonFromLoadDetail copies the load's is_sample_data flag into the
 *     serialized template JSON.
 *   - applyLoadTemplateToBookForm restores is_sample_data into the React Hook
 *     Form when a template is applied.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/frontend/src/pages/dispatch/LoadTemplateLibrary.tsx";
const LABEL = "verify-load-template-preserves-sample-data";

function read() {
  return fs.readFileSync(path.join(ROOT, FILE), "utf8");
}

function assert(cond, msg, errors) {
  if (!cond) errors.push(`${FILE}: ${msg}`);
}

export function run() {
  const src = read();
  const errors = [];

  assert(
    src.includes("is_sample_data: Boolean((load as { is_sample_data?: boolean | null }).is_sample_data),"),
    "templateJsonFromLoadDetail must persist is_sample_data from the load into the template JSON",
    errors
  );
  assert(
    src.includes('if (typeof json.is_sample_data === "boolean") setValue("is_sample_data", json.is_sample_data, { shouldDirty: true });'),
    "applyLoadTemplateToBookForm must restore is_sample_data from the template JSON into the form",
    errors
  );
  assert(
    /MinimalBookForm[\s\S]*is_sample_data:\s*boolean/.test(src),
    "MinimalBookForm must include is_sample_data so applyLoadTemplateToBookForm can type-safely set it",
    errors
  );

  return errors;
}

function selftest() {
  const src = read();
  const planted = src
    .replace(/is_sample_data:\s*Boolean\([^)]+\)/, "/* missing sample flag */")
    .replace(/if\s*\(\s*typeof\s+json\.is_sample_data\s*===\s*"boolean"\s*\)\s*setValue\("is_sample_data",\s*json\.is_sample_data[^)]*\);?/, "");
  const errors = [];
  const backup = read();
  fs.writeFileSync(path.join(ROOT, FILE), planted, "utf8");
  try {
    const plantedErrors = run();
    assert(plantedErrors.length >= 2, `selftest expected ≥2 failures, got ${plantedErrors.length}`, errors);
  } finally {
    fs.writeFileSync(path.join(ROOT, FILE), backup, "utf8");
  }
  if (errors.length) {
    console.error(`${LABEL} SELFTEST FAIL`);
    for (const e of errors) console.error("  - " + e);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const errors = run();
  if (errors.length) {
    console.error(`${LABEL} FAIL:`);
    for (const e of errors) console.error("  - " + e);
    process.exit(1);
  }
  console.log(`${LABEL}: OK — load template save/apply preserves is_sample_data`);
}

main();

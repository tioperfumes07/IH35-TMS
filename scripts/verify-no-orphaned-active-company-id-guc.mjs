#!/usr/bin/env node
/**
 * LV-ORPHANED-GUC-WRITE-ACTIVE-COMPANY-ID ratchet:
 *  app.active_company_id must not be written in apps/backend/src — nothing reads it
 *  (pg_proc / pg_policies / pg_views sweep). Real scoping is app.operating_company_id.
 *
 * --selftest plants a set_config('app.active_company_id') and expects FAIL.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "apps/backend/src");
const FORBIDDEN = /set_config\(\s*['"]app\.active_company_id['"]/;

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === "dist") continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(ts|js|mjs)$/.test(ent.name)) out.push(p);
  }
  return out;
}

function check() {
  const errors = [];
  for (const abs of walk(SRC)) {
    const src = fs.readFileSync(abs, "utf8");
    if (!FORBIDDEN.test(src)) continue;
    const rel = path.relative(ROOT, abs).replace(/\\/g, "/");
    errors.push(`${rel}: writes unread app.active_company_id GUC`);
  }
  return errors;
}

function main() {
  const errors = check();
  if (errors.length) {
    console.error("FAIL: verify-no-orphaned-active-company-id-guc");
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log("PASS: verify-no-orphaned-active-company-id-guc (no app.active_company_id writers)");
}

function selftest() {
  const plant = path.join(SRC, "auth", "__guc_selftest_plant.ts");
  fs.writeFileSync(
    plant,
    `await client.query("SELECT set_config('app.active_company_id', $1::text, true)", [x]);\n`,
  );
  try {
    const errors = check();
    if (!errors.length) {
      console.error("selftest FAIL: expected errors after planting writer");
      process.exit(1);
    }
    console.log("selftest PASS: planted writer → FAIL as expected");
  } finally {
    fs.unlinkSync(plant);
  }
}

if (process.argv.includes("--selftest")) selftest();
else main();

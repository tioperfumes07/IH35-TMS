#!/usr/bin/env node
/**
 * VISUAL-AUDIT-PUNCHLIST-2026-07-03 item 213 / locked §7 primary-create vocabulary.
 *
 * FactorAdmin header CTA must say "+ Create Factor" — never "Add Factor" on the
 * primary create button (modal title may differ).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const LABEL = "verify:factor-admin-create-vocab";
const factorAdminPath = path.join(ROOT, "apps/frontend/src/pages/factoring/FactorAdmin.tsx");

/** Primary CTA: Button that opens the add-factor modal must not say "Add Factor". */
const PRIMARY_ADD_FACTOR_CTA =
  /onClick=\{\(\)\s*=>\s*setShowAddFactorModal\(true\)\}\>\s*\n\s*Add Factor\s*\n\s*<\/Button>/;

const FORBIDDEN_PRIMARY = ["+ Add Factor", "+ New Factor"];

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

/** @param {string} src */
export function collectFailures(src) {
  const failures = [];

  if (!src.includes("+ Create Factor")) {
    failures.push("FactorAdmin primary CTA must say + Create Factor");
  }
  if (PRIMARY_ADD_FACTOR_CTA.test(src)) {
    failures.push('FactorAdmin primary CTA must not use "Add Factor" (use + Create Factor)');
  }
  for (const phrase of FORBIDDEN_PRIMARY) {
    if (src.includes(phrase)) {
      failures.push(`FactorAdmin must not contain forbidden primary label "${phrase}"`);
    }
  }

  return failures;
}

function selftest() {
  const live = read(factorAdminPath);
  const good = collectFailures(live);
  if (good.length) {
    console.error(`${LABEL} SELFTEST FAIL — live source should pass before selftest`);
    for (const f of good) console.error(`  - ${f}`);
    process.exit(1);
  }

  const planted = live.replace("+ Create Factor", "Add Factor");
  const bad = collectFailures(planted);
  if (!bad.some((f) => f.includes("Add Factor") || f.includes("+ Create Factor"))) {
    console.error(`${LABEL} SELFTEST FAIL — did not detect planted violation`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
}

function main() {
  const failures = collectFailures(read(factorAdminPath));

  if (failures.length) {
    console.error(`${LABEL} FAIL:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  console.log(`${LABEL} OK — FactorAdmin primary CTA uses + Create Factor`);
}

const isMain =
  path.resolve(process.argv[1] ?? "") === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  if (process.argv.includes("--selftest")) selftest();
  else main();
}

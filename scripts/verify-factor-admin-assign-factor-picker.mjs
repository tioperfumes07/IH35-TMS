#!/usr/bin/env node
/** LST-F149 — FactorAdmin assign modal factor field is Combobox with + Add new (not bare <select>). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-factor-admin-assign-factor-picker";
const SELFTEST = process.argv.includes("--selftest");
const FILE = "apps/frontend/src/pages/factoring/FactorAdmin.tsx";

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function assertSrc(src) {
  const problems = [];
  const code = stripComments(src);
  if (!/data-testid="factor-admin-assign-factor-picker"/.test(code)) {
    problems.push("missing assign-factor picker testid");
  }
  if (!/allowAddNew=\{\{[\s\S]*label:\s*"\+ Add new factor"/.test(code)) {
    problems.push("missing + Add new factor allowAddNew");
  }
  if (!/<Combobox[\s\S]{0,400}?allowAddNew=/.test(code)) {
    problems.push("assign factor field is not Combobox+allowAddNew");
  }
  // The assign-factor block must not use a native <select> for factor choice (ignore comment prose).
  const assignBlock = code.match(
    /data-testid="factor-admin-assign-factor-picker"[\s\S]{0,800}?Effective date/,
  )?.[0];
  if (!assignBlock) problems.push("could not locate assign-factor picker block");
  else if (/<select[\s>]/.test(assignBlock)) problems.push("assign-factor picker still uses bare <select>");
  return problems;
}

const read = () => fs.readFileSync(path.join(ROOT, FILE), "utf8");

if (SELFTEST) {
  const live = read();
  const planted = live.replace(
    /allowAddNew=\{\{[\s\S]*?\}\}/,
    "",
  ).replace(
    /data-testid="factor-admin-assign-factor-picker"/,
    'data-testid="factor-admin-assign-factor-picker"><select value={assignFactorId}',
  );
  if (!assertSrc(planted).length) {
    console.error(`${LABEL} SELFTEST FAILED: planted defect not caught`);
    process.exit(1);
  }
  const problems = assertSrc(live);
  if (problems.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${problems.join(" | ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assertSrc(read());
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);

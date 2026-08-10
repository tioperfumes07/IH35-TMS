#!/usr/bin/env node
/** LST-F159 — ReserveTracker factor filter is Combobox with + Add new factor (not bare <select>). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-reserve-tracker-factor-picker";
const SELFTEST = process.argv.includes("--selftest");
const FILE = "apps/frontend/src/pages/factoring/ReserveTracker.tsx";

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function assertSrc(src) {
  const problems = [];
  const code = stripComments(src);
  if (!/data-testid="reserve-tracker-factor-picker"/.test(code)) {
    problems.push("missing reserve-tracker-factor-picker testid");
  }
  if (!/allowAddNew=\{\{[\s\S]*label:\s*"\+ Add new factor"/.test(code)) {
    problems.push("missing + Add new factor allowAddNew");
  }
  if (!/createFactor/.test(code)) problems.push("missing createFactor nested creator");
  const soft = code.match(
    /data-testid="reserve-tracker-factor-picker"[\s\S]{0,1200}?mb-3 grid grid-cols-2/,
  )?.[0];
  if (!soft) problems.push("could not locate factor picker block");
  else if (/<select[\s>]/.test(soft)) problems.push("factor picker still uses bare <select>");
  else if (!/<Combobox[\s\S]{0,600}?allowAddNew=/.test(soft)) {
    problems.push("factor field is not Combobox+allowAddNew");
  }
  return problems;
}

const read = () => fs.readFileSync(path.join(ROOT, FILE), "utf8");

if (SELFTEST) {
  const live = read();
  const planted = live
    .replace(/allowAddNew=\{\{[\s\S]*?\}\}/, "")
    .replace(
      /data-testid="reserve-tracker-factor-picker"/,
      'data-testid="reserve-tracker-factor-picker"><select value={selectedFactorId}',
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

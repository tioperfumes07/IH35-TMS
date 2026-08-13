#!/usr/bin/env node
/** LST-F159 — ReserveTracker factor filter is Combobox with + Add new factor (not bare <select>). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-reserve-tracker-factor-picker";
const SELFTEST = process.argv.includes("--selftest");
const FILE = "apps/frontend/src/pages/factoring/ReserveTracker.tsx";
const CREATOR_FILE = "apps/frontend/src/pages/factoring/ReserveDashboardAddFactorModal.tsx";

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function assertSrc(src, creatorSrc) {
  const problems = [];
  const code = stripComments(src);
  if (!/data-testid="reserve-tracker-factor-picker"/.test(code)) {
    problems.push("missing reserve-tracker-factor-picker testid");
  }
  if (!/allowAddNew=\{\{[\s\S]*label:\s*"\+ Add new factor"/.test(code)) {
    problems.push("missing + Add new factor allowAddNew");
  }
  const creator = stripComments(creatorSrc);
  if (!/ReserveDashboardAddFactorModal/.test(code)) problems.push("missing shared factor creator mount");
  if (!/createFactor\(companyId,/.test(creator)) problems.push("creator does not write through canonical createFactor API");
  if (!/onCreated\(created\.id\)/.test(creator)) problems.push("creator does not return the created FK for auto-selection");
  if (!/invalidateQueries\(\{\s*queryKey:\s*\["factoring",\s*"factors"\]/.test(creator)) {
    problems.push("creator does not invalidate the entity-scoped factor catalog");
  }
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
const readCreator = () => fs.readFileSync(path.join(ROOT, CREATOR_FILE), "utf8");

if (SELFTEST) {
  const live = read();
  const creator = readCreator();
  const planted = live
    .replace(/allowAddNew=\{\{[\s\S]*?\}\}/, "")
    .replace(
      /data-testid="reserve-tracker-factor-picker"/,
      'data-testid="reserve-tracker-factor-picker"><select value={selectedFactorId}',
    );
  const plantedCreator = creator.replace(/createFactor\(companyId,/, "createFactor(\"wrong-company\",");
  if (!assertSrc(planted, plantedCreator).length) {
    console.error(`${LABEL} SELFTEST FAILED: planted defect not caught`);
    process.exit(1);
  }
  const problems = assertSrc(live, creator);
  if (problems.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${problems.join(" | ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assertSrc(read(), readCreator());
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);

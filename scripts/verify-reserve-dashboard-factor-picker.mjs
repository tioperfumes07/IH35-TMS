#!/usr/bin/env node
/** LST-F158 — ReserveDashboard factor filter is Combobox with + Add new factor (not bare <select>). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-reserve-dashboard-factor-picker";
const SELFTEST = process.argv.includes("--selftest");
const FILE = "apps/frontend/src/pages/factoring/ReserveDashboard.tsx";
const CREATOR_FILE = "apps/frontend/src/pages/factoring/ReserveDashboardAddFactorModal.tsx";

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function assertSrc(src, creatorSrc) {
  const problems = [];
  const code = stripComments(src);
  if (!/data-testid="reserve-dashboard-factor-picker"/.test(code)) {
    problems.push("missing reserve-dashboard-factor-picker testid");
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
  const block = code.match(
    /data-testid="reserve-dashboard-factor-picker"[\s\S]{0,1200}?balancesQuery/,
  )?.[0] ?? code.match(
    /data-testid="reserve-dashboard-factor-picker"[\s\S]{0,1200}?No reserve balances/,
  )?.[0];
  if (!block) {
    // softer: just check picker region before grid of balances
    const soft = code.match(/data-testid="reserve-dashboard-factor-picker"[\s\S]{0,900}?<\/div>\s*<\/div>\s*<div className="grid/)?.[0];
    if (!soft) problems.push("could not locate factor picker block");
    else if (/<select[\s>]/.test(soft)) problems.push("factor picker still uses bare <select>");
    else if (!/<Combobox[\s\S]{0,500}?allowAddNew=/.test(soft)) problems.push("factor field is not Combobox+allowAddNew");
  } else if (/<select[\s>]/.test(block)) {
    problems.push("factor picker still uses bare <select>");
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
      /data-testid="reserve-dashboard-factor-picker"/,
      'data-testid="reserve-dashboard-factor-picker"><select value={selectedFactorId}',
    );
  const plantedCreator = creator.replace(/onCreated\(created\.id\)/, "void created.id");
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

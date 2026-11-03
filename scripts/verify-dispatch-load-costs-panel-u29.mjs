#!/usr/bin/env node
/**
 * Codex Round 7.6 + U29 — Dispatch overview Load Costs panel:
 * - Truck cell EntityLinks the assigned unit (not plain text)
 * - Caption must not claim margin is "wizard-based"; margin = canonical net
 */
import fs from "node:fs";

const LABEL = "verify-dispatch-load-costs-panel-u29";
const FILE = "apps/frontend/src/components/dispatch/DispatchLoadCostsPanel.tsx";
const src = fs.readFileSync(FILE, "utf8");
const fails = [];

if (!/kind="unit"/.test(src) || !/assigned_unit_id/.test(src)) {
  fails.push(`${FILE}: Truck column must EntityLink kind=unit via assigned_unit_id`);
}
if (/render:\s*\(row\)\s*=>\s*row\.load\.assigned_unit_number\s*\?\?\s*["']Unassigned["']/.test(src)) {
  fails.push(`${FILE}: Truck column must not render plain assigned_unit_number text`);
}
if (!/canonical net/.test(src) || !/revenue/.test(src)) {
  fails.push(`${FILE}: caption must state Approximate margin is canonical net (revenue − costs − driver pay)`);
}
if (/Wizard charges[\s\S]{0,80}Approximate margin/.test(src) && !/canonical net/.test(src)) {
  fails.push(`${FILE}: must not imply margin is wizard-charge based`);
}

if (process.argv.includes("--selftest")) {
  if (fails.length) {
    console.error(`${LABEL} --selftest FAIL live red:\n  ${fails.join("\n  ")}`);
    process.exit(1);
  }
  const plant = src
    .replace(/kind="unit"/g, 'kind="load"')
    .replace(/canonical net[\s\S]*?not settlement[\s\S]*?\./, "Wizard charges plus costs. Approximate margin — not settlement.")
    .replace(
      /row\.load\.assigned_unit_id \? \([\s\S]*?\) : \(\s*<span className="ih-empty">Unassigned<\/span>\s*\)/,
      'row.load.assigned_unit_number ?? "Unassigned"',
    );
  const planted = [];
  if (!/kind="unit"/.test(plant)) planted.push("no unit link");
  if (/assigned_unit_number \?\? "Unassigned"/.test(plant) || /assigned_unit_number\s*\?\?/.test(plant)) {
    planted.push("plain text");
  }
  if (!/canonical net/.test(plant)) planted.push("no canonical");
  if (planted.length < 2) {
    console.error(`${LABEL} --selftest FAIL plant weak`, planted);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

if (fails.length) {
  console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — Dispatch Load Costs Truck EntityLink + honest margin caption`);

#!/usr/bin/env node
/**
 * verify-cash-flow-avp-projected-drills-rolling-ledger — ROUND 8.20 board6.
 * AVP Projected Income/Exp amounts must drill same-day Rolling Ledger with ret
 * (rl_from/rl_to/rl_kind), not stay as plain text.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-cash-flow-avp-projected-drills-rolling-ledger";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/frontend/src/pages/cash-flow/tabs/ActualVsProjectedTab.tsx";

export function check(src) {
  const f = [];
  if (!src) {
    f.push("ActualVsProjectedTab.tsx missing");
    return f;
  }
  if (!/export function buildAvpProjectedDrillHref/.test(src)) {
    f.push("buildAvpProjectedDrillHref missing");
  }
  if (!/tab=rolling_ledger/.test(src) || !/rl_from=/.test(src) || !/rl_kind=/.test(src)) {
    f.push("projected drill must target rolling_ledger with rl_from/rl_kind");
  }
  if (!/export function ProjectedCell/.test(src) && !/function ProjectedCell/.test(src)) {
    f.push("ProjectedCell missing");
  }
  // Columns must wire ProjectedCell for both income and expenses.
  if (!/ProjectedCell line=\{g\.income\}/.test(src)) {
    f.push("projected_income column does not use ProjectedCell");
  }
  if (!/ProjectedCell line=\{g\.expenses\}/.test(src)) {
    f.push("projected_expenses column does not use ProjectedCell");
  }
  // Amount must be a Link (not plain span text only).
  const cell = src.match(/export function ProjectedCell[\s\S]*?\n\}/);
  if (cell) {
    if (!/<Link[\s\S]*buildAvpProjectedDrillHref/.test(cell[0]) && !/to=\{buildAvpProjectedDrillHref/.test(cell[0])) {
      f.push("ProjectedCell does not Link via buildAvpProjectedDrillHref");
    }
  }
  if (!/withReturnContext\(target, originHref\)/.test(src)) {
    f.push("projected drill must carry ret via withReturnContext");
  }
  return f;
}

function selftest(live) {
  const cases = [
    [
      "no builder",
      live.replace(/export function buildAvpProjectedDrillHref[\s\S]*?\n\}/, ""),
    ],
    [
      "plain projected_expenses",
      live.replace(/ProjectedCell line=\{g\.expenses\} originHref=\{originHref\}/, "ProjectedExpenseCell line={g.expenses}"),
    ],
    ["file deleted", ""],
  ];
  let pass = check(live).length === 0 ? 1 : 0;
  if (!pass) console.error(`${LABEL} --selftest: live tree fails`, check(live));
  for (const [name, src] of cases) {
    if (check(src).length > 0) pass += 1;
    else console.error(`${LABEL} --selftest: did not catch "${name}"`);
  }
  const total = cases.length + 1;
  if (pass !== total) {
    console.error(`${LABEL} --selftest FAIL ${pass}/${total}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS ${pass}/${total}`);
}

const src = fs.existsSync(path.join(ROOT, FILE)) ? fs.readFileSync(path.join(ROOT, FILE), "utf8") : "";
if (process.argv.includes("--selftest")) selftest(src);
else {
  const f = check(src);
  if (f.length) {
    for (const x of f) console.error(`${LABEL}: FAIL — ${x}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — AVP projected amounts drill Rolling Ledger with ret`);
}

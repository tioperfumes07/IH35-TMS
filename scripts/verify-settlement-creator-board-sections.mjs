#!/usr/bin/env node
/**
 * 443.280 fill-not-shell — Settlement Creator money sections use shared BoardSection
 * (not bare rounded-sm border cards). Engines/subtotals stay in Section footer.
 *
 *   node scripts/verify-settlement-creator-board-sections.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-creator-board-sections";
const FILE = "apps/frontend/src/pages/settlements/SettlementCreatorDrawer.tsx";
export function check(src) {
const fails = [];

if (!src.includes('from "../../components/v3/BoardSection"')) {
  fails.push(`${FILE}: must import BoardSection`);
}

const sectionFn = src.match(/function Section\([\s\S]*?\n\}\n\n\/\*\*/)?.[0] ?? src.match(/function Section\([\s\S]*?\n\}\n\nfunction /)?.[0] ?? "";
if (!sectionFn) {
  fails.push(`${FILE}: could not isolate Section() helper`);
} else {
  if (!/<BoardSection[\s\S]{0,400}testId=\{`sc-section-\$\{slug\}`\}/.test(sectionFn)) {
    fails.push(`${FILE}: Section() must render BoardSection with testId sc-section-\${slug}`);
  }
  if (/<section className="space-y-2 rounded-sm border/.test(sectionFn)) {
    fails.push(`${FILE}: Section() must not keep bare rounded-sm border <section> shell`);
  }
}

for (const testId of ["sc-post-stages", "sc-settlement-totals", "sc-je-preview"]) {
  if (!new RegExp(`<BoardSection[\\s\\S]{0,220}testId=["']${testId}["']`).test(src)) {
    fails.push(`${FILE}: must wrap ${testId} in BoardSection`);
  }
}

for (const title of [
  "Loads",
  "Fuel purchases",
  "Company expenses",
  "Deductions",
  "Cash advances",
  "Escrow",
]) {
  if (!src.includes(`<Section title="${title}"`)) {
    fails.push(`${FILE}: missing money Section title="${title}" (engine surface must stay)`);
  }
}
return fails;
}

const realSrc = fs.readFileSync(path.join(ROOT, FILE), "utf8");
if (process.argv.includes("--selftest")) {
  const plants = [
    ["BoardSection import dropped", (s) => s.replace('from "../../components/v3/BoardSection"', 'from "./x"')],
    ["Section() back to a bare bordered shell", (s) => s.replace(/testId=\{`sc-section-\$\{slug\}`\}/, 'testId="x"')],
    ["JE preview unwrapped", (s) => s.split("sc-je-preview").join("sc-je-gone")],
    ["Escrow money section removed", (s) => s.split('<Section title="Escrow"').join('<Section title="Gone"')],
  ];
  const problems = check(realSrc).length ? [`clean tree red: ${check(realSrc).join("; ")}`] : [];
  for (const [name, mutate] of plants) {
    const planted = mutate(realSrc);
    if (planted === realSrc) problems.push(`plant "${name}" changed nothing`);
    else if (check(planted).length === 0) problems.push(`plant "${name}" escaped`);
  }
  if (problems.length) {
    console.error(`${LABEL} SELFTEST FAIL\n  - ${problems.join("\n  - ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — clean tree passes; ${plants.length}/${plants.length} plants caught`);
  process.exit(0);
}
const fails = check(realSrc);

if (fails.length) {
  console.error(`${LABEL}: FAIL\n  - ${fails.join("\n  - ")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — Settlement Creator Section/Post/Totals/JE → BoardSection`);

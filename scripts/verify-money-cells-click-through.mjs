#!/usr/bin/env node
/**
 * Money cells must stay click-through (EntityLink) and shrink-only (nowrap), not wrap into
 * unclickable text. LedgerKpiPanel drill `_cents` cells wrap EntityLink + QBO_MONEY_CELL_CLASS +
 * shrink-0 whitespace-nowrap.
 *
 * Ratchet: shrink-only money cells (QBO_MONEY_CELL_CLASS / text-right+tabular-nums with shrink-0
 * but no EntityLink on the same expression) must not rise above the 42-cell baseline.
 *
 * Static. --selftest plants the panel defect and a ratchet increase.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-money-cells-click-through";
const PANEL = "apps/frontend/src/components/shared/LedgerKpiPanel.tsx";
const SHRINK_ONLY_BASELINE = 42;

function stripComments(src) {
  return String(src ?? "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function walkTsx(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === "dist" || ent.name.startsWith(".")) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkTsx(p, out);
    else if (/\.(tsx|jsx)$/.test(ent.name)) out.push(p);
  }
  return out;
}

/** One money cell: a className that is QBO_MONEY_CELL_CLASS or text-right+tabular-nums. */
function moneyCellHits(src) {
  const hits = [];
  const re = /className=\{?([^}]+)\}?/g;
  let m;
  while ((m = re.exec(src))) {
    const expr = m[1];
    const isMoney =
      /QBO_MONEY_CELL_CLASS/.test(expr) || (/\btext-right\b/.test(expr) && /\btabular-nums\b/.test(expr));
    if (!isMoney) continue;
    const window = src.slice(Math.max(0, m.index - 240), Math.min(src.length, m.index + expr.length + 240));
    hits.push({
      expr,
      shrinkOnly: /\bshrink-0\b/.test(expr) || /\bwhitespace-nowrap\b/.test(expr),
      clickThrough: /EntityLink/.test(window),
    });
  }
  return hits;
}

export function findProblems({ panel, shrinkOnlyCount }) {
  const problems = [];
  const p = stripComments(panel);
  if (!/col\.endsWith\("_cents"\)/.test(p)) {
    problems.push(`${PANEL}: drill money cells (_cents) missing`);
  }
  if (!/EntityLink/.test(p) || !/QBO_MONEY_CELL_CLASS/.test(p) || !/shrink-0/.test(p) || !/whitespace-nowrap/.test(p)) {
    problems.push(`${PANEL}: _cents cells must be EntityLink + QBO_MONEY_CELL_CLASS + shrink-0 whitespace-nowrap`);
  }
  if (shrinkOnlyCount > SHRINK_ONLY_BASELINE) {
    problems.push(`shrink-only money cells ${shrinkOnlyCount} > baseline ${SHRINK_ONLY_BASELINE} — do not add more unclickable shrink-only amounts`);
  }
  return problems;
}

function countShrinkOnly(rootDir) {
  let n = 0;
  for (const file of walkTsx(path.join(rootDir, "apps/frontend/src"))) {
    const src = stripComments(fs.readFileSync(file, "utf8"));
    for (const hit of moneyCellHits(src)) {
      if (hit.shrinkOnly && !hit.clickThrough) n += 1;
    }
  }
  return n;
}

function selftest() {
  const goodPanel = `
    if (col.endsWith("_cents")) {
      return <EntityLink kind={kind} id={id} label={formatted} className={\`\${QBO_MONEY_CELL_CLASS} shrink-0 whitespace-nowrap underline\`} />;
    }
  `;
  const cases = [
    { name: "click-through money cells", panel: goodPanel, shrinkOnlyCount: 42, expectFail: false },
    { name: "panel money not EntityLink", panel: `if (col.endsWith("_cents")) return <span className={QBO_MONEY_CELL_CLASS}>{v}</span>;`, shrinkOnlyCount: 42, expectFail: true },
    { name: "panel missing shrink-0", panel: `if (col.endsWith("_cents")) return <EntityLink className={QBO_MONEY_CELL_CLASS} />;`, shrinkOnlyCount: 42, expectFail: true },
    { name: "ratchet up from 42", panel: goodPanel, shrinkOnlyCount: 43, expectFail: true },
    { name: "missing _cents branch", panel: `return <EntityLink className={\`\${QBO_MONEY_CELL_CLASS} shrink-0 whitespace-nowrap\`} />;`, shrinkOnlyCount: 42, expectFail: true },
  ];
  let pass = 0;
  for (const c of cases) {
    const problems = findProblems({ panel: c.panel, shrinkOnlyCount: c.shrinkOnlyCount });
    const failed = problems.length > 0;
    if (failed === c.expectFail) {
      pass += 1;
      console.log(`ok    ${c.name}`);
    } else {
      console.error(`FAIL  ${c.name} — expected ${c.expectFail ? "FAIL" : "PASS"}, got ${failed ? "FAIL" : "PASS"}`);
      if (problems.length) console.error(`      ${problems.join("\n      ")}`);
    }
  }
  console.log(`\n${LABEL} --selftest: ${pass}/${cases.length} ${pass === cases.length ? "PASS" : "FAIL"}`);
  process.exit(pass === cases.length ? 0 : 1);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const panel = fs.readFileSync(path.join(ROOT, PANEL), "utf8");
  const shrinkOnlyCount = countShrinkOnly(ROOT);
  const problems = findProblems({ panel, shrinkOnlyCount });
  if (problems.length) {
    console.error(`${LABEL} FAIL — ${problems.length} defect(s) (shrink-only=${shrinkOnlyCount}, baseline=${SHRINK_ONLY_BASELINE}):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — drill money cells click through; shrink-only ${shrinkOnlyCount} <= ${SHRINK_ONLY_BASELINE}.`);
}

main();

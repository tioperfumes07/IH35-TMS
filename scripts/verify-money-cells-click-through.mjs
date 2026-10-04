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
/**
 * SHRINK-ONLY RATCHET — money cells that are NOT click-through. MEASURED 2026-10-04 with the
 * corrected detector: 237 money cells in apps/frontend/src, 103 not click-through once HTML
 * export/print templates are excluded. Was 42 against a then-reported 3 — 39 slots of slack, so
 * the ratchet could not catch a regression in either direction.
 *
 * STILL CONSERVATIVE, deliberately: some of the 141 are declared as table column config
 * (`cellClass: "text-right tabular-nums"`) whose row renderer drills elsewhere in the file, which
 * a proximity window cannot resolve. That makes 103 an upper bound, and an upper bound is a safe
 * ratchet: it can only be lowered. Do not raise it.
 */
const SHRINK_ONLY_BASELINE = 103;

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
    // FORWARD-ONLY window. A backward window gave FALSE CREDIT: wiring 3 Balance Sheet amount
    // cells dropped the count by 5, because two total rows sat within 240 characters of the new
    // AmountLink and were scored clickable without being wired. In JSX the link is the ELEMENT'S
    // CHILD, so it always follows its own className — looking backward can only ever pick up a
    // sibling's link. Over-crediting is the fake green this guard exists to prevent.
    const window = src.slice(m.index, Math.min(src.length, m.index + expr.length + 200));
    // An HTML EXPORT/PRINT template, not a UI cell: `style="..."` is a STRING attribute, which is
    // invalid in JSX (JSX requires style={{...}}), so its presence proves this className lives in a
    // hand-built HTML string for export or print. A printed cell must never be a link.
    // Two proofs that this className lives in a hand-built HTML string for EXPORT or PRINT rather
    // than in JSX, and a printed cell must never be a link:
    //   style="..."  — a STRING style attribute, invalid in JSX (which requires style={{...}})
    //   esc(...)     — the repo's HTML-escaping helper; it only appears when interpolating into
    //                  markup being assembled as text
    // MEASURED 2026-10-04: `style="` alone left 43 of 147 counted cells inside esc() export
    // strings — 7 in FinancialStatementsPage (where ALL of its cells are export-only, so the file
    // appeared to owe 15 drills and in fact owes none), 6 in ProfitPerTruckPage, and so on. Those
    // 43 were permanent noise in the ratchet: unfixable by design, and they hid the real count.
    // The backward reach is needed because `esc(` usually precedes the className in the row string.
    const exportWindow = src.slice(Math.max(0, m.index - 200), Math.min(src.length, m.index + expr.length + 200));
    const isHtmlExportTemplate = /style="/.test(window) || /\besc\(/.test(exportWindow);
    hits.push({
      expr,
      htmlExport: isHtmlExportTemplate,
      shrinkOnly: /\bshrink-0\b/.test(expr) || /\bwhitespace-nowrap\b/.test(expr),
      // AmountLink is the aggregate counterpart to EntityLink (LST-F405): EntityLink answers
      // "which entity is this" for a single transaction, AmountLink carries the FILTER behind a
      // sum to the filtered list. Both are click-through; counting only EntityLink would mark
      // every correctly-wired report total as dead.
      clickThrough: /EntityLink|AmountLink/.test(window),
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
    problems.push(
      `unclickable money cells ${shrinkOnlyCount} > baseline ${SHRINK_ONLY_BASELINE} — a money figure ` +
        `must resolve to a route: EntityLink for a single transaction, AmountLink{filter} for a sum ` +
        `(the filter IS the drill target). Do not raise the baseline.`,
    );
  } else if (shrinkOnlyCount < SHRINK_ONLY_BASELINE) {
    // A STALE BASELINE IS THE DEFECT THAT HID THIS GUARD'S BLIND SPOT. The old baseline sat at 42
    // against a reported 3 and passed silently, leaving 39 slots in which new unclickable cells
    // could land unnoticed. A shrink-only ratchet that tolerates slack is not a ratchet.
    problems.push(
      `baseline stale: measured ${shrinkOnlyCount}, baseline ${SHRINK_ONLY_BASELINE} — ` +
        `${SHRINK_ONLY_BASELINE - shrinkOnlyCount} cell(s) were retired. Lower SHRINK_ONLY_BASELINE ` +
        `to ${shrinkOnlyCount} in this same commit so the ratchet keeps no slack.`,
    );
  }
  return problems;
}

function countShrinkOnly(rootDir) {
  let n = 0;
  for (const file of walkTsx(path.join(rootDir, "apps/frontend/src"))) {
    const src = stripComments(fs.readFileSync(file, "utf8"));
    for (const hit of moneyCellHits(src)) {
      // LST-F405 -- WHY shrinkOnly IS NO LONGER A CONDITION.
      // This counted `hit.shrinkOnly && !hit.clickThrough`, i.e. only money cells that ALSO carry
      // shrink-0 / whitespace-nowrap. MEASURED 2026-10-04: 237 money cells in the tree, 231 not
      // click-through, of which only 3 carry those classes. So the old condition policed 3 of 231
      // and 228 unclickable cells were invisible to it -- about 1% of the owner's law
      // ("every single transaction shown must be clickable and take you to that transaction").
      // The guard read green for weeks while the report pages had no drill at all. Styling is not
      // the law; clickability is. An HTML export/print template is excluded because a printed cell
      // must never be a link.
      if (!hit.htmlExport && !hit.clickThrough) n += 1;
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
    { name: "click-through money cells", panel: goodPanel, shrinkOnlyCount: 103, expectFail: false },
    { name: "panel money not EntityLink", panel: `if (col.endsWith("_cents")) return <span className={QBO_MONEY_CELL_CLASS}>{v}</span>;`, shrinkOnlyCount: 103, expectFail: true },
    { name: "panel missing shrink-0", panel: `if (col.endsWith("_cents")) return <EntityLink className={QBO_MONEY_CELL_CLASS} />;`, shrinkOnlyCount: 103, expectFail: true },
    { name: "ratchet up from 103", panel: goodPanel, shrinkOnlyCount: 104, expectFail: true },
    { name: "missing _cents branch", panel: `return <EntityLink className={\`\${QBO_MONEY_CELL_CLASS} shrink-0 whitespace-nowrap\`} />;`, shrinkOnlyCount: 103, expectFail: true },
    // LST-F405 — a STALE baseline must fail too, or slack accumulates invisibly (42 vs 3).
    { name: "baseline stale (below)", panel: goodPanel, shrinkOnlyCount: 102, expectFail: true },
    { name: "baseline exact", panel: goodPanel, shrinkOnlyCount: 103, expectFail: false },
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

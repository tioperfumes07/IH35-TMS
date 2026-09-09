#!/usr/bin/env node
/**
 * verify-settlement-margin-pct-separate-columns — NEW-11 (owner 2026-09-07, ROUND 6, verbatim:
 * "Pre-settlement data ... margin and percentage are combined awkwardly in one column — needs real
 *  column redesign (separate or clearly formatted).")
 *
 * The margin dollars and the margin percentage used to be jammed into ONE cell ("$1,234 · 12.3%") on
 * every settlement / pre-settlement surface. This STATIC, fail-closed guard pins the redesign:
 *   1. Settlements register (SettlementsToursRegister): a money-only "Margin" column AND a SEPARATE,
 *      independently-sortable "Margin %" column (testId setl-tour-col-margin-pct) — the old combined
 *      render is gone.
 *   2. Load-Costs register (LoadCostsBoardPage): same split — "Margin" ($) + "Margin %" columns
 *      (testId tour-col-margin-pct), the shared TourListRow readout.
 *   3. Pre-Settlement tab (TourPreSettlementTab): per-leg AND tour-totals margin cells render the
 *      percentage in its OWN sub-element (testIds tour-leg-margin-pct / tour-totals-margin-pct), not
 *      jammed inline behind a "·"; the leg popup lists "Margin" and "Margin %" as distinct rows.
 *
 * --selftest mutates each load-bearing fact and requires each mutation to FAIL; clean sources pass.
 */
import fs from "node:fs";

const SETL = "apps/frontend/src/pages/driver-finance/SettlementsToursRegister.tsx";
const BOARD = "apps/frontend/src/pages/accounting/LoadCostsBoardPage.tsx";
const TAB = "apps/frontend/src/components/dispatch/TourPreSettlementTab.tsx";

function analyze(src) {
  const { setl, board, tab } = src;
  const errors = [];

  // 1. Settlements register — split, old combined render gone.
  if (/\{fmt\(r\.margin_cents\)\}\{r\.margin_pct == null/.test(setl)) {
    errors.push("SettlementsToursRegister still combines margin $ and % in one cell (fmt(margin){margin_pct…}) — split them");
  }
  if (!/testId:\s*"setl-tour-col-margin-pct"/.test(setl)) errors.push('SettlementsToursRegister must add a separate "Margin %" column (testId setl-tour-col-margin-pct)');
  if (!/key:\s*"margin_pct"[\s\S]{0,240}?label:\s*"Margin %"/.test(setl)) errors.push('SettlementsToursRegister "Margin %" column must carry key margin_pct + label "Margin %"');
  if (!/key:\s*"margin_pct"[\s\S]{0,320}?r\.margin_pct\.toFixed\(1\)\}%/.test(setl)) errors.push('SettlementsToursRegister "Margin %" column must render r.margin_pct.toFixed(1)%');

  // 2. Load-Costs register — same split.
  if (/\{fmt\(r\.margin_cents\)\}\{r\.margin_pct == null/.test(board)) {
    errors.push("LoadCostsBoardPage still combines margin $ and % in one cell — split them");
  }
  if (!/testId:\s*"tour-col-margin-pct"/.test(board)) errors.push('LoadCostsBoardPage must add a separate "Margin %" column (testId tour-col-margin-pct)');
  if (!/key:\s*"tour_margin_pct"[\s\S]{0,240}?label:\s*"Margin %"/.test(board)) errors.push('LoadCostsBoardPage "Margin %" column must carry key tour_margin_pct + label "Margin %"');
  if (!/key:\s*"tour_margin_pct"[\s\S]{0,320}?r\.margin_pct\.toFixed\(1\)\}%/.test(board)) errors.push('LoadCostsBoardPage "Margin %" column must render r.margin_pct.toFixed(1)%');

  // 3. Pre-Settlement tab — % in its own sub-element, not jammed inline.
  if (/currencyCode\)\}\s*·\s*\{pct\(/.test(tab)) {
    errors.push('TourPreSettlementTab still jams margin % inline behind a "·" — render it in its own ldt-sub element');
  }
  if (!/data-testid="tour-leg-margin-pct"/.test(tab)) errors.push("TourPreSettlementTab per-leg margin % must render in its own element (data-testid tour-leg-margin-pct)");
  if (!/data-testid="tour-totals-margin-pct"/.test(tab)) errors.push("TourPreSettlementTab tour-totals margin % must render in its own element (data-testid tour-totals-margin-pct)");
  if (!/\["Margin %",\s*pct\(leg\.margin_pct\)\]/.test(tab)) errors.push('TourPreSettlementTab leg popup must list "Margin %" as its own row');

  return errors;
}

const base = {
  setl: fs.readFileSync(SETL, "utf8"),
  board: fs.readFileSync(BOARD, "utf8"),
  tab: fs.readFileSync(TAB, "utf8"),
};

function withField(field, transform) {
  return { ...base, [field]: transform(base[field]) };
}

if (process.argv.includes("--selftest")) {
  const clean = analyze(base);
  if (clean.length) {
    console.error(`SELFTEST FAIL — clean source rejected:\n- ${clean.join("\n- ")}`);
    process.exit(1);
  }
  const mutations = [
    ["setl recombines margin", withField("setl", (s) => s.replace(/render: r => <span className=\{r\.margin_cents < 0 \? "text-\[#991B1B\]" : undefined\}>\{fmt\(r\.margin_cents\)\}<\/span> \},/, 'render: r => <span className={r.margin_cents < 0 ? "text-[#991B1B]" : undefined}>{fmt(r.margin_cents)}{r.margin_pct == null ? "" : ` · ${r.margin_pct.toFixed(1)}%`}</span> },'))],
    ["setl drops pct testId", withField("setl", (s) => s.replace(/setl-tour-col-margin-pct/g, "gone"))],
    ["setl drops pct label", withField("setl", (s) => s.replace(/label: "Margin %"/g, 'label: "X"'))],
    ["setl drops pct render", withField("setl", (s) => s.replace(/r\.margin_pct\.toFixed\(1\)\}%/g, '"x"}'))],
    ["board drops pct testId", withField("board", (s) => s.replace(/tour-col-margin-pct/g, "gone"))],
    ["board drops pct key", withField("board", (s) => s.replace(/key: "tour_margin_pct"/g, 'key: "gone"'))],
    ["board drops pct render", withField("board", (s) => s.replace(/r\.margin_pct\.toFixed\(1\)\}%/g, '"x"}'))],
    ["tab jams pct inline", withField("tab", (s) => s.replace(/\{money\(l\.margin_cents, currencyCode\)\}<span className="ldt-sub" data-testid="tour-leg-margin-pct">\{pct\(l\.margin_pct\)\}<\/span>/, '{money(l.margin_cents, currencyCode)} · {pct(l.margin_pct)}'))],
    ["tab drops leg pct testid", withField("tab", (s) => s.replace(/tour-leg-margin-pct/g, "gone"))],
    ["tab drops totals pct testid", withField("tab", (s) => s.replace(/tour-totals-margin-pct/g, "gone"))],
    ["tab drops popup Margin % row", withField("tab", (s) => s.replace(/\["Margin %", pct\(leg\.margin_pct\)\]/g, ""))],
  ];
  let caught = 0;
  for (const [label, mutated] of mutations) {
    if (analyze(mutated).length > 0) { caught += 1; continue; }
    console.error(`SELFTEST FAIL — mutation escaped: ${label}`);
    process.exit(1);
  }
  console.log(`PASS verify-settlement-margin-pct-separate-columns --selftest ${caught}/${mutations.length}`);
  process.exit(0);
}

const failures = analyze(base);
if (failures.length) {
  console.error("FAIL verify-settlement-margin-pct-separate-columns");
  failures.forEach((f) => console.error(`- ${f}`));
  process.exit(1);
}
console.log("PASS verify-settlement-margin-pct-separate-columns");

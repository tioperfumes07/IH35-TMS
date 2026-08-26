#!/usr/bin/env node
/**
 * DISP-F6480 (GO-2237 item 6) — the compact "Filings / Compliance Due" home widget rendered only
 * `item.program`, which is IDENTICAL across every row of the same filing type. Live-confirmed on
 * origin/main: this company has two real, distinct Texas Business Personal Property Tax Rendition
 * filings due 2026-04-15 (one per appraisal district -- Bexar County and Webb County), both real
 * `accounting.property_tax_renditions` rows, both correctly labeled by the backend's own `detail`
 * field ("Bexar Appraisal District — 2026 rendition (draft)" vs "Webb County Appraisal District —
 * 2026 rendition (draft)") -- but the home widget showed both rows as the exact same text
 * "Texas Business Personal Property Tax Rendition · 04/15/2026", with zero way to tell them apart.
 * The full /compliance dashboard (FilingsComplianceDueSection.tsx) already renders Program AND
 * Detail as separate columns; only this compact widget silently dropped Detail.
 *
 * This guard proves the widget renders `item.detail` as a secondary line alongside `item.program`.
 *
 * Self-test: node scripts/verify-home-filings-widget-shows-detail.mjs --selftest
 */
import fs from "node:fs";

const LABEL = "verify-home-filings-widget-shows-detail";
const FILE = "apps/frontend/src/components/home/ComplianceFilingsDueWidget.tsx";

const CHECKS = [
  {
    name: "widget renders item.program (the primary line, unchanged)",
    test: (text) => /<span className="block truncate">\{item\.program\}<\/span>/.test(text),
  },
  {
    name: "widget also renders item.detail as a distinguishing secondary line",
    test: (text) => /item\.detail \? <span className="block truncate text-slate-400">\{item\.detail\}<\/span> : null/.test(text),
  },
  {
    name: "due_date column is still rendered (not accidentally dropped while adding detail)",
    test: (text) => /\{item\.due_date \? formatDateUS\(item\.due_date\) : "—"\}/.test(text),
  },
];

const stripComments = (text) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (match) => " ".repeat(match.length));

function collectFailures(text) {
  return CHECKS.filter((check) => !check.test(text)).map((check) => check.name);
}

const rawSource = fs.readFileSync(FILE, "utf8");
const source = stripComments(rawSource);

if (process.argv.includes("--selftest")) {
  const baseline = collectFailures(source);
  if (baseline.length) {
    console.error(`[${LABEL}] SELFTEST baseline FAIL:\n- ${baseline.join("\n- ")}`);
    process.exit(1);
  }
  const mutations = [
    {
      name: "drop the detail line (regress to program-only)",
      text: source.replace(
        /\{item\.detail \? <span className="block truncate text-slate-400">\{item\.detail\}<\/span> : null\}/,
        ""
      ),
    },
    {
      name: "drop the program line",
      text: source.replace(/<span className="block truncate">\{item\.program\}<\/span>/, ""),
    },
    {
      name: "drop the due-date column",
      text: source.replace(/\{item\.due_date \? formatDateUS\(item\.due_date\) : "—"\}/, "{null}"),
    },
  ];
  let caught = 0;
  for (const m of mutations) {
    const failures = collectFailures(m.text);
    if (failures.length > 0) caught += 1;
    else console.error(`SELFTEST FAIL — mutation "${m.name}" was NOT caught`);
  }
  if (caught !== mutations.length) {
    console.error(`[${LABEL}] selftest: ${caught}/${mutations.length} mutations caught`);
    process.exit(1);
  }
  console.log(`[${LABEL}] --selftest PASS: ${caught}/${mutations.length} mutations caught`);
  process.exit(0);
}

const failures = collectFailures(source);
if (failures.length) {
  console.error(`[${LABEL}] FAIL:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`[${LABEL}] PASS: home filings widget shows program + distinguishing detail + due date`);

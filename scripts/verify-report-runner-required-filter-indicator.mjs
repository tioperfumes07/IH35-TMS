#!/usr/bin/env node
/** @matrix-built {"modules":["reports"],"cols":["connectivity"],"leaves":["reports.runner.required_filter_indicator"],"task":"LV-REPORT-RUNNER-REQUIRED-FILTER-NO-INDICATOR-2026-08-23","vertical":"class-sweep"} */
/**
 * LV-REPORT-RUNNER-REQUIRED-FILTER-NO-INDICATOR-2026-08-23: root-caused live on
 * /reports/run/driver-pay-history -- "Run report" stayed silently disabled until a Driver was
 * selected, but the "Driver" filter label carried no required-field indicator, so an operator had
 * no way to tell why the button wouldn't enable. Confirmed via DOM inspection (button.disabled=true)
 * that requiredMissing() in RunnerFilters.tsx already gates on filter.required correctly -- only the
 * label rendering never read that flag. Systemic across every filter type in the same file (5 render
 * sites), not unique to driver-pay-history.
 *
 * Self-test: node scripts/verify-report-runner-required-filter-indicator.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  filters: "apps/frontend/src/pages/reports/runners/RunnerFilters.tsx",
};
const LABEL = "verify-report-runner-required-filter-indicator";

export function audit(src) {
  const failures = [];
  if (!/function FilterLabel\(\{ filter \}: \{ filter: RunnerFilter \}\)/.test(src.filters)) {
    failures.push(`${FILES.filters}: shared FilterLabel helper missing`);
    return failures;
  }
  if (!/\{filter\.required \? \(\s*<span className="ml-0\.5 text-red-600" aria-hidden="true">\s*\*/.test(src.filters)) {
    failures.push(`${FILES.filters}: FilterLabel must render a required-field marker when filter.required is true`);
  }
  // Every filter-type render branch must use the shared FilterLabel, not a bare {filter.label} div.
  const bareLabelCount = (src.filters.match(/<div className="mb-1 text-xs font-semibold text-slate-600">\{filter\.label\}<\/div>/g) || []).length;
  if (bareLabelCount > 0) {
    failures.push(
      `${FILES.filters}: ${bareLabelCount} filter label(s) still render the bare {filter.label} div instead of <FilterLabel filter={filter} /> -- required filters there would silently disable "Run report" with no visual cue`,
    );
  }
  const filterLabelUsages = (src.filters.match(/<FilterLabel filter=\{filter\} \/>/g) || []).length;
  if (filterLabelUsages < 5) {
    failures.push(
      `${FILES.filters}: expected FilterLabel used at all 5 filter-type render sites (date_range, month_picker, unit_select, driver_select, company fallback), found ${filterLabelUsages}`,
    );
  }
  return failures;
}

function loadSrc(root) {
  return {
    filters: fs.readFileSync(path.join(root, FILES.filters), "utf8"),
  };
}

if (process.argv.includes("--selftest")) {
  const good = loadSrc(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }
  const mutations = [
    [
      "drop-required-marker",
      "filters",
      /\{filter\.required \? \(\s*<span className="ml-0\.5 text-red-600" aria-hidden="true">\s*\*\s*<\/span>\s*\) : null\}/,
      "null",
    ],
    [
      "revert-one-site-to-bare-label",
      "filters",
      '<FilterLabel filter={filter} />',
      '<div className="mb-1 text-xs font-semibold text-slate-600">{filter.label}</div>',
    ],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const mutated = { ...good, [key]: good[key].replace(pattern, replacement) };
    if (mutated[key] === good[key]) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}: pattern did not match source, re-anchor`);
      process.exit(1);
    }
    if (audit(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}: mutation escaped`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`);
  process.exit(0);
}

const failures = audit(loadSrc(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — every report-runner filter label shows a required-field marker when owed`);

#!/usr/bin/env node
/**
 * verify-wo-time-tracking-no-raw-uuid.mjs
 * CLS-RAW-UUID-LABEL — WOTimeTrackingPanel entries table must show labor code labels,
 * not raw UUID slices (operator-visible id column is forbidden).
 *
 * --selftest exercises pass + raw-uuid / missing-label failure fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/frontend/src/pages/work-orders/WOTimeTrackingPanel.tsx";
const LABEL = "verify-wo-time-tracking-no-raw-uuid";

/** @param {string} src full component source */
export function collectProblems(src) {
  const problems = [];
  if (!src.includes('data-testid="wo-time-tracking-panel"')) {
    problems.push(`${TARGET}: missing wo-time-tracking-panel wrapper`);
    return problems;
  }
  if (!/label: "Labor code"/.test(src)) {
    problems.push(`${TARGET}: entries table must label labor code column (not raw entry UUID)`);
  }
  if (/label: "ID"/.test(src)) {
    problems.push(`${TARGET}: must not keep operator-visible ID column (raw UUID slice)`);
  }
  if (/\.slice\(0,\s*8\)/.test(src)) {
    problems.push(`${TARGET}: must not render raw UUID slices in operator-visible entry labels`);
  }
  if (!src.includes("laborEntryCodeLabel")) {
    problems.push(`${TARGET}: must resolve labor_code_id / embedded labor_code to a human label`);
  }
  if (/text-amber-/.test(src)) {
    problems.push(`${TARGET}: open-timer hint must use slate tokens (§7 navy/slate nonfinancial palette)`);
  }
  return problems;
}

function selftest() {
  const good = `
    function laborEntryCodeLabel(row, codes) { return "General labor"; }
    export function WOTimeTrackingPanel() {
      return (
        <div data-testid="wo-time-tracking-panel">
          <span className="text-xs text-slate-600">An open timer exists</span>
          const columns = [{ key: "labor_code", label: "Labor code", render: (row) => laborEntryCodeLabel(row, []) }];
        </div>
      );
    }
  `;

  const badUuid = `
    export function WOTimeTrackingPanel() {
      return (
        <div data-testid="wo-time-tracking-panel">
          { String(row.id ?? "").slice(0, 8) }
          { key: "id", label: "ID" }
        </div>
      );
    }
  `;

  const badAmber = `
    function laborEntryCodeLabel() {}
    export function WOTimeTrackingPanel() {
      return (
        <div data-testid="wo-time-tracking-panel">
          <span className="text-amber-700">warn</span>
          { label: "Labor code" }
        </div>
      );
    }
  `;

  const goodProblems = collectProblems(good);
  const badUuidProblems = collectProblems(badUuid);
  const badAmberProblems = collectProblems(badAmber);

  if (goodProblems.length) {
    console.error(`${LABEL} --selftest FAIL good fixture:`, goodProblems);
    process.exit(1);
  }
  if (badUuidProblems.length < 2) {
    console.error(`${LABEL} --selftest FAIL badUuid fixture should fail hard:`, badUuidProblems);
    process.exit(1);
  }
  if (!badAmberProblems.some((p) => p.includes("slate"))) {
    console.error(`${LABEL} --selftest FAIL badAmber fixture should catch amber:`, badAmberProblems);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const src = fs.readFileSync(path.join(ROOT, TARGET), "utf8");
  const problems = collectProblems(src);
  if (problems.length) {
    console.error(`FAIL ${LABEL}:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`OK ${LABEL}: ${TARGET} shows labor code labels; no raw UUID slices or amber hint.`);
}

main();

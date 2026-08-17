#!/usr/bin/env node
/**
 * verify-reports-booking-gap-staged-period-filter.mjs
 * LV-REPORTS-BOOKING-GAP-UNSTAGED-PERIOD-FILTER
 *
 * Period must stage behind CollapsedListFilters (no immediate setPeriod refetch).
 * Option labels must be human (Week/Month/Quarter), not raw enum tokens.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-reports-booking-gap-staged-period-filter";
const PAGE = "apps/frontend/src/pages/reports/BookingGapReport.tsx";

function read() {
  return fs.readFileSync(path.join(process.cwd(), PAGE), "utf8");
}

function analyze(src = read()) {
  const failures = [];
  if (!/useStagedListFilters/.test(src) || !/CollapsedListFilters/.test(src)) {
    failures.push("BookingGapReport must use CollapsedListFilters + useStagedListFilters");
  }
  if (!/onApply=\{staged\.apply\}/.test(src) || !/onCancel=\{staged\.cancel\}/.test(src) || !/onReset=\{staged\.reset\}/.test(src)) {
    failures.push("BookingGapReport must wire Apply/Cancel/Reset to staged.*");
  }
  if (!/applyDisabled=\{!staged\.dirty\}/.test(src)) {
    failures.push("BookingGapReport Apply must stay disabled until staged.dirty");
  }
  if (/const \[period,\s*setPeriod\]/.test(src) || /onClick=\{\(\)\s*=>\s*setPeriod\(/.test(src)) {
    failures.push("BookingGapReport must not immediately commit period via setPeriod");
  }
  if (!/queryKey:\s*\["booking-gap".*applied\.period|periodDates\(applied\.period\)/.test(src)) {
    // softer: query must derive from applied, not draft
    if (!/periodDates\(applied\.period\)/.test(src)) {
      failures.push("query window must derive from applied.period (not draft/setPeriod)");
    }
  }
  for (const label of ["Week", "Month", "Quarter"]) {
    if (!src.includes(`"${label}"`) && !src.includes(`'${label}'`)) {
      failures.push(`accessible period label missing: ${label}`);
    }
  }
  // Reject capitalize-only raw enum as sole child of period button
  if (/\{\s*p\s*\}/.test(src) && /capitalize/.test(src) && /setPeriod/.test(src)) {
    failures.push("must not render raw period enum tokens as the only accessible name");
  }
  if (!/PERIOD_LABELS/.test(src)) {
    failures.push("must use PERIOD_LABELS for human Week/Month/Quarter copy");
  }
  return failures;
}

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

function selftest() {
  const pagePath = path.join(process.cwd(), PAGE);
  const original = fs.readFileSync(pagePath, "utf8");
  try {
    const bad = `
export function BookingGapReport() {
  const [period, setPeriod] = useState("week");
  const { from, to } = periodDates(period);
  useQuery({ queryKey: ["booking-gap", from, to] });
  return (
    <div className="flex gap-2">
      {(["week", "month", "quarter"]).map((p) => (
        <button key={p} type="button" onClick={() => setPeriod(p)} className="capitalize">{p}</button>
      ))}
    </div>
  );
}
`;
    fs.writeFileSync(pagePath, bad);
    const planted = analyze(bad);
    if (planted.length === 0) fail("selftest expected planted unstaged period to fail");
  } finally {
    fs.writeFileSync(pagePath, original);
  }
  const good = analyze();
  if (good.length) fail(`selftest expected GOOD: ${good.join("; ")}`);
  console.log(`${LABEL} selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const failures = analyze();
if (failures.length) fail(failures.join("; "));
console.log(`${LABEL} PASS — Booking Gap period is staged with human Week/Month/Quarter labels`);

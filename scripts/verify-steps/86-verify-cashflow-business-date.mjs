import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Cash-Flow business-date guard (regression lock for CASHFLOW-1).
 *
 * The Cash Flow page is the owner's daily cash-position headline. It defaulted "today" to the UTC
 * calendar date (`new Date().toISOString().slice(0,10)`), so after ~19:00 Central it fetched
 * TOMORROW's prediction and HID today's real expected revenue (a $4,900 delivery showed as a flat
 * $0 day). The date defaults must come from the company business date (companyToday/the businessDate
 * helpers), like #1667. This guard pins both Cash Flow tabs to that helper and bans reintroducing the
 * UTC date-only anti-pattern.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");

const TARGETS = [
  "apps/frontend/src/pages/cash-flow/tabs/DailyPredictionTab.tsx",
  "apps/frontend/src/pages/cash-flow/tabs/ActualVsProjectedTab.tsx",
];

const UTC_DATEONLY_RE = /new Date\(\)\s*\.\s*toISOString\(\)\s*\.\s*(?:slice|substring)\(\s*0\s*,\s*10\s*\)/;

/**
 * Actual vs Projected must key its fetch on the COMMITTED range, never the draft DatePicker values
 * (CLS-FILTER-GEAR-APPLY). LEAD 443.107 ruling on row 4068: verify-cash-flow-avp-staged-filters
 * (LV-CASH-FLOW-ACTUAL-SPLIT-FILTER-APPLY, faef76faf7) stands — From/To + variance live in one
 * useStagedListFilters draft and the committed range is the `applied` object. This check pins the
 * same intent in that shape: the queryKey reads applied.from / applied.to (no staged.draft in it),
 * and the only commit is onApply's setApplied(next) after the From<=To check.
 */
export function checkAvpCommittedRange(rel, src) {
  const v = [];
  const key = src.match(/queryKey:\s*\[\s*"cash-flow-avp"[^\]]*\]/);
  if (!key) v.push(`${rel}: Actual vs Projected query must be keyed ["cash-flow-avp", ...].`);
  else {
    if (!/applied\.from/.test(key[0]) || !/applied\.to/.test(key[0])) v.push(`${rel}: queryKey must use the committed applied.from / applied.to.`);
    if (/staged\.draft|draft\./.test(key[0])) v.push(`${rel}: queryKey must not use draft DatePicker values.`);
  }
  if (!/onApply:\s*\(next\)\s*=>\s*\{[\s\S]{0,200}?next\.from\s*>\s*next\.to[\s\S]{0,120}?setApplied\(next\)/.test(src)) {
    v.push(`${rel}: Apply must commit the staged draft into applied via setApplied(next) after the From<=To check.`);
  }
  return v;
}

function runGuard() {
  const violations = [];
  for (const rel of TARGETS) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) {
      violations.push(`${rel}: file missing — Cash Flow tab moved? update this guard.`);
      continue;
    }
    const src = fs.readFileSync(abs, "utf8");
    if (!src.includes("companyToday")) {
      violations.push(`${rel}: must derive its date default from companyToday() (company tz), not the UTC date.`);
    }
    if (UTC_DATEONLY_RE.test(src)) {
      violations.push(`${rel}: contains new Date().toISOString().slice(0,10) — reintroduces the cash-position "today = tomorrow" bug.`);
    }
    if (rel.endsWith("ActualVsProjectedTab.tsx")) violations.push(...checkAvpCommittedRange(rel, src));
  }

  if (violations.length > 0) {
    console.error("verify-cashflow-business-date FAILED:");
    for (const v of violations) console.error(`  - ${v}`);
    console.error("Fix: default Cash Flow dates with companyToday()/addDaysIso from lib/businessDate.");
    process.exit(1);
  }
  console.log(`verify-cashflow-business-date OK — ${TARGETS.length} Cash Flow tabs use the company business date.`);
}

export default {
  name: "verify-cashflow-business-date",
  run: () => runGuard(),
};

function selftest() {
  const rel = "ActualVsProjectedTab.tsx";
  const real = fs.readFileSync(path.join(ROOT, TARGETS[1]), "utf8");
  let ok = true;
  const ex = (n, c) => { if (!c) { console.error(`SELFTEST FAIL: ${n}`); ok = false; } };
  ex("real Actual vs Projected passes", checkAvpCommittedRange(rel, real).length === 0);
  ex("queryKey on the draft DatePicker values is caught",
    checkAvpCommittedRange(rel, real.replace(/applied\.from, applied\.to\]/, "staged.draft.from, staged.draft.to]")).length > 0);
  ex("queryKey without the committed range is caught",
    checkAvpCommittedRange(rel, real.replace(/, applied\.from, applied\.to\]/, "]")).length > 0);
  ex("Apply that no longer commits is caught", checkAvpCommittedRange(rel, real.replace("setApplied(next)", "void next")).length > 0);
  ex("Apply that skips the From<=To check is caught",
    checkAvpCommittedRange(rel, real.replace(/if \(next\.from > next\.to\) return;/, "")).length > 0);
  ex("UTC date-only anti-pattern still detected", UTC_DATEONLY_RE.test("const d = new Date().toISOString().slice(0, 10);"));
  console.log(ok ? "verify-cashflow-business-date --selftest PASS (6/6)" : "verify-cashflow-business-date --selftest FAIL");
  process.exit(ok ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--selftest")) selftest();
  else runGuard();
}

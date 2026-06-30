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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runGuard();
}

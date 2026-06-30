import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Load-Number business-date guard (regression lock for DISPATCH-1).
 *
 * The Load Number is a PERSISTED business identifier of the form L[-TOKEN]-YYYYMMDD-NNNN. The date
 * segment was built from `new Date().toISOString().slice(0,10)` (UTC), so a load booked at 7 PM
 * Central on 2026-06-29 was numbered L-20260630-0001 (June 30). It must be built from the company
 * business date (America/Chicago) via lib/company-business-date.companyBusinessDateCompact.
 *
 * This guard pins both load-number generators: each must (a) reference companyBusinessDateCompact
 * and (b) NOT contain the UTC date-only anti-pattern `toISOString().slice(0,10)` /
 * `toISOString().substring(0,10)`. It fails loudly if either is reverted.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");

const TARGETS = [
  "apps/backend/src/dispatch/load-id-reservation.service.ts",
  "apps/backend/src/mdata/loads.routes.ts",
];

const UTC_DATEONLY_RE = /toISOString\(\)\s*\.\s*(?:slice|substring)\(\s*0\s*,\s*10\s*\)/;

function runGuard() {
  const violations = [];
  for (const rel of TARGETS) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) {
      violations.push(`${rel}: file missing — load-number generator moved? update this guard.`);
      continue;
    }
    const src = fs.readFileSync(abs, "utf8");
    if (!src.includes("companyBusinessDateCompact")) {
      violations.push(`${rel}: does not use companyBusinessDateCompact — Load Number date must be company-tz (Central), not UTC.`);
    }
    if (UTC_DATEONLY_RE.test(src)) {
      violations.push(`${rel}: contains the UTC date-only anti-pattern toISOString().slice(0,10) — reintroduces the L-<tomorrow> Load Number bug.`);
    }
  }

  if (violations.length > 0) {
    console.error("verify-load-number-business-date FAILED:");
    for (const v of violations) console.error(`  - ${v}`);
    console.error("Fix: build the Load Number date with companyBusinessDateCompact() from lib/company-business-date.");
    process.exit(1);
  }
  console.log(`verify-load-number-business-date OK — ${TARGETS.length} generators use the company business date.`);
}

export default {
  name: "verify-load-number-business-date",
  run: () => runGuard(),
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runGuard();
}

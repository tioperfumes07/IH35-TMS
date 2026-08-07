#!/usr/bin/env node
/**
 * CALENDAR/DATE — Maintenance Compliance425CPage rendered created_at via String(row.created_at),
 * leaking raw ISO timestamps ("2026-07-03T12:00:00.000Z") into the 425C audit linkage table.
 * The String() wrapper bypasses verify-no-iso-date-display and verify-no-native-datetime-input
 * (which only match bare member expressions, not String(...) calls).
 *
 * Fix: route the Timestamp column through formatDateTimeUS() (Central Time, MM/DD/YYYY h:mm AM/PM).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-maintenance-compliance425c-timestamp-format";
const ROOT = process.cwd();
const PAGE = "apps/frontend/src/pages/maintenance/compliance/Compliance425CPage.tsx";

function read(rel) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) return null;
  return fs.readFileSync(full, "utf8");
}

export function collectProblems(source) {
  const src = source ?? read(PAGE);
  const errors = [];
  if (!src) {
    errors.push(`missing ${PAGE}`);
    return errors;
  }

  if (!/import\s*\{[^}]*formatDateTimeUS[^}]*\}\s*from\s*["'][^"']*lib\/formatDate["']/.test(src)) {
    errors.push(`${PAGE}: must import formatDateTimeUS from lib/formatDate`);
  }

  if (/String\s*\(\s*row\.created_at/.test(src)) {
    errors.push(
      `${PAGE}: Timestamp column still uses String(row.created_at) — raw ISO leaks to the operator`
    );
  }

  if (!/formatDateTimeUS\s*\(\s*row\.created_at/.test(src)) {
    errors.push(`${PAGE}: created_at column must render via formatDateTimeUS(row.created_at)`);
  }

  return errors;
}

function selftest() {
  const good = read(PAGE);
  if (!good) {
    console.error(`${LABEL}: selftest FAIL — ${PAGE} missing`);
    process.exit(1);
  }

  const failures = [];

  const clean = collectProblems(good);
  if (clean.length) failures.push(`corrected source flagged: ${clean.join("; ")}`);

  const badString = good.replace(
    /formatDateTimeUS\(row\.created_at as string\) \|\| "—"/,
    'String(row.created_at ?? "—")'
  );
  if (badString === good) failures.push("mutation INERT — could not plant String(row.created_at)");
  else if (collectProblems(badString).length === 0)
    failures.push("planted String(row.created_at) not caught");

  const badBare = good.replace(/formatDateTimeUS\(row\.created_at as string\)/, "row.created_at");
  if (badBare === good) failures.push("mutation INERT — could not plant bare row.created_at");
  else if (!collectProblems(badBare).some((p) => /formatDateTimeUS/.test(p)))
    failures.push("missing formatDateTimeUS not caught");

  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS — String() leak caught, formatDateTimeUS required, corrected source clean`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const problems = collectProblems();
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — Compliance425C Timestamp column uses formatDateTimeUS, not raw ISO`);
}

main();

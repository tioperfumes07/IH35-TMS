#!/usr/bin/env node
/** @matrix-built {"modules":["accounting","fleet"],"cols":["trailer","connectivity","reverse_link"],"leafRe":"^(expenses\.|trailer\.|detail)","task":"CREATE-PATH-TRIP-EXPENSE-DETAIL-TRAILER","pr":"#6332"} */
/** ExpenseDetailPage must EntityLink trailer when API returns trailer_id. Cursor EVEN: 3142. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-expense-detail-trailer-link";
const SELFTEST = process.argv.includes("--selftest");
const PAGE = "apps/frontend/src/pages/accounting/ExpenseDetailPage.tsx";
const API = "apps/frontend/src/api/accounting.ts";

export function collectProblems(page, api) {
  const problems = [];
  if (!/trailer_id\?:\s*string\s*\|\s*null/.test(api) || !/trailer_display_id\?:/.test(api)) {
    problems.push(`${API}: ExpenseDetail must include trailer_id + trailer_display_id`);
  }
  if (!/kind=["']trailer["']/.test(page) || !/expense\.trailer_id/.test(page)) {
    problems.push(`${PAGE}: must EntityLink kind=trailer when expense.trailer_id set`);
  }
  return problems;
}

if (SELFTEST) {
  const bad = collectProblems("unit only", "unit_id: string | null;");
  const good = collectProblems(
    `expense.trailer_id ? <EntityLink kind="trailer" id={expense.trailer_id} />`,
    `trailer_id?: string | null;\n  trailer_display_id?: string | null;`
  );
  if (bad.length < 2 || good.length !== 0) {
    console.error(`${LABEL} SELFTEST FAIL`, { bad, good });
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST OK`);
  process.exit(0);
}

const problems = collectProblems(
  fs.readFileSync(path.join(ROOT, PAGE), "utf8"),
  fs.readFileSync(path.join(ROOT, API), "utf8")
);
if (problems.length) {
  console.error(`${LABEL} FAIL`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — expense detail trailer EntityLink`);

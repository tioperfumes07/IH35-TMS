#!/usr/bin/env node
// LEGAL-MATTERS-SOL-COUNTDOWN-TZ-OFFBYONE + LEGAL-MATTER-DEADLINE-RAW-TIMESTAMP-DISPLAY — guard
//
// Two date-display defects in the Legal Matters deadline feature:
//  - LegalMattersListPage.tsx's daysUntil() built `new Date(dateStr)` then called
//    `.setHours(0,0,0,0)`, which re-derives the target's calendar day in the VIEWER's browser
//    timezone. statute_of_limitations_at is a `date` column that serializes as a full UTC ISO
//    instant; any negative-UTC-offset viewer (all of the continental US, including this
//    company's own Central Time) saw the SOL countdown badge understate the true days remaining
//    by one. Fixed to parse the calendar-date digits directly and diff against companyToday().
//  - LegalMatterDetailPage.tsx's deadline list rendered `String(d.deadline_at ?? "")` — the raw
//    ISO instant verbatim — instead of formatting it through formatDateTimeUS like every sibling
//    date field on the same page. An evening-hour CT deadline (e.g. 11 PM) displays as the WRONG
//    calendar day (the next day, in UTC) to every viewer regardless of their own timezone.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const LIST_FILE = "apps/frontend/src/pages/legal/matters/LegalMattersListPage.tsx";
const DETAIL_FILE = "apps/frontend/src/pages/legal/matters/LegalMatterDetailPage.tsx";

export function check(listText, detailText) {
  const failures = [];

  if (!/import\s*\{\s*companyToday\s*\}\s*from\s*"..\/..\/..\/lib\/businessDate"/.test(listText)) {
    failures.push(`${LIST_FILE} no longer imports companyToday`);
  }
  const daysUntilIdx = listText.indexOf("function daysUntil(dateStr: unknown) {");
  const daysUntilBlock = daysUntilIdx >= 0 ? listText.slice(daysUntilIdx, daysUntilIdx + 500) : "";
  if (!/companyToday\(\)/.test(daysUntilBlock)) {
    failures.push(`${LIST_FILE} daysUntil() no longer anchors "today" via companyToday()`);
  }
  if (/\.setHours\(0,\s*0,\s*0,\s*0\)/.test(daysUntilBlock)) {
    failures.push(`${LIST_FILE} daysUntil() reverted to the browser-local .setHours(0,0,0,0) pattern`);
  }

  const deadlineIdx = detailText.indexOf('properEnumOrFilterLabel(d.deadline_type)} · ');
  const deadlineBlock = deadlineIdx >= 0 ? detailText.slice(deadlineIdx, deadlineIdx + 120) : "";
  if (!/formatDateTimeUS\(d\.deadline_at as string\)/.test(deadlineBlock)) {
    failures.push(`${DETAIL_FILE} deadline row no longer formats deadline_at via formatDateTimeUS`);
  }

  return failures;
}

function run() {
  const listText = fs.readFileSync(path.join(root, LIST_FILE), "utf8");
  const detailText = fs.readFileSync(path.join(root, DETAIL_FILE), "utf8");
  const failures = check(listText, detailText);
  if (failures.length > 0) {
    console.error("FAIL: legal-matters-deadline-date-display");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: Legal Matters SOL countdown + deadline display are timezone-safe");
}

function selftest() {
  const listText = fs.readFileSync(path.join(root, LIST_FILE), "utf8");
  const detailText = fs.readFileSync(path.join(root, DETAIL_FILE), "utf8");

  const offenderA = listText.replace(
    "  const [ty, tmo, td] = companyToday().split(\"-\").map(Number);\n  const todayUTC = Date.UTC(ty, tmo - 1, td);\n  return Math.round((targetUTC - todayUTC) / (24 * 3600 * 1000));",
    "  return Math.ceil((targetUTC - new Date().setHours(0, 0, 0, 0)) / (24 * 3600 * 1000));"
  );
  if (offenderA === listText) {
    console.error("FAIL(selftest): offender mutation A did not change the file — pattern out of sync");
    process.exit(1);
  }
  if (check(offenderA, detailText).length === 0) {
    console.error("FAIL(selftest): planted offender (daysUntil reverted) was NOT caught");
    process.exit(1);
  }

  const offenderB = detailText.replace(
    "formatDateTimeUS(d.deadline_at as string)",
    'String(d.deadline_at ?? "")'
  );
  if (offenderB === detailText) {
    console.error("FAIL(selftest): offender mutation B did not change the file — pattern out of sync");
    process.exit(1);
  }
  if (check(listText, offenderB).length === 0) {
    console.error("FAIL(selftest): planted offender (deadline_at raw display reverted) was NOT caught");
    process.exit(1);
  }

  console.log("PASS(selftest): 2/2 planted regressions correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}

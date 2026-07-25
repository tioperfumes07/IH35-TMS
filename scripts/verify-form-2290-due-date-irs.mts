const FE = "apps/frontend/src/pages/compliance/Form2290Filings.tsx";
// verify-form-2290-due-date-irs.mts — the BEHAVIOURAL half of verify-step 1500 (SAF-F32).
//
// Split into a .mts file because the verify-steps runner executes plain `node`, which cannot import a
// TypeScript module. The step spawns this through tsx. Keeping the assertions here — rather than
// regressing them to a grep — is the whole point: this calls the real date functions on real dates, so
// a reimplementation that keeps the names and returns Aug 31 for everything still fails.
import fs from "node:fs";
import * as mod from "../apps/backend/src/compliance/form-2290-generator.js";

const { form2290DueDateForFirstUse, upcomingForm2290Deadline, usFederalHolidays, nextBusinessDay } = mod;
const problems: string[] = [];
const check = (label: string, actual: string, expected: string) => {
  if (actual !== expected) problems.push(`${label}: expected ${expected}, got ${actual}`);
};

// 1. Last day of the month FOLLOWING first use — the clause that was missing entirely.
check("July 2026 first use", form2290DueDateForFirstUse("2026-07-15"), "2026-08-31");
check("November 2026 first use", form2290DueDateForFirstUse("2026-11-03"), "2026-12-31");
check("January 2027 first use", form2290DueDateForFirstUse("2027-01-05"), "2027-03-01"); // Feb 28 2027 = Sunday
check("January 2028 first use (leap)", form2290DueDateForFirstUse("2028-01-05"), "2028-02-29");

// 2. Every month must resolve to the last day of the NEXT month, before any shift. Proving the
//    rule for all 12 stops a fix that only special-cases July and December.
for (let m = 0; m < 12; m += 1) {
  const due = new Date(`${form2290DueDateForFirstUse(`2029-${String(m + 1).padStart(2, "0")}-10`)}T00:00:00Z`);
  const expectedMonthEnd = new Date(Date.UTC(2029, m + 2, 0));
  const shiftedDays = Math.round((due.getTime() - expectedMonthEnd.getTime()) / 86_400_000);
  if (shiftedDays < 0 || shiftedDays > 4) {
    problems.push(`first use month ${m + 1}: due ${due.toISOString().slice(0, 10)} is not the following month-end (or a business-day roll from it)`);
  }
}

// 3. The business-day shift must actually fire. Aug 31 2024 is a Saturday; Sep 1 Sunday; Sep 2 is
//    Labor Day — so the only correct answer is Sep 3. A weekend-only implementation returns Sep 2.
check("Aug 31 2024 (Sat) + Labor Day", upcomingForm2290Deadline(new Date("2024-07-01T00:00:00Z")).deadline, "2024-09-03");
check("Aug 31 2025 (Sun) + Labor Day", upcomingForm2290Deadline(new Date("2025-07-01T00:00:00Z")).deadline, "2025-09-02");
check("Aug 31 2026 (Mon) unshifted", upcomingForm2290Deadline(new Date("2026-07-01T00:00:00Z")).deadline, "2026-08-31");

// 4. Memorial Day is the last Monday of May, so it CAN be May 31 — a real collision for an April
//    first use, and one a weekend-only shift misses.
if (!usFederalHolidays(2027).has("2027-05-31")) problems.push("2027-05-31 (Memorial Day) not recognised as a federal holiday");
check("April 2027 first use vs Memorial Day", form2290DueDateForFirstUse("2027-04-10"), "2027-06-01");

// 5. Observed-holiday rule: a Saturday Jan 1 is observed the preceding Dec 31, which is itself a
//    due date (November first use). Without it, Dec 31 2027 reads as an ordinary Friday.
if (!usFederalHolidays(2027).has("2027-12-31")) {
  problems.push("2027-12-31 should be observed New Year's Day (Jan 1 2028 is a Saturday)");
}
if (nextBusinessDay(new Date("2027-12-31T00:00:00Z")).toISOString().slice(0, 10) === "2027-12-31") {
  problems.push("nextBusinessDay did not roll off the observed holiday 2027-12-31");
}

// 6. The UI must not invent a date.
const fe = fs.readFileSync(FE, "utf8");
if (/["'`]Aug\s*31["'`]/.test(fe)) {
  problems.push(`${FE}: renders a hardcoded "Aug 31" fallback — a regulatory date invented by the UI`);
}


if (problems.length) {
  for (const p of problems) console.error(`  \u2717 ${p}`);
  console.error(`verify:form-2290-due-date-irs-correct FAIL \u2014 ${problems.length} problem(s)`);
  process.exit(1);
}
console.log("verify:form-2290-due-date-irs-correct OK \u2014 due date = last day of the month following first use, business-day shifted (weekends + federal holidays incl. observed); no invented date in the UI.");

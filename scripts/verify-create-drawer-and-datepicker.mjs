#!/usr/bin/env node
// verify-create-drawer-and-datepicker (Block B9)
//
// AccidentReportDrawer (apps/frontend/src/components/safety/AccidentReportDrawer.tsx) is the
// office-intake create/edit drawer for safety.accident_reports. Every date field in it — Incident
// Date, Report Date, and any future date field — must render through the shared calendar
// `DatePicker` component (apps/frontend/src/components/forms/DatePicker.tsx), never a raw
// text/ISO `<input>`. A raw input lets office staff type an unparseable/garbage date string with no
// calendar affordance, and it was previously how "Report Date" regressed to an uncontrolled,
// unwired `<input defaultValue={companyToday()} />` (never read into the save payload, never a real
// control) — B9 fixed that by wiring it to <DatePicker>.
//
// This guard statically fails if any `<Field label="...Date...">...</Field>` block in the drawer
// contains a raw `<input` instead of `<DatePicker`. Self-test: --selftest.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DRAWER_REL = "apps/frontend/src/components/safety/AccidentReportDrawer.tsx";

// Matches `<Field label="...">  ...body...  </Field>` (non-greedy across the body).
const FIELD_RE = /<Field\s+label="([^"]*)"[^>]*>([\s\S]*?)<\/Field>/g;

/**
 * Given the drawer's source text, return the list of date-field violations: field labels that
 * mention "Date" but whose rendered body uses a raw <input>/<textarea> instead of <DatePicker>.
 */
export function findDateFieldViolations(source) {
  const violations = [];
  let m;
  FIELD_RE.lastIndex = 0;
  while ((m = FIELD_RE.exec(source)) !== null) {
    const [, label, body] = m;
    if (!/date/i.test(label)) continue;
    const usesDatePicker = /<DatePicker\b/.test(body);
    const usesRawInput = /<input\b/i.test(body);
    if (!usesDatePicker || usesRawInput) {
      violations.push({ label, usesDatePicker, usesRawInput });
    }
  }
  return violations;
}

function run() {
  const abs = path.join(ROOT, DRAWER_REL);
  if (!fs.existsSync(abs)) {
    return [`MISSING FILE: ${DRAWER_REL} — the guard cannot verify it. Update this script if the file moved.`];
  }
  const src = fs.readFileSync(abs, "utf8");

  const errors = [];

  // Belt-and-suspenders: the component file itself must import the shared DatePicker.
  if (!/from\s+["']\.\.\/forms\/DatePicker["']/.test(src) && !/from\s+["'][^"']*\/forms\/DatePicker["']/.test(src)) {
    errors.push(
      `${DRAWER_REL} no longer imports the shared DatePicker (../forms/DatePicker). Every date field ` +
        `in this drawer must render the shared calendar picker, not a raw text/ISO input.`
    );
  }

  const violations = findDateFieldViolations(src);
  for (const v of violations) {
    if (!v.usesDatePicker) {
      errors.push(
        `${DRAWER_REL}: Field "${v.label}" does not render <DatePicker>. Date fields must use the ` +
          `shared calendar DatePicker (apps/frontend/src/components/forms/DatePicker.tsx), not a raw ` +
          `text/ISO <input>.`
      );
    } else if (v.usesRawInput) {
      errors.push(
        `${DRAWER_REL}: Field "${v.label}" mixes a raw <input> alongside <DatePicker> — remove the raw ` +
          `input so the calendar picker is the only control for this date field.`
      );
    }
  }

  return errors;
}

export { run };

if (process.argv.includes("--selftest")) {
  const cases = [
    [
      `<Field label="Report Date"><DatePicker value={reportDate} onChange={setReportDate} /></Field>`,
      0,
      "DatePicker-only date field passes",
    ],
    [
      `<Field label="Report Date"><input defaultValue={companyToday()} /></Field>`,
      1,
      "raw input date field fails",
    ],
    [
      `<Field label="Incident Date *"><DatePicker value={incidentDate} onChange={setIncidentDate} /></Field>`,
      0,
      "starred date label with DatePicker passes",
    ],
    [
      `<Field label="Police Report Number"><input /></Field>`,
      0,
      "non-date field with raw input is ignored",
    ],
    [
      `<Field label="Report Date"><DatePicker value={reportDate} onChange={setReportDate} /><input className="hidden" /></Field>`,
      1,
      "DatePicker plus a stray raw input still fails",
    ],
  ];
  const checks = cases.map(([src, wantCount, name]) => [name, findDateFieldViolations(src).length === wantCount]);
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error("verify-create-drawer-and-datepicker --selftest FAIL:");
    for (const [n] of failed) console.error("  ✗ " + n);
    process.exit(1);
  }
  console.log(`verify-create-drawer-and-datepicker --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const failures = run();
  if (failures.length) {
    console.error("verify-create-drawer-and-datepicker: FAIL\n");
    for (const f of failures) console.error("  ✗ " + f + "\n");
    process.exit(1);
  }
  console.log(
    "verify-create-drawer-and-datepicker: OK — every date field in AccidentReportDrawer (Incident Date, Report Date) renders the shared DatePicker."
  );
}

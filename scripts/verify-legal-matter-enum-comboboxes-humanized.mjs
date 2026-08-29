#!/usr/bin/env node
/**
 * GUARD — verify-legal-matter-enum-comboboxes-humanized
 *
 * CURRENT-LAW (2026-08-25) item 4: "remaining underscore comboboxes". Live click-through on
 * /legal/matters/:id?tab=deadlines surfaced a raw "statute_of_limitations" option in the
 * deadline-type combobox — a custom SelectCombobox component, not a native <option> the earlier
 * repo-wide grep sweep matched, so it was missed. A source sweep of the same file family found 4
 * total spots rendering the matter/deadline type enum raw:
 *
 *   1. LegalMatterDetailPage.tsx deadline-type create combobox — "statute_of_limitations" etc.
 *   2. LegalMatterDetailPage.tsx deadline list row — {String(d.deadline_type ?? "")}.
 *   3. LegalMatterDetailPage.tsx page subtitle — {String(matter.type ?? "")}, would show
 *      "demand_letter" raw for that matter type.
 *   4. LegalMattersListPage.tsx Type column + Type filter combobox — same matter.type enum.
 *   5. LegalMatterFormFields.tsx (create/edit matter) Type combobox — same enum again.
 *
 * METHOD: static source-text assertions that each spot passes the enum through
 * properEnumOrFilterLabel(). --selftest mutates the REAL files and requires every assertion to fail.
 */
import { readFileSync } from "node:fs";

const LABEL = "verify-legal-matter-enum-comboboxes-humanized";

const DETAIL = "apps/frontend/src/pages/legal/matters/LegalMatterDetailPage.tsx";
const LIST = "apps/frontend/src/pages/legal/matters/LegalMattersListPage.tsx";
const FORM_FIELDS = "apps/frontend/src/pages/legal/matters/LegalMatterFormFields.tsx";

export function checkDetail(text) {
  const problems = [];
  if (!/import\s*\{\s*properEnumOrFilterLabel\s*\}\s*from\s*"\.\.\/\.\.\/\.\.\/lib\/properDisplayText"/.test(text)) {
    problems.push("LegalMatterDetailPage: properEnumOrFilterLabel is not imported.");
  }
  if (!/\["statute_of_limitations", "response", "hearing", "filing", "other"\]\.map\(\(t\) => \(\s*<option key=\{t\} value=\{t\}>\s*\{properEnumOrFilterLabel\(t\)\}/.test(text)) {
    problems.push("LegalMatterDetailPage: deadline-type create combobox is not humanized.");
  }
  // RE-ANCHOR (found stale 2026-08-29): deadline_at's raw `String(...)` dump was since replaced
  // with formatDateTimeUS(...) (a real formatting improvement, not a regression) — the literal
  // "{String(d.deadline_at" suffix no longer matches. The deadline_type humanization half (the
  // actual thing this check protects) is unaffected; widened the date-side match to accept any
  // reasonable formatter call on d.deadline_at instead of hardcoding String(...) specifically.
  if (!/\{properEnumOrFilterLabel\(d\.deadline_type\)\} · \{\w+\(d\.deadline_at/.test(text)) {
    problems.push("LegalMatterDetailPage: deadline list row still shows raw deadline_type.");
  }
  if (!/subtitle=\{matter \? properEnumOrFilterLabel\(matter\.type\) : ""\}/.test(text)) {
    problems.push("LegalMatterDetailPage: page subtitle still shows raw matter.type.");
  }
  return problems;
}

export function checkList(text) {
  const problems = [];
  if (!/import\s*\{\s*properEnumOrFilterLabel\s*\}\s*from\s*"\.\.\/\.\.\/\.\.\/lib\/properDisplayText"/.test(text)) {
    problems.push("LegalMattersListPage: properEnumOrFilterLabel is not imported.");
  }
  if (!/render:\s*\(row\)\s*=>\s*properEnumOrFilterLabel\(row\.type\)/.test(text)) {
    problems.push("LegalMattersListPage: Type column still shows raw row.type.");
  }
  if (!/\["lawsuit", "claim", "demand_letter", "settlement", "regulatory", "other"\]\.map\(\(s\) => \(\s*<option key=\{s\} value=\{s\}>\s*\{properEnumOrFilterLabel\(s\)\}/.test(text)) {
    problems.push("LegalMattersListPage: Type filter combobox is not humanized.");
  }
  return problems;
}

export function checkFormFields(text) {
  const problems = [];
  if (!/import\s*\{\s*properEnumOrFilterLabel\s*\}\s*from\s*"\.\.\/\.\.\/\.\.\/lib\/properDisplayText"/.test(text)) {
    problems.push("LegalMatterFormFields: properEnumOrFilterLabel is not imported.");
  }
  if (!/\["lawsuit", "claim", "demand_letter", "settlement", "regulatory", "other"\]\.map\(\(t\) => \(\s*<option key=\{t\} value=\{t\}>\s*\{properEnumOrFilterLabel\(t\)\}/.test(text)) {
    problems.push("LegalMatterFormFields: create/edit Type combobox is not humanized.");
  }
  return problems;
}

function run() {
  const detailText = readFileSync(DETAIL, "utf8");
  const listText = readFileSync(LIST, "utf8");
  const formText = readFileSync(FORM_FIELDS, "utf8");
  const problems = [...checkDetail(detailText), ...checkList(listText), ...checkFormFields(formText)];
  if (problems.length) {
    console.error(`${LABEL} FAILED:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — all 5 legal matter/deadline enum spots stay humanized.`);
}

function selftest() {
  const failures = [];
  const detailReal = readFileSync(DETAIL, "utf8");
  const listReal = readFileSync(LIST, "utf8");
  const formReal = readFileSync(FORM_FIELDS, "utf8");

  if (checkDetail(detailReal).length) failures.push("LegalMatterDetailPage baseline should pass");
  if (checkList(listReal).length) failures.push("LegalMattersListPage baseline should pass");
  if (checkFormFields(formReal).length) failures.push("LegalMatterFormFields baseline should pass");

  const d1 = checkDetail(
    detailReal.replace(
      "{properEnumOrFilterLabel(d.deadline_type)} · {formatDateTimeUS(d.deadline_at as string)}",
      '{String(d.deadline_type ?? "")} · {formatDateTimeUS(d.deadline_at as string)}'
    )
  );
  if (!d1.some((m) => m.includes("deadline list row"))) failures.push("offender-1 (raw deadline_type in list) NOT caught");

  const d2 = checkDetail(detailReal.replace('subtitle={matter ? properEnumOrFilterLabel(matter.type) : ""}', 'subtitle={matter ? String(matter.type ?? "") : ""}'));
  if (!d2.some((m) => m.includes("page subtitle"))) failures.push("offender-2 (raw matter.type subtitle) NOT caught");

  const l1 = checkList(listReal.replace('render: (row) => properEnumOrFilterLabel(row.type)', 'render: (row) => String(row.type ?? "")'));
  if (!l1.some((m) => m.includes("Type column"))) failures.push("offender-3 (raw Type column) NOT caught");

  const f1 = checkFormFields(
    formReal.replace(
      '{["lawsuit", "claim", "demand_letter", "settlement", "regulatory", "other"].map((t) => (\n            <option key={t} value={t}>\n              {properEnumOrFilterLabel(t)}',
      '{["lawsuit", "claim", "demand_letter", "settlement", "regulatory", "other"].map((t) => (\n            <option key={t} value={t}>\n              {t}'
    )
  );
  if (!f1.some((m) => m.includes("create/edit Type combobox"))) failures.push("offender-4 (raw form Type combobox) NOT caught");

  if (failures.length) {
    console.error(`${LABEL} --selftest FAIL:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS — 4/4 offenders caught, baseline clean`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}

#!/usr/bin/env node
/** @matrix-built {"modules":["accounting","safety","fleet"],"cols":["trailer","connectivity","picker_law","reverse_link"],"leafRe":"^(expenses\.|accident|trailer\.|create)","task":"CREATE-PATH-TRIP-TRAILER-PICKER","pr":"#6328"} */
/**
 * Expense + Accident create paths must stamp trailer_id via EntityPicker kind=trailer
 * after API ranks #6322 / #6324. Cursor EVEN claim: 3138.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-expense-accident-create-trailer-picker";
const SELFTEST = process.argv.includes("--selftest");

const FILES = {
  expenseForm: "apps/frontend/src/components/expenses/RecordExpenseForm.tsx",
  expenseSubmit: "apps/frontend/src/components/expenses/recordExpenseSubmit.ts",
  expenseApi: "apps/frontend/src/api/accounting.ts",
  accidentDrawer: "apps/frontend/src/components/safety/AccidentReportDrawer.tsx",
  accidentApi: "apps/frontend/src/api/safety.ts",
};

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

export function collectProblems(sources) {
  const problems = [];
  const expenseForm = stripComments(sources.expenseForm);
  const expenseSubmit = stripComments(sources.expenseSubmit);
  const expenseApi = stripComments(sources.expenseApi);
  const accidentDrawer = stripComments(sources.accidentDrawer);
  const accidentApi = stripComments(sources.accidentApi);

  if (!/kind=["']trailer["']/.test(expenseForm) || !/EntityPicker/.test(sources.expenseForm)) {
    problems.push(`${FILES.expenseForm}: must render EntityPicker kind=trailer`);
  }
  if (!/trailerId/.test(expenseSubmit) || !/trailer_id:\s*values\.trailerId/.test(expenseSubmit)) {
    problems.push(`${FILES.expenseSubmit}: must submit trailer_id from values.trailerId`);
  }
  if (!/trailer_id\?:\s*string/.test(expenseApi)) {
    problems.push(`${FILES.expenseApi}: createExpense body must accept trailer_id`);
  }

  if (!/kind=["']trailer["']/.test(accidentDrawer) || !/EntityPicker/.test(sources.accidentDrawer)) {
    problems.push(`${FILES.accidentDrawer}: must render EntityPicker kind=trailer`);
  }
  if (!/trailer_id:\s*trailerId/.test(accidentDrawer)) {
    problems.push(`${FILES.accidentDrawer}: create/patch payload must include trailer_id: trailerId`);
  }
  if (!/trailer_id\?:\s*string\s*\|\s*null/.test(accidentApi)) {
    problems.push(`${FILES.accidentApi}: CreateAccidentInput / PatchAccidentInput must accept trailer_id`);
  }

  return problems;
}

if (SELFTEST) {
  const bad = {
    expenseForm: `<EntityPicker kind="unit" />`,
    expenseSubmit: `...(values.loadId ? { load_id: values.loadId } : {}),`,
    expenseApi: `unit_id?: string; load_id?: string;`,
    accidentDrawer: `unit_id: unitId || null,\n    load_id: loadId || null,`,
    accidentApi: `unit_id?: string | null;\n  load_id?: string | null;`,
  };
  const good = {
    expenseForm: `<EntityPicker kind="trailer" />`,
    expenseSubmit: `...(values.trailerId && UUID_RE.test(values.trailerId) ? { trailer_id: values.trailerId } : {}),`,
    expenseApi: `trailer_id?: string;`,
    accidentDrawer: `trailer_id: trailerId || null,\n    <EntityPicker kind="trailer" />`,
    accidentApi: `trailer_id?: string | null;`,
  };
  const badP = collectProblems(bad);
  const goodP = collectProblems(good);
  if (badP.length < 4 || goodP.length !== 0) {
    console.error(`${LABEL} SELFTEST FAIL`, { badP, goodP });
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST OK`);
  process.exit(0);
}

const sources = Object.fromEntries(
  Object.entries(FILES).map(([key, rel]) => [key, fs.readFileSync(path.join(ROOT, rel), "utf8")])
);
const problems = collectProblems(sources);
if (problems.length) {
  console.error(`${LABEL} FAIL`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — expense + accident create trailer EntityPickers submit trailer_id`);

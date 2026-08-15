#!/usr/bin/env node
/**
 * accounting.modal.create — honesty-drop false vendor Required (PrepaidExpensesPage has no vendor).
 * Does NOT claim Built for vendor. Money cols (expense/gl_je) left for CC-1.
 *
 * Run: node scripts/verify-accounting-modal-create-vendor-honesty.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-accounting-modal-create-vendor-honesty";
const MATRIX = "docs/specs/scoreboard/modules/accounting.required.json";
const PAGE = "apps/frontend/src/pages/accounting/PrepaidExpensesPage.tsx";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function verify(source) {
  const failures = [];
  let matrix;
  try {
    matrix = JSON.parse(source.matrix);
  } catch {
    failures.push(`${MATRIX} must remain valid JSON`);
    return failures;
  }
  const leaf = matrix.leaves?.find((l) => l.id === "accounting.modal.create");
  if (!leaf) failures.push("accounting.modal.create leaf missing");
  else if (leaf.required?.includes("vendor")) {
    failures.push("accounting.modal.create must not Require vendor — PrepaidExpensesPage has no vendor drill");
  }
  const audit = matrix.honesty_audit?.vendor_column_2026_08_14_modal_create;
  if (!audit || audit.finding !== "CURSOR-ACCOUNTING-MODAL-CREATE-VENDOR-HONESTY") {
    failures.push("honesty_audit.vendor_column_2026_08_14_modal_create must record this drop");
  }
  if (/kind="vendor"/.test(source.page || "")) {
    failures.push(`${PAGE}: unexpected kind="vendor" — re-evaluate Required instead of honesty drop`);
  }
  if (!source.page?.includes("createPrepaidExpense")) {
    failures.push(`${PAGE}: prepaid create path must remain present`);
  }
  return failures;
}

const source = { matrix: read(MATRIX), page: read(PAGE) };
const failures = verify(source);
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const m = JSON.parse(source.matrix);
  m.leaves.find((l) => l.id === "accounting.modal.create").required.push("vendor");
  if (!verify({ ...source, matrix: JSON.stringify(m) }).length) throw new Error("selftest restore-vendor survived");
  if (!verify({ ...source, page: source.page.replaceAll("createPrepaidExpense", "BROKEN") }).length) {
    throw new Error("selftest prepaid token survived");
  }
  console.log(`${LABEL} --selftest OK`);
}

console.log(`${LABEL} PASS — accounting.modal.create vendor Required honesty-dropped`);

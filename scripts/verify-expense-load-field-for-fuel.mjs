#!/usr/bin/env node
/**
 * LV-EXP-NOLOAD: the Record Expense form must expose a Load/Trip picker and require it for
 * fuel/diesel/roadside/IFTA categories (G18). This guard statically asserts the form and submit
 * function carry the field, the category predicate, the validation error, and the load_id payload.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FORM = path.join(ROOT, "apps/frontend/src/components/expenses/RecordExpenseForm.tsx");
const SUBMIT = path.join(ROOT, "apps/frontend/src/components/expenses/recordExpenseSubmit.ts");
const SELFTEST = process.argv.includes("--selftest");

function fail(msg) {
  console.error(`[verify-expense-load-field-for-fuel] ${msg}`);
  process.exit(1);
}

function run() {
  const form = fs.readFileSync(FORM, "utf8");
  const submit = fs.readFileSync(SUBMIT, "utf8");

  const formChecks = [
    ["EntityPicker kind=load", /kind\s*=\s*["']load["']/.test(form)],
    ["loadId state wired", /values\.loadId/.test(form)],
    ["loadLabel state wired", /loadLabel/.test(form)],
    ["fuel/roadside required marker", /fuel|diesel|gas|roadside|ifta/i.test(form)],
  ];
  const submitChecks = [
    ["loadId in form values type", /loadId:\s*string/.test(submit)],
    ["loadLabel in form values type", /loadLabel:\s*string/.test(submit)],
    ["initial loadId empty", /loadId:\s*[""]+/.test(submit)],
    ["fuel/roadside validation", /Load \/ Trip is required for fuel/.test(submit)],
    ["load_id in createExpense payload", /load_id:\s*values\.loadId/.test(submit) || /load_id:\s*values\.loadId/.test(submit.replace(/\s+/g, " "))],
  ];

  const missing = [...formChecks, ...submitChecks].filter(([, ok]) => !ok).map(([name]) => name);
  if (missing.length > 0) {
    fail(`Record Expense load-field wiring incomplete: ${missing.join(", ")}`);
  }
  return { ok: true, message: "Record Expense form requires Load/Trip for fuel/diesel/roadside categories and sends load_id" };
}

if (SELFTEST) {
  const { ok, message } = run();
  console.log(`verify-expense-load-field-for-fuel --selftest ${ok ? "PASS" : "FAIL"}: ${message}`);
  process.exit(ok ? 0 : 1);
}

const { ok, message } = run();
console.log(`verify-expense-load-field-for-fuel OK — ${message}`);
process.exit(ok ? 0 : 1);

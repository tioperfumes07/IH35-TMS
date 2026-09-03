#!/usr/bin/env node
/**
 * verify-book-load-money-and-controls.mjs
 *
 * CC-2-INSTRUCTIONS-09-02-2026.txt tasks 1-5 + guard spec ("after task 5"), tasks 6/19/20. Started
 * by Cursor in #19985 (the PR that removed the Math.max(0) clamps); extended here rather than
 * replaced -- same file, same --selftest harness, ONE generalized guard per the standing
 * "systemic sweep" rule, not a competing second script. Static, source-level checks only (standing
 * instruction: "NO NEW TEST SUITES this round").
 *
 *  Original checks (Cursor, #19985): sumAccessorialCents / seedAccessorialRow / the accessorial
 *  branch of buildBookLoadChargeLines must not clamp to 0; LINEHAUL_NEGATIVE_ERROR +
 *  linehaulFuelError must exist; AccessorialEditor's typed-amount handler must not clamp; the
 *  wizard's "Invoice total" label must reference customerInvoiceTotal; no h-[46px] one-off; the
 *  base Combobox trigger stays the locked h-7 control (and does NOT pull in the h-9
 *  FILTER_CONTROL_SIZE_CLASS toolbar-filter convention, a different, deliberately taller control).
 *
 *  Added here (CC-2): linehaulFuelError must actually be CALLED for both "linehaul" and
 *  "fuel_surcharge" and surfaced via form.setError -- Cursor's check only proved the function
 *  exists, not that the wizard calls it (defined-but-unused is the same silent-failure class this
 *  whole task exists to close). MoneyInput/NumberInput (every accessorial amount, linehaul, fuel
 *  surcharge, and weight field routes through these) must stay h-7 with tabular-nums.
 */
import fs from "node:fs";

const LIB = "apps/frontend/src/components/dispatch/accessorial-editor-lib.ts";
const EDITOR = "apps/frontend/src/components/dispatch/AccessorialEditor.tsx";
const WIZARD = "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx";
const COMBO = "apps/frontend/src/components/Combobox.tsx";
const MONEY_INPUT = "apps/frontend/src/components/forms/MoneyInput.tsx";
const NUMBER_INPUT = "apps/frontend/src/components/forms/NumberInput.tsx";

function violations(lib, editor, wizard, combo, moneyInput, numberInput) {
  const errors = [];
  if (lib.includes("sumAccessorialCents") && /sumAccessorialCents[\s\S]{0,180}Math\.max\(0/.test(lib)) {
    errors.push("sumAccessorialCents still clamps accessorial amounts to zero");
  }
  if (/amount_cents: Math\.max\(0, Number\(opts/.test(lib)) {
    errors.push("seedAccessorialRow still clamps negative accessorial amounts");
  }
  if (/const amount = Math\.max\(0, Number\(row\.amount_cents/.test(lib)) {
    errors.push("buildBookLoadChargeLines still drops negative accessorials");
  }
  if (!lib.includes("LINEHAUL_NEGATIVE_ERROR") || !lib.includes("linehaulFuelError")) {
    errors.push("negative linehaul/fuel must raise, not silently zero, with a named error");
  }
  if (editor.includes("amount_cents: Math.max(0, c")) {
    errors.push("AccessorialEditor still clamps typed amounts to zero");
  }
  if (!wizard.includes("Invoice total") || !wizard.includes("customerInvoiceTotal")) {
    errors.push("Book Load still labels a figure that is not the customer invoice total");
  }
  if (wizard.includes("h-[46px]")) {
    errors.push("Book Load still uses the one-off h-[46px] control height");
  }
  if (!combo.includes("flex h-7 items-center") || combo.includes("FILTER_CONTROL_SIZE_CLASS")) {
    errors.push("Combobox trigger is not the locked h-7 control height");
  }
  // CC-2 addition: linehaulFuelError must be CALLED for both fields, not just defined -- a
  // defined-but-unused validator is the same silent-failure class task 4 exists to close.
  if (!/linehaulFuelError\(\s*["']linehaul["']/.test(wizard) || !/linehaulFuelError\(\s*["']fuel_surcharge["']/.test(wizard)) {
    errors.push("linehaulFuelError is not called for both linehaul and fuel_surcharge in the wizard");
  }
  if (!/form\.setError\(\s*["']linehaul_cents["']/.test(wizard) || !/form\.setError\(\s*["']fuel_surcharge_cents["']/.test(wizard)) {
    errors.push("linehaul/fuel surcharge negative error is not surfaced via form.setError");
  }
  // CC-2 addition (tasks 19-20): MoneyInput/NumberInput stay h-7 with tabular numerals.
  if (!/<input[\s\S]*?className="[^"]*\bh-7\b[^"]*"/.test(moneyInput)) {
    errors.push("MoneyInput <input> is not h-7");
  }
  if (!/<input[\s\S]*?className="[^"]*\btabular-nums\b[^"]*"/.test(moneyInput)) {
    errors.push("MoneyInput <input> is missing tabular-nums");
  }
  if (!/<input[\s\S]*?className=\{[^}]*\bh-7\b/.test(numberInput)) {
    errors.push("NumberInput <input> is not h-7");
  }
  if (!/<input[\s\S]*?className=\{[^}]*\btabular-nums\b/.test(numberInput)) {
    errors.push("NumberInput <input> is missing tabular-nums");
  }
  return errors;
}

function check(lib, editor, wizard, combo, moneyInput, numberInput) {
  const errors = violations(lib, editor, wizard, combo, moneyInput, numberInput);
  if (errors.length) throw new Error(errors.join("; "));
}

const lib = fs.readFileSync(LIB, "utf8");
const editor = fs.readFileSync(EDITOR, "utf8");
const wizard = fs.readFileSync(WIZARD, "utf8");
const combo = fs.readFileSync(COMBO, "utf8");
const moneyInput = fs.readFileSync(MONEY_INPUT, "utf8");
const numberInput = fs.readFileSync(NUMBER_INPUT, "utf8");

if (process.argv.includes("--selftest")) {
  const base = [lib, editor, wizard, combo, moneyInput, numberInput];
  const mutations = [
    [lib.replace("sum + Number(row.amount_cents || 0)", "sum + Math.max(0, Number(row.amount_cents || 0))"), editor, wizard, combo, moneyInput, numberInput],
    [lib, editor.replace("amount_cents: c ?? 0", "amount_cents: Math.max(0, c ?? 0)"), wizard, combo, moneyInput, numberInput],
    [lib, editor, wizard.replaceAll("Invoice total", "Section total"), combo, moneyInput, numberInput],
    [lib, editor, wizard.replace("flex h-7 flex-1", "flex h-[46px] flex-1"), combo, moneyInput, numberInput],
    [lib, editor, wizard, combo.replace("flex h-7 items-center", "flex h-9 items-center"), moneyInput, numberInput],
    // CC-2 additions below.
    [lib, editor, wizard.replace('linehaulFuelError("linehaul"', 'linehaulFuelErrorDISABLED("linehaul"'), combo, moneyInput, numberInput],
    [lib, editor, wizard.replace('form.setError("linehaul_cents"', 'form.setErrorDISABLED("linehaul_cents"'), combo, moneyInput, numberInput],
    [lib, editor, wizard, combo, moneyInput.replace("h-7 w-full rounded-sm border border-gray-300 pl-4 pr-2 text-left text-xs tabular-nums", "w-full rounded-sm border border-gray-300 pl-4 pr-2 text-left text-xs"), numberInput],
    [lib, editor, wizard, combo, moneyInput, numberInput.replace("tabular-nums", "")],
  ];
  let caught = 0;
  for (const [index, args] of mutations.entries()) {
    try {
      check(...args);
    } catch {
      caught += 1;
      continue;
    }
    throw new Error(`selftest mutation ${index + 1} escaped detection`);
  }
  try {
    check(...base);
  } catch (error) {
    throw new Error(`selftest good files failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (caught !== mutations.length) throw new Error(`selftest caught ${caught}/${mutations.length} planted regressions`);
  console.log(`PASS verify-book-load-money-and-controls --selftest (${caught}/${mutations.length})`);
} else {
  check(lib, editor, wizard, combo, moneyInput, numberInput);
  console.log("PASS verify-book-load-money-and-controls");
}

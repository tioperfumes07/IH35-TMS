#!/usr/bin/env node
import fs from "node:fs";

const LIB = "apps/frontend/src/components/dispatch/accessorial-editor-lib.ts";
const EDITOR = "apps/frontend/src/components/dispatch/AccessorialEditor.tsx";
const WIZARD = "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx";
const COMBO = "apps/frontend/src/components/Combobox.tsx";

function violations(lib, editor, wizard, combo) {
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
  return errors;
}

function check(lib, editor, wizard, combo) {
  const errors = violations(lib, editor, wizard, combo);
  if (errors.length) throw new Error(errors.join("; "));
}

const lib = fs.readFileSync(LIB, "utf8");
const editor = fs.readFileSync(EDITOR, "utf8");
const wizard = fs.readFileSync(WIZARD, "utf8");
const combo = fs.readFileSync(COMBO, "utf8");

if (process.argv.includes("--selftest")) {
  const base = [lib, editor, wizard, combo];
  const mutations = [
    [lib.replace("sum + Number(row.amount_cents || 0)", "sum + Math.max(0, Number(row.amount_cents || 0))"), editor, wizard, combo],
    [lib, editor.replace("amount_cents: c ?? 0", "amount_cents: Math.max(0, c ?? 0)"), wizard, combo],
    [lib, editor, wizard.replaceAll("Invoice total", "Section total"), combo],
    [lib, editor, wizard.replace("flex h-7 flex-1", "flex h-[46px] flex-1"), combo],
    [lib, editor, wizard, combo.replace("flex h-7 items-center", "flex h-9 items-center")],
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
  check(lib, editor, wizard, combo);
  console.log("PASS verify-book-load-money-and-controls");
}

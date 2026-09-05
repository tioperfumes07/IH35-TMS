#!/usr/bin/env node
// L.2 STEP-1.3 guard (owner order 2026-09-05, QuickBooks): the register's NUMBER cell is EMPTY and
// EDITABLE by default. A blank NUMBER = the system assigns load#, load#-1, load#-2 (shown as the
// input's placeholder, never a locked value); a typed value wins verbatim as the expense_number /
// bill display_id. This guard pins:
//   - the draft's number field starts EMPTY (blankDraft: number: "")
//   - the NUMBER cell is a real <input> bound to row.number with the auto number only as a placeholder
//   - the typed value flows to createExpense.expense_number / createVendorBill.display_id verbatim
//
// Usage: node scripts/verify-load-costs-number-editable.mjs [--selftest]
import { readFileSync } from "node:fs";

const TAB = "apps/frontend/src/components/dispatch/LoadDetailCostsTab.tsx";

function audit(src) {
  const f = [];
  if (!/number:\s*""/.test(src))
    f.push(`${TAB}: blankDraft must start with an EMPTY number (number: "") — QuickBooks NUMBER is blank by default`);
  const numberInput = src.split("\n").find((l) => l.includes('data-testid="load-cost-field-number"')) ?? "";
  if (!numberInput)
    f.push(`${TAB}: the NUMBER cell must be an editable input (data-testid="load-cost-field-number")`);
  if (numberInput && !/value=\{row\.number\}/.test(numberInput))
    f.push(`${TAB}: the NUMBER input must be bound to row.number (editable), not read-only`);
  if (numberInput && !/placeholder=\{autoNumber\(index\)\}/.test(numberInput))
    f.push(`${TAB}: the auto-assigned number must be the NUMBER input's placeholder, not its value`);
  // typed value wins verbatim
  if (!/resolvedNumber\(row, index\)/.test(src))
    f.push(`${TAB}: save must resolve the row number via resolvedNumber (typed wins, else auto)`);
  if (!/row\.number\.trim\(\)\s*\?\s*row\.number\.trim\(\)/.test(src))
    f.push(`${TAB}: resolvedNumber must return the typed value verbatim when present`);
  return f;
}

function main() {
  const selftest = process.argv.includes("--selftest");
  const src = readFileSync(TAB, "utf8");
  const failures = audit(src);
  if (failures.length) {
    console.error("FAIL verify-load-costs-number-editable:");
    for (const x of failures) console.error(`  - ${x}`);
    process.exit(1);
  }
  if (selftest) {
    const m1 = src.replace(/number:\s*""/, 'number: load.load_number');
    if (audit(m1).length === 0) { console.error("SELFTEST FAIL: pre-filling the number did not trip"); process.exit(1); }
    const m2 = src.replace(/placeholder=\{autoNumber\(index\)\} value=\{row\.number\}/, 'value={autoNumber(index)} readOnly');
    if (audit(m2).length === 0) { console.error("SELFTEST FAIL: locking the number field did not trip"); process.exit(1); }
    const m3 = src.replace(/row\.number\.trim\(\) \? row\.number\.trim\(\)/, "false ? row.number.trim()");
    if (audit(m3).length === 0) { console.error("SELFTEST FAIL: dropping typed-wins did not trip"); process.exit(1); }
    console.log("SELFTEST OK: guard trips on all mutations");
  }
  console.log("PASS verify-load-costs-number-editable");
}

main();

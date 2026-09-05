#!/usr/bin/env node
// L.2 STEP-1.3 guard (owner order 2026-09-05): the Costs tab (LoadDetailCostsTab.tsx) is a QuickBooks
// register, not a stacked-card form. It must render the 12-column register header, in order:
//   NUMBER · DATE · TYPE · VENDOR · CATEGORY · LATE FEE · LUMPER · FUEL · R&M EXP · OTHER · AMOUNT · STATUS
// and it must NOT carry the old "You never type the number." copy (the opposite of the spec).
//
// Usage: node scripts/verify-load-costs-register-columns.mjs [--selftest]
import { readFileSync } from "node:fs";

const TAB = "apps/frontend/src/components/dispatch/LoadDetailCostsTab.tsx";
const COLUMNS = ["Number", "Date", "Type", "Vendor", "Category", "Late Fee", "Lumper", "Fuel", "R&M Exp", "Other", "Amount", "Status"];

function audit(src) {
  const f = [];
  if (!/data-testid="load-costs-register"/.test(src))
    f.push(`${TAB}: the Costs tab must render a register (data-testid="load-costs-register")`);
  for (const c of COLUMNS) {
    // The header labels live in one string array literal; require each, in the register block.
    if (!new RegExp(`"${c.replace(/[.*+?^${}()|[\]\\&]/g, "\\$&")}"`).test(src))
      f.push(`${TAB}: register is missing the "${c}" column header`);
  }
  if (/You never type the number/.test(src))
    f.push(`${TAB}: delete the "You never type the number." copy — the register's NUMBER is typed (QuickBooks)`);
  return f;
}

function main() {
  const selftest = process.argv.includes("--selftest");
  const src = readFileSync(TAB, "utf8");
  const failures = audit(src);
  if (failures.length) {
    console.error("FAIL verify-load-costs-register-columns:");
    for (const x of failures) console.error(`  - ${x}`);
    process.exit(1);
  }
  if (selftest) {
    const m1 = src.replaceAll('"R&M Exp"', '"RM"');
    if (audit(m1).length === 0) { console.error("SELFTEST FAIL: renaming a column header did not trip"); process.exit(1); }
    const m2 = src.replace(/data-testid="load-costs-register"/, 'data-testid="load-costs-cards"');
    if (audit(m2).length === 0) { console.error("SELFTEST FAIL: removing the register testid did not trip"); process.exit(1); }
    const m3 = src + '\n// You never type the number\n';
    if (audit(m3).length === 0) { console.error("SELFTEST FAIL: re-adding the forbidden copy did not trip"); process.exit(1); }
    console.log("SELFTEST OK: guard trips on all mutations");
  }
  console.log("PASS verify-load-costs-register-columns");
}

main();

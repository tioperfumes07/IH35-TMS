#!/usr/bin/env node
/**
 * ACCT-CHROME-UNIFORM-01 — Accounting money lists expose exactly ONE create control via
 * AccountingSubNavWrapper.createControl (not a duplicate + Create in actions). Batch Void
 * buttons use shared Button danger sm.
 *
 * Self-test: node scripts/verify-accounting-toolbar-one-create.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-accounting-toolbar-one-create";

const CHECKS = [
  {
    name: "wrapper: createControl prop + toolbar slot",
    file: "apps/frontend/src/pages/accounting/AccountingSubNavWrapper.tsx",
    pattern: /createControl\?: ReactNode[\s\S]*data-accounting-toolbar="true"[\s\S]*\{createControl \?/,
  },
  {
    name: "BillsPage: createControl with bills-create-cta (not actions)",
    file: "apps/frontend/src/pages/accounting/BillsPage.tsx",
    pattern: /<AccountingSubNavWrapper[\s\S]*createControl=\{[\s\S]*data-testid="bills-create-cta"[\s\S]*\+ Create/,
  },
  {
    name: "BillsPage: wrapper call has no actions prop",
    file: "apps/frontend/src/pages/accounting/BillsPage.tsx",
    pattern: /<AccountingSubNavWrapper(?![\s\S]*\bactions=)[\s\S]*createControl=/,
  },
  {
    name: "ExpensesListPage: createControl + Create",
    file: "apps/frontend/src/pages/accounting/ExpensesListPage.tsx",
    pattern: /createControl=\{[\s\S]*\+ Create/,
  },
  {
    name: "InvoicesListPage: createControl holds type Select + Create",
    file: "apps/frontend/src/pages/accounting/InvoicesListPage.tsx",
    pattern: /createControl=\{[\s\S]*SelectCombobox[\s\S]*className="h-8 text-\[13px\]"[\s\S]*\+ Create/,
  },
  {
    name: "InvoicesListPage: batch Void uses Button danger sm",
    file: "apps/frontend/src/pages/accounting/InvoicesListPage.tsx",
    pattern: /batchActions=\{\(selected\)[\s\S]*variant="danger"[\s\S]*Void/,
  },
  {
    name: "PaymentsListPage: createControl Record Payment + actions Invoices only",
    file: "apps/frontend/src/pages/accounting/PaymentsListPage.tsx",
    pattern: /actions=\{<Button variant="secondary"[\s\S]*Invoices[\s\S]*createControl=\{<Button[\s\S]*\+ Record Payment/,
  },
  {
    name: "ManualJEListPage: createControl + Create",
    file: "apps/frontend/src/pages/accounting/ManualJEListPage.tsx",
    pattern: /createControl=\{<Button[\s\S]*\+ Create/,
  },
];

function runChecks(root = ROOT) {
  const fails = [];
  for (const c of CHECKS) {
    const abs = path.join(root, c.file);
    if (!fs.existsSync(abs)) {
      fails.push(`${c.name}: missing ${c.file}`);
      continue;
    }
    const src = fs.readFileSync(abs, "utf8");
    const hit = c.pattern.test(src);
    if (!hit) fails.push(`${c.name}: pattern miss in ${c.file}`);
  }
  return fails;
}

function selftest() {
  const live = runChecks();
  const tmp = fs.mkdtempSync(path.join(ROOT, "scripts", ".acct-toolbar-one-create-selftest-"));
  try {
    for (const c of CHECKS) {
      const abs = path.join(tmp, c.file);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, "// poison — createControl stripped\nexport {};\n");
    }
    const planted = runChecks(tmp);
    if (planted.length < CHECKS.length) {
      console.error(`${LABEL} SELFTEST FAIL — planted misses not caught (${planted.length}/${CHECKS.length})`);
      process.exit(1);
    }
    console.log(`${LABEL} SELFTEST PASS (poison trips ${planted.length}/${CHECKS.length})`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  if (live.length) {
    console.error(`${LABEL} FAIL live:\n- ${live.join("\n- ")}`);
    process.exit(1);
  }
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

const fails = runChecks();
if (fails.length) {
  console.error(`${LABEL} FAIL (${fails.length}):\n- ${fails.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — ${CHECKS.length} accounting toolbar one-create asserts`);

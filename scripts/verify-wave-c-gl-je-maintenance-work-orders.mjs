#!/usr/bin/env node
/**
 * WAVE-C-gl_je-maintenance-work-orders — maintenance module "GL / JE" column,
 * VERTICAL-WIRING-LAW-2026-08-12. Leaves: wo.create, wo.source.{is,es,ac,et,rt,it,rs},
 * wo.create_bill, wo.create_expense — all 9 land on the same /maintenance work-order
 * create/detail flow (WorkOrderDetailPage.tsx), which already renders real
 * EntityLink kind="bill" / kind="expense" rows sourced from a real backend
 * WorkOrderLinkedFinancials payload (two-section-service.ts routes maintenance purchases
 * through the shared createBill/createExpense poster into accounting.bills /
 * accounting.expenses — MNT-ECON-01 / SWEEP-C6). Those same accounting.bills /
 * accounting.expenses rows already carry a real journal_entry_id, rendered on
 * BillDetailPage.tsx / ExpenseDetailPage.tsx (WAVE-C-gl_je-accounting-core-leaves, PR #6235)
 * — so a work order's GL JE is reachable in two real hops (WO -> bill/expense -> JE), not
 * fabricated. road_service.active and parts_inventory.record_purchase are NOT tagged here —
 * road service tickets are pre-billing ("active") and parts-inventory purchase linkage was not
 * independently verified in this pass; left as real remaining gap, not over-claimed.
 *
 * No code change in this pass — pure verification + tagging.
 *
 * @matrix-built {"modules":["maintenance"],"cols":["gl_je"],"leafRe":"^(wo\\.create|wo\\.source\\.(is|es|ac|et|rt|it|rs)|wo\\.create_bill|wo\\.create_expense)$","task":"WAVE-C-gl_je-maintenance-work-orders","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-wave-c-gl-je-maintenance-work-orders.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-wave-c-gl-je-maintenance-work-orders";

const CHECKS = [
  {
    name: "WorkOrderDetailPage.tsx renders a real EntityLink kind=bill row",
    file: "apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx",
    pattern: /kind="bill"/,
  },
  {
    name: "WorkOrderDetailPage.tsx renders a real EntityLink kind=expense row",
    file: "apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx",
    pattern: /kind="expense"/,
  },
  {
    name: "two-section-service.ts routes maintenance purchases into accounting.bills",
    file: "apps/backend/src/maintenance/two-section-service.ts",
    pattern: /INSERT INTO accounting\.bills/,
  },
  {
    name: "two-section-service.ts routes maintenance purchases into accounting.expenses",
    file: "apps/backend/src/maintenance/two-section-service.ts",
    pattern: /INSERT INTO accounting\.expenses/,
  },
  {
    name: "accounting.bills already carries real journal_entry_id (BillDetailPage, WAVE-C-gl_je-accounting-core-leaves)",
    file: "apps/frontend/src/pages/accounting/BillDetailPage.tsx",
    pattern: /bill\.journal_entry_id/,
  },
  {
    name: "accounting.expenses already carries real journal_entry_id (ExpenseDetailPage, WAVE-C-gl_je-accounting-core-leaves)",
    file: "apps/frontend/src/pages/accounting/ExpenseDetailPage.tsx",
    pattern: /expense\.journal_entry_id/,
  },
];

export function checkAll(readFile) {
  const failures = [];
  for (const c of CHECKS) {
    const src = readFile(c.file);
    if (src === null) {
      failures.push(`${c.name}: ${c.file} not found`);
      continue;
    }
    if (!c.pattern.test(src)) {
      failures.push(`${c.name}: ${c.file} no longer matches expected shape`);
    }
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const GOOD_FIXTURES = {
    "apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx":
      'render: (row) => <EntityLink kind="bill" ... /> and kind="expense"',
    "apps/backend/src/maintenance/two-section-service.ts":
      "INSERT INTO accounting.bills (...) ... INSERT INTO accounting.expenses (...)",
    "apps/frontend/src/pages/accounting/BillDetailPage.tsx": "bill.journal_entry_id",
    "apps/frontend/src/pages/accounting/ExpenseDetailPage.tsx": "expense.journal_entry_id",
  };
  const goodFailures = checkAll((f) => GOOD_FIXTURES[f] ?? null);
  if (goodFailures.length) {
    console.error(`[${LABEL}] selftest FAIL: known-good fixture should pass — ${goodFailures.join("; ")}`);
    process.exit(1);
  }
  const regressedFailures = checkAll(() => "nothing matches here");
  if (regressedFailures.length !== CHECKS.length) {
    console.error(`[${LABEL}] selftest FAIL: regressed fixture (all-empty) should fail every check`);
    process.exit(1);
  }
  console.log(`[${LABEL}] selftest: PASS — good/regressed fixtures classify correctly`);
  process.exit(0);
}

const failures = checkAll((rel) => {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
});

if (failures.length) {
  console.error(`[${LABEL}] FAILED — ${failures.length} check(s) regressed:`);
  for (const f of failures) console.error("  ✗", f);
  process.exit(1);
}
console.log(`[${LABEL}] PASS — work-order create/source leaves gl_je wiring (via bill/expense -> JE) present`);

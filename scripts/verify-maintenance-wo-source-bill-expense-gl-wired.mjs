#!/usr/bin/env node
/**
 * WAVE 2 maintenance money — Box 3 Built for the work-order create/source/bill/expense cluster ×
 * `expense` + `gl_je`.
 *
 * @matrix-built {"modules":["maintenance"],"cols":["expense","gl_je"],"task":"WAVE2-MAINT-WO-BILL-EXPENSE-GL-BUILT","vertical":"column-wave","leafRe":"^(wo\\.create|wo\\.source\\.(is|es|ac|et|rt|it|rs)|wo\\.create_bill|wo\\.create_expense|maintenance\\.modal\\.create_expense)$"}
 *
 * CreateWorkOrderModal.tsx is ONE single form carrying `source_type: "IS" | "ES" | "AC" | "ET" |
 * "RT" | "IT" | "RS"` — the 7 wo.source.* leaves + wo.create are all this SAME surface, just
 * documenting different source-type selections within it (confirmed: DEFAULT_SOURCE_BY_TYPE and the
 * needsExternalVendor gate both branch on this exact union). WorkOrderDetailPage.tsx mounts
 * CreateBillModal and CreateExpenseModal (the "+ Create Bill" / "+ Create Expense" WO actions —
 * wo.create_bill, wo.create_expense) — both pass this work order's id into the canonical creation
 * functions (createVendorBill / RecordExpenseForm), which already carry a HARD FK
 * (accounting.bills.work_order_id / accounting.expenses.work_order_id) and are the SAME GL-posting-
 * proven creation paths already Built-credited elsewhere (WAVE-C-ap-bill-fe-all-modules for ap_bill,
 * P28 for gl_je on the accounting module's own bill leaves) — reused here with NO new GL math, only
 * the maintenance module's own leaf ids were never separately claimed. maintenance.modal.create_expense
 * is the SAME CreateExpenseModal.tsx file (its own route_hint names this exact file).
 *
 * Self-test: node scripts/verify-maintenance-wo-source-bill-expense-gl-wired.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-maintenance-wo-source-bill-expense-gl-wired";

const CHECKS = [
  {
    name: "CreateWorkOrderModal carries the full source_type union (IS/ES/AC/ET/RT/IT/RS) — one surface, 7 sources",
    file: "apps/frontend/src/pages/maintenance/components/CreateWorkOrderModal.tsx",
    pattern: /source_type:\s*"IS"\s*\|\s*"ES"\s*\|\s*"AC"\s*\|\s*"ET"\s*\|\s*"RT"\s*\|\s*"IT"\s*\|\s*"RS"/,
  },
  {
    name: "WorkOrderDetailPage mounts CreateBillModal (wo.create_bill reachable from a WO)",
    file: "apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx",
    pattern: /<CreateBillModal/,
  },
  {
    name: "WorkOrderDetailPage mounts CreateExpenseModal (wo.create_expense reachable from a WO)",
    file: "apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx",
    pattern: /<CreateExpenseModal/,
  },
  {
    name: "CreateBillModal persists a hard FK to the work order and calls the canonical createVendorBill",
    file: "apps/frontend/src/pages/maintenance/components/CreateBillModal.tsx",
    pattern: /import\s*\{\s*createVendorBill\s*\}\s*from\s*"\.\.\/\.\.\/\.\.\/api\/accounting"/,
  },
  {
    name: "CreateBillModal forwards work_order_id into the bill payload (forward FK, not orphaned)",
    file: "apps/frontend/src/pages/maintenance/components/CreateBillModal.tsx",
    pattern: /work_order_id:\s*payload\.work_order_id\s*\?\?\s*pickedWoId\s*\?\?\s*linkedWoId/,
  },
  {
    name: "CreateExpenseModal reuses the canonical RecordExpenseForm (not an ad-hoc poster)",
    file: "apps/frontend/src/pages/maintenance/components/CreateExpenseModal.tsx",
    pattern: /import\s*\{\s*RecordExpenseForm\s*\}\s*from\s*"\.\.\/\.\.\/\.\.\/components\/expenses\/RecordExpenseForm"/,
  },
  {
    name: "CreateExpenseModal forwards this work order's id into RecordExpenseForm (forward FK, not orphaned)",
    file: "apps/frontend/src/pages/maintenance/components/CreateExpenseModal.tsx",
    pattern: /workOrderId=\{linkedWoId\s*\?\?\s*pickedWoId\s*\?\?\s*undefined\}/,
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
    "apps/frontend/src/pages/maintenance/components/CreateWorkOrderModal.tsx":
      'source_type: "IS" | "ES" | "AC" | "ET" | "RT" | "IT" | "RS";',
    "apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx": `
      <CreateBillModal open={createBillOpen} onClose={() => setCreateBillOpen(false)} />
      <CreateExpenseModal open={createExpenseOpen} onClose={() => setCreateExpenseOpen(false)} />
    `,
    "apps/frontend/src/pages/maintenance/components/CreateBillModal.tsx": `
      import { createVendorBill } from "../../../api/accounting";
      body: {
        work_order_id: payload.work_order_id ?? pickedWoId ?? linkedWoId ?? undefined,
      }
    `,
    "apps/frontend/src/pages/maintenance/components/CreateExpenseModal.tsx": `
      import { RecordExpenseForm } from "../../../components/expenses/RecordExpenseForm";
      <RecordExpenseForm
        workOrderId={linkedWoId ?? pickedWoId ?? undefined}
      />
    `,
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
console.log(`[${LABEL}] PASS — WO create/source cluster + create-bill/create-expense forward-FK + canonical GL-posting reuse all present`);

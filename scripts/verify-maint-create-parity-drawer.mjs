#!/usr/bin/env node
/**
 * verify-maint-create-parity-drawer.mjs
 *
 * GUARD 2026-07-16: Maintenance Create Expense / Create Bill entry points must use the same
 * QBO-like ParityDrawer chrome as Accounting (owner creator-chrome lock). Forking back to a
 * centered Modal while Accounting uses a side panel is the chrome drift the audit called out.
 *
 * Static invariant checks (no DB, no network):
 *  1. CreateExpenseModal.tsx imports + renders ParityDrawer (not Modal).
 *  2. CreateBillModal.tsx imports + renders ParityDrawer (not Modal).
 *  3. Both reuse canonical forms (RecordExpenseForm / VendorBillForm).
 *  4. Accounting Expenses group primary href is /list; bare is create; /new is route-only alias.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-maint-create-parity-drawer";

const EXPENSE = path.join(ROOT, "apps/frontend/src/pages/maintenance/components/CreateExpenseModal.tsx");
const BILL = path.join(ROOT, "apps/frontend/src/pages/maintenance/components/CreateBillModal.tsx");
const SUBNAV = path.join(ROOT, "apps/frontend/src/pages/accounting/subnav-manifest.ts");
const ROUTES = path.join(ROOT, "apps/frontend/src/routes/manifest.tsx");

function read(p) {
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

function routeR(route, component) {
  const escaped = route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `path=["']${escaped}["'](?:(?!path=["'])[\\s\\S]){0,400}?<${component}\\s*\\/>`,
  );
}

function assertDrawerShell(failures, src, fileLabel, formImport) {
  if (!src) {
    failures.push(`MISSING ${fileLabel}`);
    return;
  }
  if (!/from\s+["'][^"']*parity\/ParityDrawer["']/.test(src)) {
    failures.push(`${fileLabel}: must import ParityDrawer`);
  }
  if (!/<ParityDrawer[\s/>]/.test(src)) {
    failures.push(`${fileLabel}: must render <ParityDrawer>`);
  }
  if (/from\s+["'][^"']*\/Modal["']/.test(src) || /<Modal[\s/>]/.test(src)) {
    failures.push(`${fileLabel}: must not use centered Modal (owner chrome = side panel)`);
  }
  if (!new RegExp(formImport).test(src)) {
    failures.push(`${fileLabel}: must reuse ${formImport}`);
  }
}

export function assertMaintenanceParityDrawer({ expense, bill, subnav, routes }) {
  const failures = [];
  assertDrawerShell(failures, expense, "CreateExpenseModal.tsx", "RecordExpenseForm");
  assertDrawerShell(failures, bill, "CreateBillModal.tsx", "VendorBillForm");

  if (!subnav) {
    failures.push("MISSING subnav-manifest.ts");
  } else {
    const itemBlock = subnav.match(/export const SUBNAV_ITEMS[\s\S]*?\]\s*as const;/)?.[0] ?? "";
    const flatBlock = subnav.match(/export const ACCOUNTING_CLEAN_TABS[\s\S]*?\]\s*as const;/)?.[0] ?? "";
    if (!/label:\s*GROUP_LABELS\.expenses,\s*href:\s*["']\/accounting\/expenses\/list["']/.test(subnav)) {
      failures.push("subnav-manifest: Expenses group href must be /accounting/expenses/list");
    }
    const childrenOrder =
      /label:\s*["']Expenses List["'],\s*path:\s*["']\/accounting\/expenses\/list["'][\s\S]{0,180}?label:\s*["']Expenses["'],\s*path:\s*["']\/accounting\/expenses["']/;
    if (!childrenOrder.test(itemBlock)) {
      failures.push('subnav-manifest: dropdown must expose "Expenses List" then "Expenses" creator');
    }
    if (/\/accounting\/expenses\/new/.test(itemBlock) || /\/accounting\/expenses\/new/.test(flatBlock)) {
      failures.push("subnav-manifest: legacy /new alias must not be exposed in rendered/retained UI metadata");
    }
    if (
      !/label:\s*["']Expenses List["'],\s*to:\s*["']\/accounting\/expenses\/list["']/.test(flatBlock)
      || !/label:\s*["']Expenses["'],\s*to:\s*["']\/accounting\/expenses["']/.test(flatBlock)
    ) {
      failures.push("subnav-manifest: flat metadata must retain list then canonical creator");
    }
  }

  if (!routes) {
    failures.push("MISSING routes/manifest.tsx");
  } else {
    if (!routeR("/accounting/expenses/list", "ExpensesListPage").test(routes)) {
      failures.push("routes: /accounting/expenses/list must render ExpensesListPage");
    }
    if (!routeR("/accounting/expenses", "ExpenseCreatePage").test(routes)) {
      failures.push("routes: /accounting/expenses must render ExpenseCreatePage");
    }
    if (!routeR("/accounting/expenses/new", "ExpenseCreatePage").test(routes)) {
      failures.push("routes: /accounting/expenses/new must remain mounted as an additive alias");
    }
  }

  return failures;
}

function selftest() {
  const drawer = `
    import { ParityDrawer } from "../parity/ParityDrawer";
    import { RecordExpenseForm } from "./RecordExpenseForm";
    <ParityDrawer><RecordExpenseForm /></ParityDrawer>
  `;
  const billDrawer = drawer.replaceAll("RecordExpenseForm", "VendorBillForm");
  const good = {
    expense: drawer,
    bill: billDrawer,
    subnav: `
      export const SUBNAV_ITEMS = [
        { label: "Expenses List", path: "/accounting/expenses/list", section: "expenses" },
        { label: "Expenses", path: "/accounting/expenses", section: "expenses" },
      ] as const;
      export const ACCOUNTING_CLEAN_TABS = [
        { label: "Expenses List", to: "/accounting/expenses/list" },
        { label: "Expenses", to: "/accounting/expenses" },
      ] as const;
      { label: GROUP_LABELS.expenses, href: "/accounting/expenses/list" }
    `,
    routes: `
      path="/accounting/expenses/new" element={<ExpenseCreatePage />}
      path="/accounting/expenses/list" element={<ExpensesListPage />}
      path="/accounting/expenses" element={<ExpenseCreatePage />}
    `,
  };
  const reversed = {
    ...good,
    subnav: good.subnav.replace(
      "GROUP_LABELS.expenses, href: \"/accounting/expenses/list\"",
      "GROUP_LABELS.expenses, href: \"/accounting/expenses\"",
    ),
  };
  const exposedAlias = {
    ...good,
    subnav: good.subnav.replace(
      '{ label: "Expenses", path: "/accounting/expenses", section: "expenses" },',
      '{ label: "Expenses", path: "/accounting/expenses", section: "expenses" },\n'
        + '        { label: "Legacy", path: "/accounting/expenses/new", section: "expenses" },',
    ),
  };
  if (
    assertMaintenanceParityDrawer(good).length
    || !assertMaintenanceParityDrawer({ ...good, expense: drawer.replaceAll("ParityDrawer", "Modal") }).length
    || !assertMaintenanceParityDrawer(reversed).length
    || !assertMaintenanceParityDrawer(exposedAlias).length
  ) {
    console.error(`${LABEL} SELFTEST FAILED`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const failures = assertMaintenanceParityDrawer({
  expense: read(EXPENSE),
  bill: read(BILL),
  subnav: read(SUBNAV),
  routes: read(ROUTES),
});

if (failures.length) {
  console.error(`${LABEL}: FAIL`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — Maintenance drawers preserved; /list browses; bare creates; /new is route-only`);
process.exit(0);

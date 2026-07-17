#!/usr/bin/env node
/**
 * verify-expenses-list-route — /accounting/expenses must render ExpensesListPage (browse-first).
 *
 * ROOT CAUSE locked: manifest wired the create wizard at the canonical expenses URL, stranding the
 * real list at /accounting/expenses/list. Create moves to /accounting/expenses/new; /list stays
 * additive for EntityLink deep-links.
 *
 * Static checks (no DB):
 *  1. manifest.tsx: /accounting/expenses → ExpensesListPage; /new → ExpenseCreatePage; /list kept
 *  2. Create entry points (Topbar, home quick-create, accounting +Create menu) → /new not /
 *  3. subnav group href → /accounting/expenses (browse-first)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-expenses-list-route";

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

export function assertExpensesListRoute({ manifest, topbar, home, subnavWrapper, subnavManifest }) {
  const errors = [];

  if (manifest) {
    const listRoute = manifest.match(
      /path=["']\/accounting\/expenses["'][\s\S]{0,220}?<ExpensesListPage\s*\/>/,
    );
    if (!listRoute) {
      errors.push("manifest: /accounting/expenses must render <ExpensesListPage/>");
    }
    if (!/path=["']\/accounting\/expenses\/new["'][\s\S]{0,220}?<ExpenseCreatePage\s*\/>/.test(manifest)) {
      errors.push("manifest: /accounting/expenses/new must render <ExpenseCreatePage/> (create deep-link)");
    }
    if (!/path=["']\/accounting\/expenses\/list["'][\s\S]{0,220}?<ExpensesListPage\s*\/>/.test(manifest)) {
      errors.push("manifest: /accounting/expenses/list must remain mounted for EntityLink targets");
    }
    if (/path=["']\/accounting\/expenses["'][\s\S]{0,220}?<ExpenseCreatePage\s*\/>/.test(manifest)) {
      errors.push("manifest: /accounting/expenses must not render ExpenseCreatePage (create belongs on /new)");
    }
  } else {
    errors.push("manifest.tsx missing");
  }

  const createTargets = [
    ["Topbar", topbar, /\/accounting\/expenses\/new/],
    ["QboStyleHomePage CREATE_ACTIONS", home, /Record expense[^]*?to:\s*["']\/accounting\/expenses\/new["']/],
    ["AccountingSubNavWrapper CREATE_MENU", subnavWrapper, /label:\s*["']Expense["'],\s*to:\s*["']\/accounting\/expenses\/new["']/],
  ];
  for (const [name, src, okRe] of createTargets) {
    if (!src) {
      errors.push(`${name}: file missing`);
      continue;
    }
    if (!okRe.test(src)) {
      errors.push(`${name}: create entry must target /accounting/expenses/new`);
    }
  }

  for (const [name, src] of createTargets) {
    if (!src) continue;
    if (/,\s*["']\/accounting\/expenses["']\s*\]/.test(src) || /to:\s*["']\/accounting\/expenses["']\s*[,}]/.test(src)) {
      errors.push(`${name}: must not target bare /accounting/expenses for create (that URL is the list)`);
    }
  }

  if (subnavManifest) {
    if (!/label:\s*GROUP_LABELS\.expenses,\s*href:\s*["']\/accounting\/expenses["']/.test(subnavManifest)) {
      errors.push("subnav-manifest: Expenses group href must be /accounting/expenses");
    }
  } else {
    errors.push("subnav-manifest.ts missing");
  }

  return errors;
}

function selftest() {
  const goodManifest = `
    path="/accounting/expenses/new" element={<ProtectedRoute><ExpenseCreatePage /></ProtectedRoute>}
    path="/accounting/expenses/list" element={<ProtectedRoute><ExpensesListPage /></ProtectedRoute>}
    path="/accounting/expenses" element={<ProtectedRoute><ExpensesListPage /></ProtectedRoute>}
  `;
  const good = {
    manifest: goodManifest,
    topbar: `["Expense", "/accounting/expenses/new"]`,
    home: `{ label: "Record expense", to: "/accounting/expenses/new" }`,
    subnavWrapper: `{ label: "Expense", to: "/accounting/expenses/new" }`,
    subnavManifest: `{ label: GROUP_LABELS.expenses, href: "/accounting/expenses" }`,
  };
  const bad = {
    ...good,
    manifest: `path="/accounting/expenses" element={<ProtectedRoute><ExpenseCreatePage /></ProtectedRoute>}`,
  };
  let failed = 0;
  if (assertExpensesListRoute(good).length !== 0) failed++;
  if (assertExpensesListRoute(bad).length === 0) failed++;
  if (failed) {
    console.error(`${LABEL} SELFTEST FAILED`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = assertExpensesListRoute({
  manifest: read("apps/frontend/src/routes/manifest.tsx"),
  topbar: read("apps/frontend/src/components/Topbar.tsx"),
  home: read("apps/frontend/src/pages/home/QboStyleHomePage.tsx"),
  subnavWrapper: read("apps/frontend/src/pages/accounting/AccountingSubNavWrapper.tsx"),
  subnavManifest: read("apps/frontend/src/pages/accounting/subnav-manifest.ts"),
});

if (errors.length) {
  console.error(`${LABEL}: FAIL`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — /accounting/expenses is the expenses list; create lives on /new`);
process.exit(0);

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
 *  4. Accounting Expenses group primary href is the list (not the create hub).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-maint-create-parity-drawer";

const EXPENSE = path.join(ROOT, "apps/frontend/src/pages/maintenance/components/CreateExpenseModal.tsx");
const BILL = path.join(ROOT, "apps/frontend/src/pages/maintenance/components/CreateBillModal.tsx");
const MANIFEST = path.join(ROOT, "apps/frontend/src/pages/accounting/subnav-manifest.ts");

const failures = [];

function read(p, label) {
  if (!fs.existsSync(p)) {
    failures.push(`MISSING ${label}: ${path.relative(ROOT, p)}`);
    return "";
  }
  return fs.readFileSync(p, "utf8");
}

function assertDrawerShell(src, fileLabel, formImport) {
  if (!src) return;
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

assertDrawerShell(read(EXPENSE, "CreateExpenseModal"), "CreateExpenseModal.tsx", "RecordExpenseForm");
assertDrawerShell(read(BILL, "CreateBillModal"), "CreateBillModal.tsx", "VendorBillForm");

const manifest = read(MANIFEST, "subnav-manifest");
if (manifest) {
  // Group click target must be the expenses list (QBO browse-first).
  if (!/label:\s*GROUP_LABELS\.expenses,\s*href:\s*["']\/accounting\/expenses\/list["']/.test(manifest)) {
    failures.push("subnav-manifest: Expenses group href must be /accounting/expenses/list");
  }
  // Create hub stays reachable (never delete the route). Label stays "Expenses" for locked-ui-surface.
  if (!/label:\s*["']Expenses["'],\s*path:\s*["']\/accounting\/expenses["']/.test(manifest)) {
    failures.push('subnav-manifest: /accounting/expenses must remain labeled "Expenses"');
  }
  const subnavBlock = manifest.match(/export const SUBNAV_ITEMS[\s\S]*?^\];/m)?.[0] ?? manifest;
  const listIdx = subnavBlock.search(/path:\s*["']\/accounting\/expenses\/list["']/);
  const createIdx = subnavBlock.search(/path:\s*["']\/accounting\/expenses["'](?!\/)/);
  if (listIdx === -1 || createIdx === -1 || listIdx > createIdx) {
    failures.push("subnav-manifest: Expenses List must precede /accounting/expenses (browse-first)");
  }
}

if (failures.length) {
  console.error(`${LABEL}: FAIL`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — Maintenance Create Expense/Bill use ParityDrawer; Expenses group → list`);
process.exit(0);

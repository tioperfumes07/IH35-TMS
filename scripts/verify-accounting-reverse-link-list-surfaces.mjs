#!/usr/bin/env node
/**
 * Accounting reverse_link remainder — leaf-specific Built for list/detail surfaces
 * that already drill via EntityLink. Honesty drops create-only modals/drawers elsewhere.
 *
 * @matrix-built {"modules":["accounting"],"cols":["reverse_link"],"leafRe":"^(bill_payments\\.list|payments\\.receive|collections|factoring\\.list|je\\.list|audit_trail|accounting\\.panel\\.bill_detail|accounting\\.parity\\.(expenses_list_page|factoring_detail_page|receipts_page|vendor_credits_page))$","task":"VERTICAL-REVERSE-LINK-accounting-lists","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-accounting-reverse-link-list-surfaces.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-accounting-reverse-link-list-surfaces";

const CHECKS = [
  { name: "BillPaymentsList EntityLink", file: "apps/frontend/src/pages/accounting/BillPaymentsListPage.tsx", pattern: /EntityLink/ },
  { name: "ReceiptsPage EntityLink payment", file: "apps/frontend/src/pages/accounting/ReceiptsPage.tsx", pattern: /EntityLink/ },
  { name: "CollectionsPage EntityLink", file: "apps/frontend/src/pages/accounting/CollectionsPage.tsx", pattern: /EntityLink/ },
  { name: "FactoringListPage EntityLink", file: "apps/frontend/src/pages/accounting/FactoringListPage.tsx", pattern: /EntityLink/ },
  { name: "ManualJEList EntityLink", file: "apps/frontend/src/pages/accounting/ManualJEListPage.tsx", pattern: /EntityLink/ },
  { name: "AuditTrail EntityLink", file: "apps/frontend/src/pages/accounting/AccountingAuditTrailPage.tsx", pattern: /EntityLink/ },
  { name: "BillDetailPanel EntityLink", file: "apps/frontend/src/pages/accounting/BillDetailPanel.tsx", pattern: /EntityLink/ },
  { name: "ExpensesListPage EntityLink", file: "apps/frontend/src/pages/accounting/ExpensesListPage.tsx", pattern: /EntityLink/ },
  { name: "FactoringDetailPage EntityLink", file: "apps/frontend/src/pages/accounting/FactoringDetailPage.tsx", pattern: /EntityLink/ },
  { name: "VendorCreditsPage EntityLink", file: "apps/frontend/src/pages/accounting/VendorCreditsPage.tsx", pattern: /EntityLink/ },
];

function run(root = ROOT) {
  const fails = [];
  for (const c of CHECKS) {
    const abs = path.join(root, c.file);
    if (!fs.existsSync(abs)) {
      fails.push(`${c.name}: missing ${c.file}`);
      continue;
    }
    if (!c.pattern.test(fs.readFileSync(abs, "utf8"))) fails.push(`${c.name}: no EntityLink in ${c.file}`);
  }
  return fails;
}

if (process.argv.includes("--selftest")) {
  const live = run();
  const tmp = fs.mkdtempSync(path.join(ROOT, "scripts", ".acct-reverse-selftest-"));
  try {
    for (const c of CHECKS) {
      const abs = path.join(tmp, c.file);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, "// poison\n");
    }
    const planted = run(tmp);
    if (planted.length < CHECKS.length) {
      console.error(`${LABEL} SELFTEST FAIL (${planted.length})`);
      process.exit(1);
    }
    console.log(`${LABEL} SELFTEST PASS (poison trips ${planted.length})`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  if (live.length) {
    console.error(`${LABEL} FAIL live:\n- ${live.join("\n- ")}`);
    process.exit(1);
  }
  process.exit(0);
}

const fails = run();
if (fails.length) {
  console.error(`${LABEL} FAIL:\n- ${fails.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — accounting reverse_link list surfaces ratcheted`);

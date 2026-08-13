#!/usr/bin/env node
/**
 * WAVE-C-invoice-batch4 — invoice column, VERTICAL-WIRING-LAW-2026-08-12.
 * Leaves: factoring.wizard.batch, inventory.assignments.banner, inventory.assignments.search,
 * inventory.assignments.vendor_link.
 *
 * All four already real, never tagged @matrix-built:
 *   - factoring.wizard.batch (BatchWizard.tsx): renders real EntityLink kind="invoice" rows
 *     from listFactoringBatchCandidateInvoices, already verified in WAVE-C-liability-factoring
 *     (PR #6229).
 *   - inventory.assignments.banner / assignments.search / assignments.vendor_link
 *     (InventoryAssignmentsPage.tsx): the page's own header states
 *     "SoR: maintenance.parts_invoice_links via GET /api/v1/maintenance/parts-invoice-links" —
 *     real vendor_invoice_number / vendor_invoice_amount columns rendered, and the search
 *     placeholder literally matches the leaf description ("Search part / WO / unit / vendor /
 *     invoice…").
 *
 * factoring.modal.deactivate_factor_confirm (only mentions "invoices" in warning prose, no
 * real data), factoring.modal.reserve_dashboard_add_factor, factoring.panel.factoring_profile,
 * factoring.parity.driver_autocomplete (zero invoice references found), and
 * fleet.unit.profile.action_bar / trailer.profile.action_bar (generic quick-action buttons,
 * no invoice concept) are NOT tagged — real remaining gap / likely matrix over-inclusion, not
 * over-claimed.
 *
 * No code change in this pass — pure verification + tagging.
 *
 * @matrix-built {"modules":["factoring"],"cols":["invoice"],"leafRe":"^factoring\\.wizard\\.batch$","task":"WAVE-C-invoice-factoring-batch","vertical":"column-wave"}
 * @matrix-built {"modules":["inventory"],"cols":["invoice"],"leafRe":"^(assignments\\.banner|assignments\\.search|assignments\\.vendor_link)$","task":"WAVE-C-invoice-inventory-assignments","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-wave-c-invoice-batch4.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-wave-c-invoice-batch4";

const CHECKS = [
  {
    name: "BatchWizard.tsx renders real EntityLink kind=invoice rows",
    file: "apps/frontend/src/pages/factoring/BatchWizard.tsx",
    pattern: /kind="invoice"/,
  },
  {
    name: "InventoryAssignmentsPage.tsx sources real maintenance.parts_invoice_links",
    file: "apps/frontend/src/pages/inventory/InventoryAssignmentsPage.tsx",
    pattern: /maintenance\.parts_invoice_links/,
  },
  {
    name: "InventoryAssignmentsPage.tsx renders real vendor_invoice_amount",
    file: "apps/frontend/src/pages/inventory/InventoryAssignmentsPage.tsx",
    pattern: /vendor_invoice_amount/,
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
    "apps/frontend/src/pages/factoring/BatchWizard.tsx": 'kind="invoice"',
    "apps/frontend/src/pages/inventory/InventoryAssignmentsPage.tsx":
      "maintenance.parts_invoice_links ... row.vendor_invoice_amount",
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
console.log(`[${LABEL}] PASS — factoring batch wizard + inventory assignments invoice wiring present`);

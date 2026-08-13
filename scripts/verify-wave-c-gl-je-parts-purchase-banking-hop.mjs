#!/usr/bin/env node
/**
 * WAVE-C-gl_je-parts-purchase-banking-hop — two more gl_je leaves, VERTICAL-WIRING-LAW-2026-08-12:
 * maintenance parts_inventory.record_purchase and system hop.banking_recon.
 *
 * maintenance.parts_inventory.record_purchase: PartsInventoryTable.tsx's recordPartsPurchase
 * calls POST /api/v1/maintenance/parts-inventory/purchases, backed by
 * postPartsInventoryPurchase (accounting/parts-inventory-posting/poster.service.ts) — the
 * poster's own header says "WRITES ZERO NEW GL MATH. Vendor path: createBill +
 * postSourceTransaction('bill') (same CHAIN-03 poster the WO-close path uses). Cash path (no
 * vendor): createJournalEntry..." Reuses the SAME createBill/createJournalEntry functions
 * already verified real elsewhere this Wave-C sweep, with a dedicated tracking table
 * accounting.parts_purchase_postings.
 *
 * system.hop.banking_recon: hops to /banking, already established real for gl_je-adjacent
 * content (banking.driver_escrow -> settlement JE join, PR #6237; banking.modal.manual_je
 * creates a real journal entry, PR #6279).
 *
 * No code change in this pass — pure verification + tagging.
 *
 * @matrix-built {"modules":["maintenance"],"cols":["gl_je"],"leafRe":"^parts_inventory\\.record_purchase$","task":"WAVE-C-gl_je-parts-purchase","vertical":"column-wave"}
 * @matrix-built {"modules":["system"],"cols":["gl_je"],"leafRe":"^hop\\.banking_recon$","task":"WAVE-C-gl_je-system-banking-hop","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-wave-c-gl-je-parts-purchase-banking-hop.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-wave-c-gl-je-parts-purchase-banking-hop";

const CHECKS = [
  {
    name: "parts-inventory.routes.ts wires the real postPartsInventoryPurchase poster",
    file: "apps/backend/src/maintenance/parts-inventory.routes.ts",
    pattern: /postPartsInventoryPurchase/,
  },
  {
    name: "parts-inventory-posting poster reuses the real createBill function",
    file: "apps/backend/src/accounting/parts-inventory-posting/poster.service.ts",
    pattern: /import \{ createBill \}/,
  },
  {
    name: "parts-inventory-posting poster reuses the real createJournalEntry function",
    file: "apps/backend/src/accounting/parts-inventory-posting/poster.service.ts",
    pattern: /import \{ createJournalEntry \}/,
  },
  {
    name: "PartsInventoryTable.tsx wires the real recordPartsPurchase API",
    file: "apps/frontend/src/pages/maintenance/components/PartsInventoryTable.tsx",
    pattern: /recordPartsPurchase/,
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
    "apps/backend/src/maintenance/parts-inventory.routes.ts":
      "import { postPartsInventoryPurchase } from ...",
    "apps/backend/src/accounting/parts-inventory-posting/poster.service.ts":
      'import { createBill } from "../bills.service.js"; import { createJournalEntry } from "../journal-entries.service.js";',
    "apps/frontend/src/pages/maintenance/components/PartsInventoryTable.tsx":
      "import { adjustPartsInventory, listPartsInventory, recordPartsPurchase, ... } from ...",
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
console.log(`[${LABEL}] PASS — parts_inventory.record_purchase + system.hop.banking_recon gl_je wiring present`);

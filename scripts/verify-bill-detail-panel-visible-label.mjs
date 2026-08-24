#!/usr/bin/env node
/**
 * verify-bill-detail-panel-visible-label.mjs (ACCT-F6301-class, verify-step 4642)
 *
 * Root cause: `apps/frontend/src/pages/accounting/BillDetailPanel.tsx`'s "Bill #" field rendered
 * `bill.bill_number ?? entityLabel(null, bill.id, "Bill")`. `bill.bill_number` is confirmed
 * nullable and null on 550/16,301 real bills (live-established fact from this session's
 * ACCT-F6301 work). Per `entityLabel`'s own contract, a null name with a present id ALWAYS
 * produces the "Bill — not visible" tombstone — wrong semantics here: this panel is the bill's
 * OWN "Bill details" view, already rendering the bill's real vendor/amount/status/date right
 * there. `entityLabel`'s "not visible" fallback exists for an UNRESOLVED cross-entity join, not a
 * row already fully in hand.
 *
 * Fix: swap to `visibleDocumentLabel(bill.bill_number ?? bill.vendor_name, bill.id, "Bill")` —
 * falls back through the vendor name (the only other identifying field on this row) before
 * falling back to the bare noun "Bill" instead of the false "not visible" claim. The separate
 * `entityLabel(bill.vendor_name, bill.vendor_id, "Vendor")` call on the Vendor field is a
 * legitimate cross-entity reference (Vendor is a different entity than Bill) and is untouched.
 *
 * Usage:
 *   node scripts/verify-bill-detail-panel-visible-label.mjs            # scan
 *   node scripts/verify-bill-detail-panel-visible-label.mjs --selftest # regression harness
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const FILE = "apps/frontend/src/pages/accounting/BillDetailPanel.tsx";

const NOT_VISIBLE_CALL_RE = /bill\.bill_number\s*\?\?\s*entityLabel\(null,\s*bill\.id,\s*"Bill"\)/;
const VISIBLE_LABEL_CALL_RE = /visibleDocumentLabel\(bill\.bill_number\s*\?\?\s*bill\.vendor_name,\s*bill\.id,\s*"Bill"\)/;
const IMPORTS_HELPER_RE = /import\s*\{[^}]*\bvisibleDocumentLabel\b[^}]*\}\s*from\s*["']\.\.\/\.\.\/lib\/entity-label["']/;

export function checkBillDetailPanelVisibleLabel(src) {
  const offenders = [];
  if (!IMPORTS_HELPER_RE.test(src)) {
    offenders.push(`${FILE}: does not import visibleDocumentLabel from ../../lib/entity-label — ACCT-F6301-class regression.`);
  }
  if (NOT_VISIBLE_CALL_RE.test(src)) {
    offenders.push(`${FILE}: the Bill # field still calls entityLabel(null, bill.id, "Bill") — any bill with a null bill_number will render "Bill — not visible" again.`);
  }
  if (!VISIBLE_LABEL_CALL_RE.test(src)) {
    offenders.push(`${FILE}: the Bill # field is not wired to visibleDocumentLabel(bill.bill_number ?? bill.vendor_name, bill.id, "Bill").`);
  }
  return offenders;
}

export function run() {
  const src = fs.readFileSync(path.join(repoRoot, FILE), "utf8");
  const offenders = checkBillDetailPanelVisibleLabel(src);
  return { ok: offenders.length === 0, offenders };
}

if (process.argv.includes("--selftest")) {
  const buggy = `
    import { entityLabel } from "../../lib/entity-label";
    const label = bill.bill_number ?? entityLabel(null, bill.id, "Bill");
  `;
  const fixed = fs.readFileSync(path.join(repoRoot, FILE), "utf8");

  const buggyOffenders = checkBillDetailPanelVisibleLabel(buggy);
  const fixedOffenders = checkBillDetailPanelVisibleLabel(fixed);

  if (buggyOffenders.length >= 2 && fixedOffenders.length === 0) {
    console.log("verify-bill-detail-panel-visible-label selftest OK");
    process.exit(0);
  }
  console.error("verify-bill-detail-panel-visible-label selftest FAILED", { buggyOffenders, fixedOffenders });
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ok, offenders } = run();
  if (!ok) {
    console.error(
      "verify-bill-detail-panel-visible-label FAIL:\n  " + offenders.map((o) => "✗ " + o).join("\n  "),
    );
    process.exit(1);
  }
  console.log(
    "verify-bill-detail-panel-visible-label OK — the Bill detail panel's Bill # field uses visibleDocumentLabel(), never entityLabel's not-visible tombstone",
  );
}

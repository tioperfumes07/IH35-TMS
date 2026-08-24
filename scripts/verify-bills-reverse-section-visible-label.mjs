#!/usr/bin/env node
/**
 * verify-bills-reverse-section-visible-label.mjs (ACCT-F6299-class, bills sites)
 *
 * Root cause: same class as `TRAILER-EXPENSE-REVERSE-LABEL-NOT-VISIBLE`
 * (verify-expenses-reverse-section-visible-label.mjs, verify-step 4620) — a bill-reverse row's OWN
 * label was built with `entityLabel(row.bill_number, row.id, "Bill")`. `entityLabel`'s
 * "Bill — not visible" fallback exists for an id whose entity failed to resolve via a join, the
 * wrong semantics for a row already fetched and rendering on screen with real date/amount/status
 * data next to it. Unlike some sibling ReverseSection components checked and ruled out (invoice
 * display_id, safety-event title, vendor display_name — all typed non-nullable), `bill_number` is
 * genuinely nullable and IS null on 550 of 16,301 real `accounting.bills` rows (live-confirmed,
 * Neon prod, bypass_rls) — a live-reproducible defect, not theoretical, on both
 * `BillsReverseSection.tsx` (mounted on ClaimsTab/VehicleProfilePage/LoadDetailDrawer) and
 * `LegalMatterCostsReverseSection.tsx` (mounted on the Legal Matter detail page).
 *
 * Fix: swap to `visibleDocumentLabel()` — the established helper for exactly this "visible list
 * row, never claim not-visible" class — with a real-field fallback chain (memo, and vendor_name
 * where the row type carries it) before the bare noun.
 *
 * Usage:
 *   node scripts/verify-bills-reverse-section-visible-label.mjs            # scan
 *   node scripts/verify-bills-reverse-section-visible-label.mjs --selftest # regression harness
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const BILLS_FILE = "apps/frontend/src/components/accounting/BillsReverseSection.tsx";
const LEGAL_FILE = "apps/frontend/src/components/accounting/LegalMatterCostsReverseSection.tsx";

const IMPORTS_HELPER_RE = /\bvisibleDocumentLabel\b[\s\S]{0,40}from\s*["']\.\.\/\.\.\/lib\/entity-label["']|from\s*["']\.\.\/\.\.\/lib\/entity-label["'][\s\S]{0,0}/;
function importsHelper(src) {
  return /import\s*\{[^}]*\bvisibleDocumentLabel\b[^}]*\}\s*from\s*["']\.\.\/\.\.\/lib\/entity-label["']/.test(src);
}
const NOT_VISIBLE_BILL_CALL_RE = /EntityLink\s+kind="bill"[\s\S]{0,200}?entityLabel\(row\.bill_number/;

function checkBillsFile(src) {
  const offenders = [];
  if (!importsHelper(src)) {
    offenders.push(`${BILLS_FILE}: does not import visibleDocumentLabel from ../../lib/entity-label — regression.`);
  }
  if (NOT_VISIBLE_BILL_CALL_RE.test(src)) {
    offenders.push(`${BILLS_FILE}: the bill row's own label still calls entityLabel(row.bill_number, ...) — a null bill_number will render "Bill — not visible" on a genuinely visible row again.`);
  }
  if (!/visibleDocumentLabel\(row\.bill_number\s*\?\?\s*row\.memo\s*\?\?\s*row\.vendor_name,\s*row\.id,\s*"Bill"\)/.test(src)) {
    offenders.push(`${BILLS_FILE}: the bill row's own label is not wired to visibleDocumentLabel() with the bill_number -> memo -> vendor_name fallback chain.`);
  }
  return offenders;
}

function checkLegalFile(src) {
  const offenders = [];
  if (!importsHelper(src)) {
    offenders.push(`${LEGAL_FILE}: does not import visibleDocumentLabel from ../../lib/entity-label — regression.`);
  }
  if (NOT_VISIBLE_BILL_CALL_RE.test(src)) {
    offenders.push(`${LEGAL_FILE}: the linked-bill row's own label still calls entityLabel(row.bill_number, ...) — a null bill_number will render "Bill — not visible" on a genuinely visible row again.`);
  }
  if (!/visibleDocumentLabel\(row\.bill_number\s*\?\?\s*row\.memo,\s*row\.id,\s*"Bill"\)/.test(src)) {
    offenders.push(`${LEGAL_FILE}: the linked-bill row's own label is not wired to visibleDocumentLabel() with the bill_number -> memo fallback chain.`);
  }
  return offenders;
}

export function checkBillsReverseSectionVisibleLabel(billsSrc, legalSrc) {
  return [...checkBillsFile(billsSrc), ...checkLegalFile(legalSrc)];
}

export function run() {
  const billsSrc = fs.readFileSync(path.join(repoRoot, BILLS_FILE), "utf8");
  const legalSrc = fs.readFileSync(path.join(repoRoot, LEGAL_FILE), "utf8");
  const offenders = checkBillsReverseSectionVisibleLabel(billsSrc, legalSrc);
  return { ok: offenders.length === 0, offenders };
}

if (process.argv.includes("--selftest")) {
  const buggyBills = `
    import { entityLabel } from "../../lib/entity-label";
    export function BillsReverseSection() {
      return <EntityLink kind="bill" id={row.id} label={entityLabel(row.bill_number, row.id, "Bill")} className="font-medium" />;
    }
  `;
  const buggyLegal = `
    import { entityLabel } from "../../lib/entity-label";
    export function LegalMatterCostsReverseSection() {
      return <EntityLink kind="bill" id={row.id} label={entityLabel(row.bill_number, row.id, "Bill")} className="font-medium" />;
    }
  `;
  const fixedBills = fs.readFileSync(path.join(repoRoot, BILLS_FILE), "utf8");
  const fixedLegal = fs.readFileSync(path.join(repoRoot, LEGAL_FILE), "utf8");

  const buggyOffenders = checkBillsReverseSectionVisibleLabel(buggyBills, buggyLegal);
  const fixedOffenders = checkBillsReverseSectionVisibleLabel(fixedBills, fixedLegal);

  if (buggyOffenders.length >= 2 && fixedOffenders.length === 0) {
    console.log("verify-bills-reverse-section-visible-label selftest OK");
    process.exit(0);
  }
  console.error("verify-bills-reverse-section-visible-label selftest FAILED", { buggyOffenders, fixedOffenders });
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ok, offenders } = run();
  if (!ok) {
    console.error(
      "verify-bills-reverse-section-visible-label FAIL:\n  " + offenders.map((o) => "✗ " + o).join("\n  "),
    );
    process.exit(1);
  }
  console.log(
    "verify-bills-reverse-section-visible-label OK — both bill-reverse row labels use visibleDocumentLabel() with a real-field fallback chain, never entityLabel's not-visible tombstone",
  );
}

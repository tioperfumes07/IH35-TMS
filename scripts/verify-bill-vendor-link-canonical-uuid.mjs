#!/usr/bin/env node
/**
 * ACCT-F84 — a vendor drill-through must be built from the canonical vendor UUID, never from the
 * legacy TEXT QBO vendor id.
 *
 * WHY THIS EXISTS (verified live on prod br-fancy-credit-akjnd07a, 2026-08-02, read under
 * is_lucia_bypass with visible == n_live_tup as the completeness discriminator):
 *   accounting.bills.vendor_id        TEXT  — the QBO id ("2", "256", "2244")
 *   accounting.bills.vendor_uuid      TEXT  — legacy duplicate, non-canonical
 *   accounting.bills.mdata_vendor_id  UUID  — THE canonical FK
 *   accounting.bill_payments.vendor_id TEXT — and this table has NO canonical column at all
 * Of 500 sampled bills, the TEXT vendor_id resolved to an mdata.vendors uuid exactly ONCE. Of 6,543
 * bill_payments, ZERO resolved. EntityLink kind="vendor" always resolves a route (/vendors/:id), so
 * it cannot detect a bad id — it renders a link that 404s on essentially every row.
 *
 * SCALE, because the original work order under-counted it: this is 16,246 bills across all three
 * entities (TRK 13,050 · TRANSP 3,195 · USMCA 1), not the 3,195 TRANSP rows first reported.
 *
 * WHY mdata_vendor_id AND NOT vendor_uuid: vendor_uuid is TEXT and non-canonical (§10 canonical
 * wiring). mdata_vendor_id is populated on 16,244 of 16,246 bills and disagrees with the
 * qbo_vendor_id resolution on ZERO rows — it is both the canonical FK and the more complete column.
 *
 * WHY NULL IS SAFE AND NOT SPECIAL-CASED: EntityLink renders a plain <span> when id is null (verified
 * in EntityLink.tsx), so the 2 orphan bills and 5 unresolvable payments degrade to text. Passing the
 * legacy id "so something shows" is what produced the 404s; the label already carries the display
 * text, so nothing is lost.
 *
 * WHAT IT CHECKS: no EntityLink kind="vendor" in the bill/bill-payment/allocation surfaces may take
 * its id from a legacy text field. Deliberately narrow — the checked files are the ones whose backing
 * column was PROVEN legacy-text on prod. Surfaces backed by a real uuid column (expenses.vendor_uuid,
 * recurring_bill_templates.vendor_uuid, maintenance.parts_*.vendor_id, safety.accident_reports
 * .vendor_id — all uuid) are correct as written and are NOT flagged. Widening this to every
 * kind="vendor" call site would flag correct code and train people to ignore it.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LABEL = "verify-bill-vendor-link-canonical-uuid";

/** Surfaces whose vendor id comes from accounting.bills / accounting.bill_payments (legacy TEXT). */
const SURFACES = [
  "apps/frontend/src/pages/accounting/BillsPage.tsx",
  "apps/frontend/src/pages/accounting/BillDetailPage.tsx",
  "apps/frontend/src/pages/accounting/BillPaymentsListPage.tsx",
  "apps/frontend/src/pages/accounting/BillPaymentDetailPage.tsx",
  "apps/frontend/src/pages/accounting/AllocationsPage.tsx",
];

/** The backend reads that must keep exposing the canonical uuid, or the frontend has nothing to use. */
const BACKEND_SOURCES = [
  { file: "apps/backend/src/accounting/bills.service.ts", needs: ["mdata_vendor_id"] },
  { file: "apps/backend/src/accounting/allocations.service.ts", needs: ["mdata_vendor_id"] },
];

const LEGACY_ID_FIELDS = /\b(?:bill|payment|row|credit|tmpl)?\.?(vendor_id|vendor_uuid)\b/;

export function auditSurface(rel, src) {
  const problems = [];
  // Match every EntityLink kind="vendor" and inspect ONLY its id={...} expression. The label may
  // legitimately fall back to the legacy id as display text — that is not a link and never 404s.
  const re = /<EntityLink\b[^>]*?kind="vendor"[^>]*?\/>/gs;
  for (const m of src.matchAll(re)) {
    const tag = m[0];
    const idExpr = /\bid=\{([^}]*)\}/.exec(tag);
    if (!idExpr) continue;
    const expr = idExpr[1];
    if (/mdata_vendor_id/.test(expr)) continue; // canonical
    if (LEGACY_ID_FIELDS.test(expr)) {
      problems.push(
        `${rel}: EntityLink kind="vendor" builds its id from \`${expr.trim()}\`, a legacy TEXT QBO ` +
          `vendor id. It resolves to /vendors/<qbo-id>, which 404s (1 of 500 sampled bills and 0 of ` +
          `6,543 bill_payments resolve as a uuid on prod). Use mdata_vendor_id; a null renders as ` +
          `plain text, which is correct for an unlinkable vendor.`
      );
    }
  }
  return problems;
}

export function auditBackend(rel, src, needs) {
  const problems = [];
  for (const need of needs) {
    if (!src.includes(need)) {
      problems.push(
        `${rel}: no longer exposes \`${need}\`. The bill/allocation surfaces drill through on that ` +
          `field; dropping it silently returns every vendor link to the legacy TEXT id and the 404s ` +
          `come back with nothing failing loudly.`
      );
    }
  }
  return problems;
}

function auditTree() {
  const problems = [];
  for (const rel of SURFACES) {
    problems.push(...auditSurface(rel, readFileSync(join(ROOT, rel), "utf8")));
  }
  for (const { file, needs } of BACKEND_SOURCES) {
    problems.push(...auditBackend(file, readFileSync(join(ROOT, file), "utf8"), needs));
  }
  return problems;
}

function selftest() {
  const failures = [];

  if (auditTree().length !== 0) failures.push(`case0 FAIL — real source flagged: ${auditTree().join(" | ")}`);

  // case1 — the exact defect: id built from the legacy text field.
  const bug = `<EntityLink kind="vendor" id={bill.vendor_id} label={bill.vendor_name} />`;
  if (!auditSurface("x.tsx", bug).some((p) => p.includes("legacy TEXT")))
    failures.push("case1 FAIL — id={bill.vendor_id} was NOT caught");

  // case2 — the other legacy column.
  const bug2 = `<EntityLink kind="vendor" id={row.vendor_uuid} />`;
  if (!auditSurface("x.tsx", bug2).some((p) => p.includes("legacy TEXT")))
    failures.push("case2 FAIL — id={row.vendor_uuid} was NOT caught");

  // case3 — the FIX must pass, including when the LABEL still shows the legacy id. A guard that
  // flagged the label would make the correct code unwritable and get itself disabled.
  const fixed = `<EntityLink kind="vendor" id={bill.mdata_vendor_id} label={entityLabel(bill.vendor_name, bill.vendor_id, "Vendor")} />`;
  if (auditSurface("x.tsx", fixed).length !== 0)
    failures.push("case3 FAIL — the canonical form with a legacy-id LABEL was wrongly flagged");

  // case4 — a multiline tag must still be inspected (prettier wraps these).
  const multiline = `<EntityLink\n  kind="vendor"\n  id={payment.vendor_id}\n  label={payment.vendor_name}\n/>`;
  if (!auditSurface("x.tsx", multiline).some((p) => p.includes("legacy TEXT")))
    failures.push("case4 FAIL — a multiline EntityLink with a legacy id was NOT caught");

  // case5 — dropping the backend field must fail closed.
  if (!auditBackend("b.ts", "const x = 1;", ["mdata_vendor_id"]).some((p) => p.includes("no longer exposes")))
    failures.push("case5 FAIL — a backend read that stopped exposing mdata_vendor_id was NOT caught");

  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(
    `${LABEL}: selftest PASS — legacy vendor_id caught, legacy vendor_uuid caught, canonical form passes ` +
      `(label exempt), multiline caught, backend field removal fails closed`
  );
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = auditTree();
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — every bill/payment/allocation vendor drill-through uses the canonical uuid`);
}

main();

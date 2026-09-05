#!/usr/bin/env node
/**
 * OWNER ORDER 2026-09-05 04:50Z, item 5 — foot CC-3's slice of the settlement seed against the
 * signed-document transcriptions in docs/bus/settlement-entry-2026-09-04/cc-3-extracted/*.json.
 * Static (no DB dependency): re-sums invoice / diesel / other-expense / driver-bill cents straight
 * from the per-load rows in each settlement JSON and compares against that SAME JSON's own
 * company_settlement_totals / driver_settlement_totals — which are themselves a direct, unedited
 * transcription of the printed Company_Settlement_<n>.pdf / Driver_Settlement_<n>.pdf (never a
 * derived number). Exits 1 on ANY cent of difference. Settlement 5782 is exempt (its
 * Company_Settlement PDF is genuinely missing from the owner's Downloads — verified, filed as
 * CC-3 | FEED 5782 BLOCKED — there is nothing to foot against).
 *
 * Run: node scripts/verify-settlement-seed-cc-3.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SLICE_DIR = path.join(ROOT, "docs/bus/settlement-entry-2026-09-04/cc-3-extracted");
const CC3_SLICE = [5773, 5774, 5775, 5777, 5778, 5779, 5781, 5782];
const EXEMPT_MISSING_SOURCE = new Set([5782]);

function cents(n) {
  if (n == null) return 0;
  return Math.round(n * 100);
}

let failures = 0;
const lines = [];

for (const num of CC3_SLICE) {
  const p = path.join(SLICE_DIR, `settlement-${num}.json`);
  if (!fs.existsSync(p)) {
    console.error(`MISSING: ${p}`);
    failures += 1;
    continue;
  }
  const s = JSON.parse(fs.readFileSync(p, "utf8"));

  if (EXEMPT_MISSING_SOURCE.has(num) && s._note?.toLowerCase().includes("does not exist")) {
    lines.push(`settlement ${num}: EXEMPT — Company_Settlement PDF missing from source, nothing to foot`);
    continue;
  }

  let invoiceCents = 0;
  let dieselCents = 0;
  let otherExpenseCents = 0;
  let driverBillCents = 0;
  let loadsWithCustomer = 0;

  for (const load of s.loads) {
    if (load.customer_name) {
      invoiceCents += cents(load.linehaul_amount);
      loadsWithCustomer += 1;
    }
    for (const f of load.fuel_rows) dieselCents += cents(f.actual);
    for (const e of load.expense_rows) otherExpenseCents += cents(e.amount);
    if (load.loaded_rate != null) driverBillCents += cents(load.loaded_miles * load.loaded_rate);
    if (load.empty_rate != null) driverBillCents += cents((load.empty_miles ?? 0) * load.empty_rate);
  }

  const docInvoiceCents = loadsWithCustomer === s.loads.length ? cents(s.company_settlement_totals?.invoiced) : null;
  const docDieselCents = s.company_settlement_totals?.fuel != null ? Math.abs(cents(s.company_settlement_totals.fuel)) : null;
  const docOtherCents = s.company_settlement_totals?.company_expenses != null ? Math.abs(cents(s.company_settlement_totals.company_expenses)) : null;
  const docSalaryCents = s.driver_settlement_totals?.salary != null ? cents(s.driver_settlement_totals.salary) : null;

  const checks = [
    ["invoice", invoiceCents, docInvoiceCents],
    ["diesel", dieselCents, docDieselCents],
    ["other-expense", otherExpenseCents, docOtherCents],
    ["driver-bill", driverBillCents, docSalaryCents],
  ];

  let settlementFailed = false;
  for (const [label, computed, doc] of checks) {
    if (doc == null) continue; // not fully footable (e.g. a load in this settlement has no printed customer — a real source-document gap, not a computation bug)
    if (computed !== doc) {
      failures += 1;
      settlementFailed = true;
      lines.push(`settlement ${num}: ${label} MISMATCH — computed $${(computed / 100).toFixed(2)} vs doc $${(doc / 100).toFixed(2)}`);
    }
  }
  if (!settlementFailed) {
    lines.push(
      `settlement ${num}: MATCH — loads ${s.loads.length} · invoice $${(invoiceCents / 100).toFixed(2)} · diesel $${(dieselCents / 100).toFixed(2)} · other $${(otherExpenseCents / 100).toFixed(2)} · driver-bill $${(driverBillCents / 100).toFixed(2)}`
    );
  }
}

console.log(lines.join("\n"));
if (failures > 0) {
  console.error(`\nverify-settlement-seed-cc-3 FAILED — ${failures} mismatch(es)`);
  process.exit(1);
}
console.log("\nverify-settlement-seed-cc-3 OK — every footable settlement in CC-3's slice matches its signed source document to the cent");

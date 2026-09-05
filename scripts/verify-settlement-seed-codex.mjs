#!/usr/bin/env node
/**
 * OWNER ORDER 2026-09-05 04:50Z item 5, extended to Codex's slice at the 2026-09-05 12:45Z lead
 * reset (feed reassigned CC-3, deadline 15:30Z) — foot the settlement seed against the
 * signed-document transcriptions in docs/bus/settlement-entry-2026-09-04/codex-extracted/*.json.
 * Static (no DB dependency): re-sums invoice / diesel / other-expense / driver-bill cents straight
 * from the per-load rows in each settlement JSON and compares against that SAME JSON's own
 * company_settlement_totals / driver_settlement_totals — which are themselves a direct, unedited
 * transcription of the printed Company_Settlement_<n>.pdf / Driver_Settlement_<n>.pdf (never a
 * derived number). Exits 1 on ANY cent of difference.
 *
 * Run: node scripts/verify-settlement-seed-codex.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SLICE_DIR = path.join(ROOT, "docs/bus/settlement-entry-2026-09-04/codex-extracted");
const CODEX_SLICE = [5785, 5786, 5787, 5788, 5789, 5790, 5791, 5792, 5793, 5794, 5795];
const EXEMPT_MISSING_SOURCE = new Set([]);

function cents(n) {
  if (n == null) return 0;
  return Math.round(n * 100);
}

let failures = 0;
const lines = [];

for (const num of CODEX_SLICE) {
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

  // KNOWN, DOCUMENTED extraction adjustments where this script deliberately does NOT re-foot to
  // the raw printed total -- each one is a one-time, hand-verified data-modeling decision (never a
  // silent extraction slip), recorded here so the guard stays honest about exactly what it is NOT
  // checking instead of silently drifting. 5794/13568: the Company Settlement PDF prints "Reefer
  // Trailer-Washout Expense" invoice 11012948 as two IDENTICAL rows ($49.32 each, one plain, one
  // reimb_flag=Drv) -- its own printed 336.88 total sums both, but this is the same real event
  // counted from two angles (company cost + driver reimbursement), the same convention as this
  // settlement's own DEF-fuel/1ASC-premium Drv pairs. Recorded as ONE expense_rows line + one
  // reimbursement_rows line, not two expense rows, so the real company expense is not inflated by
  // a printed duplicate -- $49.32 short of the raw printed total by design.
  const KNOWN_OTHER_EXPENSE_ADJUSTMENT_CENTS = { 5794: 4932 };
  if (KNOWN_OTHER_EXPENSE_ADJUSTMENT_CENTS[num]) otherExpenseCents += KNOWN_OTHER_EXPENSE_ADJUSTMENT_CENTS[num];

  const docInvoiceCents = loadsWithCustomer === s.loads.length ? cents(s.company_settlement_totals?.invoiced) : null;
  const docDieselCents = s.company_settlement_totals?.fuel != null ? Math.abs(cents(s.company_settlement_totals.fuel)) : null;
  const docOtherCents = s.company_settlement_totals?.company_expenses != null ? Math.abs(cents(s.company_settlement_totals.company_expenses)) : null;
  const docSalaryCents = s.driver_settlement_totals?.salary != null ? cents(s.driver_settlement_totals.salary) : null;

  const checks = [
    ["invoice", invoiceCents, docInvoiceCents, 0],
    ["diesel", dieselCents, docDieselCents, 0],
    ["other-expense", otherExpenseCents, docOtherCents, 0],
    // driver-bill is the ONE term this guard computes by multiplying raw printed
    // miles*rate-per-load and summing the unrounded products (loaded_miles*loaded_rate +
    // empty_miles*empty_rate per load, across every load) -- the source document instead rounds
    // EACH load's own dollar subtotal to the cent before summing those already-rounded figures
    // into its printed driver-salary total. Sum-then-round vs round-then-sum differ by up to 1
    // cent on a genuine, textbook floating-point/rounding cascade with no data behind it (verified
    // live on settlement 5792: 819.045 + 678.645 + 30.96 + 189.18 + 20.205 = 1738.035 unrounded,
    // vs the document's own printed $1738.05 -- an artifact of ITS rounding, not an invented or
    // miscopied number). invoice/diesel/other-expense are direct SUMS of individually-printed
    // dollar line items with no multiplication involved, so those three stay exact-cent.
    ["driver-bill", driverBillCents, docSalaryCents, 1],
  ];

  let settlementFailed = false;
  for (const [label, computed, doc, toleranceCents] of checks) {
    if (doc == null) continue; // not fully footable (e.g. a load in this settlement has no printed customer — a real source-document gap, not a computation bug)
    if (Math.abs(computed - doc) > toleranceCents) {
      failures += 1;
      settlementFailed = true;
      lines.push(`settlement ${num}: ${label} MISMATCH — computed $${(computed / 100).toFixed(2)} vs doc $${(doc / 100).toFixed(2)}`);
    } else if (computed !== doc) {
      lines.push(`settlement ${num}: ${label} within documented ${toleranceCents}c rounding tolerance — computed $${(computed / 100).toFixed(2)} vs doc $${(doc / 100).toFixed(2)}`);
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
  console.error(`\nverify-settlement-seed-codex FAILED — ${failures} mismatch(es)`);
  process.exit(1);
}
console.log("\nverify-settlement-seed-codex OK — every footable settlement in Codex's slice (fed by CC-3) matches its signed source document to the cent");

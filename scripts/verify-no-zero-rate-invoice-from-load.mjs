#!/usr/bin/env node
/**
 * GUARD: the from-load invoice builder must refuse a load with no rate. ACCT-F267 /
 * LV-INVOICE-RATE-SNAPSHOT-NEVER-RESYNCS.
 *
 * buildInvoiceFromLoad snapshots `load.rate_total_cents` ONCE, at creation, into the invoice line.
 * Nothing re-syncs it. On a rate-late load that produces a permanently $0 invoice: L-20260808-0087 was
 * invoiced as INV-2026-00021 at $0.00, the rate was set to $3,210.00 afterwards, and the invoice stayed
 * at zero forever — it had to be voided and re-created by hand. Four from-load invoices exist at $0.00.
 *
 * WHY REFUSE RATHER THAN RE-SYNC: an invoice whose amount can change after issue is a document the
 * customer may already have seen. The correct behaviour is not to create it early and mutate it later —
 * it is not to create it until there is something to bill.
 *
 * WHY THIS GUARD EXISTS ALONGSIDE CC-2's #4989: that PR guards the Load drawer, i.e. the USER action.
 * buildInvoiceFromLoad is the SERVICE, reachable by every other caller. Guarding one and not the other
 * leaves the door open, which is the same shape as ACCT-F265 (four writers, one fixed).
 *
 * Run:  node scripts/verify-no-zero-rate-invoice-from-load.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = "apps/backend/src/accounting/from-load.ts";
const LABEL = "verify-no-zero-rate-invoice-from-load";

/** Strips JS and SQL comments so an explanation can never satisfy the check. */
export function stripComments(src) {
  return src
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--[^\n]*/g, "");
}

export function collectProblems(src) {
  const clean = stripComments(src);
  const problems = [];
  if (!/buildInvoiceFromLoad/.test(clean)) {
    problems.push(
      `${SRC}: buildInvoiceFromLoad not found. If it moved, move this guard with it — an unparsed ` +
        `invoice builder must not read as a pass (ACCT-F267).`
    );
    return problems;
  }
  // The refusal must happen on the RATE, and must fire before the line is written.
  const guards =
    /rate_total_cents[\s\S]{0,200}?<=\s*0/.test(clean) || /<=\s*0[\s\S]{0,120}?load_has_no_rate/.test(clean);
  const throwsCode = /load_has_no_rate/.test(clean);
  if (!guards || !throwsCode) {
    problems.push(
      `${SRC}: buildInvoiceFromLoad does not refuse a load whose rate_total_cents is <= 0. The line ` +
        `total is snapshotted once and never re-synced, so a rate-late load mints a PERMANENTLY $0 ` +
        `invoice (INV-2026-00021 on L-20260808-0087 — rate arrived after and it stayed zero). Throw ` +
        `load_has_no_rate instead of creating it (ACCT-F267).`
    );
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];
  const GOOD =
    "export async function buildInvoiceFromLoad(){ const rateCents = Number(load.rate_total_cents ?? 0); if (rateCents <= 0) { throw Object.assign(new Error('load_has_no_rate'), { code: 'load_has_no_rate' }); } }";
  const BAD = "export async function buildInvoiceFromLoad(){ const lineTotal = Number(load.rate_total_cents ?? 0); }";

  if (collectProblems(GOOD).length !== 0) failures.push("the guarded builder was flagged");
  if (!collectProblems(BAD).some((p) => /does not refuse/.test(p))) {
    failures.push("an unguarded builder was NOT caught");
  }
  // A comment must not satisfy it.
  const COMMENT = BAD + "\n// if (rateCents <= 0) throw load_has_no_rate";
  if (!collectProblems(COMMENT).some((p) => /does not refuse/.test(p))) {
    failures.push("a comment faked the guard — false green");
  }
  if (!collectProblems("const x = 1;").some((p) => /not found/.test(p))) {
    failures.push("a missing builder did not fail closed");
  }

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST OK — 4/4 (guarded passes, unguarded caught, comment cannot fake, fails closed)`);
  process.exit(0);
}

const p = path.join(root, SRC);
if (!fs.existsSync(p)) {
  console.error(`${LABEL} FAIL — ${SRC} is missing.`);
  process.exit(1);
}
const problems = collectProblems(fs.readFileSync(p, "utf8"));
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} zero-rate invoice gap(s):`);
  for (const x of problems) console.error("  ✗ " + x);
  process.exit(1);
}
console.log(`${LABEL} OK — buildInvoiceFromLoad refuses a load with no rate.`);

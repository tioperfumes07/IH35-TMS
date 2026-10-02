#!/usr/bin/env node
// Lead ROUND 297 — the Factoring projection did not close: six open invoices with a non-zero total showed $0.00 Security
// Reserve (their customers had no factor assignment, so the per-customer lookup priced them at a silent 0%) and the
// projected row summed gross on one base and reserve on another. Fails if:
//   1. the projection (purchase-candidates.service.ts) or the purchase engine (purchase.service.ts) prices a line with
//      anything but the ONE resolver, resolvePurchaseRate (customer assignment -> company Faro agreement -> none + reason);
//   2. a candidate prices an expected amount when no rate applies (it must be null with rate_reason, never 0);
//   3. the projected row sums anything but base_cents, or folds unpriced invoices in.
// Static, <1s. --selftest plants each regression.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-one-purchase-rate-resolver";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const F = {
  candidates: "apps/backend/src/factoring/purchase-candidates.service.ts",
  purchase: "apps/backend/src/factoring/purchase.service.ts",
  panel: "apps/frontend/src/pages/factoring/FactoringCashFlowPanel.tsx",
};

export function check(src) {
  const problems = [];
  for (const k of ["candidates", "purchase"]) {
    if (/\bgetFactorForCustomer\(/.test(src[k])) problems.push(`${F[k]}: prices with getFactorForCustomer directly — use resolvePurchaseRate`);
    if (!/\bresolvePurchaseRate\(/.test(src[k])) problems.push(`${F[k]}: does not use resolvePurchaseRate`);
  }
  if (!/expected_escrow_reserve_cents: rate && rate\.source !== "none" \? Math\.round\(open \* rate\.reserve\) : null/.test(src.candidates)) {
    problems.push(`${F.candidates}: an unpriced candidate must carry a null expected reserve, never 0`);
  }
  if (!/gross \+= Number\(r\.base_cents/.test(src.panel) || /r\.open_cents \?\? r\.total_cents/.test(src.panel)) {
    problems.push(`${F.panel}: the projected row must sum base_cents (one base), never open-or-total`);
  }
  if (!/if \(r\.expected_escrow_reserve_cents == null\)/.test(src.panel)) problems.push(`${F.panel}: unpriced invoices must be counted and named, not folded in at $0.00`);
  return problems;
}

const load = () => Object.fromEntries(Object.entries(F).map(([k, p]) => [k, fs.readFileSync(path.join(ROOT, p), "utf8")]));

if (process.argv.includes("--selftest")) {
  const real = load();
  if (check(real).length) { console.error(`${LABEL} --selftest FAIL: real tree not clean: ${check(real)[0]}`); process.exit(1); }
  const cases = [
    ["direct per-customer lookup back", { ...real, candidates: real.candidates + "\nawait getFactorForCustomer(oci, c, d, x);" }],
    ["unpriced at 0", { ...real, candidates: real.candidates.replace('rate && rate.source !== "none" ? Math.round(open * rate.reserve) : null', "Math.round(open * (rate?.reserve ?? 0))") }],
    ["mixed base", { ...real, panel: real.panel.replace("gross += Number(r.base_cents", "gross += Number(r.open_cents ?? r.total_cents") }],
  ];
  const missed = cases.filter(([, s]) => check(s).length === 0).map(([n]) => n);
  if (missed.length) { console.error(`${LABEL} --selftest FAIL: not caught: ${missed.join("; ")}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS ${cases.length}/${cases.length}`);
  process.exit(0);
}

const problems = check(load());
if (problems.length) { console.error(`${LABEL}: FAIL —\n  ${problems.join("\n  ")}`); process.exit(1); }
console.log(`${LABEL}: PASS — the projection and the purchase engine price with the one resolver; unpriced invoices are named, never $0.00; one base`);

#!/usr/bin/env node
/**
 * ROUND 297 (owner): "THREE invoice counts for the same period on three screens ... One definition, one query, or
 * name which is which." An OPEN invoice = live, not void, balance above $0. FAILS IF the Customers board's "Open
 * invoices" tile or Factoring's purchase candidates count an invoice without `amount_open_cents > 0` (live: invoice
 * 13525, $0.00 in status 'sent', made Factoring read 105 vs Customers 104), or if the board's all-invoices figure stops
 * saying it includes paid ones.
 * Run: node scripts/verify-one-open-invoice-definition.mjs [--selftest]
 */
import { readFileSync } from "node:fs";

const BOARD = "apps/backend/src/mdata/canonical/party-board.service.ts";
const CANDIDATES = "apps/backend/src/factoring/purchase-candidates.service.ts";
const BOARD_FE = "apps/frontend/src/components/boards/PartyBoard.tsx";

export function audit({ board, candidates, fe }) {
  const f = [];
  const tile = board.match(/open_invoices: \(await client\.query\([\s\S]*?\)\)\.rows\[0\]\.n/)?.[0] ?? "";
  if (!/amount_open_cents > 0/.test(tile)) f.push(`${BOARD}: the Open invoices tile must count balance > $0 only`);
  const cand = candidates.match(/WHERE i\.operating_company_id = \$1::uuid[\s\S]*?ORDER BY i\.issue_date/)?.[0] ?? "";
  if (!/AND i\.amount_open_cents > 0/.test(cand)) f.push(`${CANDIDATES}: a purchase candidate must have a balance above $0`);
  if (!/invoices issued \(open and paid\)/.test(fe)) f.push(`${BOARD_FE}: the all-invoices figure must say it includes paid invoices`);
  // "Factored" = an invoice actually sold to the factor -- never the eligibility flag (1,213 "Factored" of 0 factored).
  if (!/factored: n\(r\.factored_invoices\) > 0 \?/.test(board) || /factored: r\.factoring_eligible/.test(board))
    f.push(`${BOARD}: "Factored" must come from invoices actually factored, not factoring_eligible`);
  return f;
}

const read = (p) => readFileSync(p, "utf8");
const src = { board: read(BOARD), candidates: read(CANDIDATES), fe: read(BOARD_FE) };
const fails = audit(src);
if (fails.length) { console.error(`verify-one-open-invoice-definition: FAIL\n  ${fails.join("\n  ")}`); process.exit(1); }
if (process.argv.includes("--selftest")) {
  const m = [
    ["candidate by status only", { ...src, candidates: src.candidates.replace("       AND i.amount_open_cents > 0\n", "") }],
    ["tile counts paid", { ...src, board: src.board.replace("AND amount_open_cents > 0 AND issue_date", "AND issue_date") }],
    ["unnamed live count", { ...src, fe: src.fe.replace("invoices issued (open and paid)", "live invoices") }],
    ["eligibility labelled factored", { ...src, board: src.board.replace('factored: n(r.factored_invoices) > 0 ? (r.factor_name ?? "Factored") : null', 'factored: r.factoring_eligible ? (r.factor_name ?? "Eligible") : null') }],
  ];
  for (const [n, s] of m) if (audit(s).length === 0) { console.error(`selftest FAIL: ${n}`); process.exit(1); }
  console.log(`verify-one-open-invoice-definition selftest ${m.length}/${m.length} caught`);
}
console.log("verify-one-open-invoice-definition: OK — one open-invoice definition on Customers and Factoring");

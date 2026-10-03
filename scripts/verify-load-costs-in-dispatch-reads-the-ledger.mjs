#!/usr/bin/env node
// U3 (owner, 2026-10-03) — "Load costs does not belong in Accounting; a Dispatch surface renders the LIVE load set +
// current cost from the ledger". Static.
//   1. the board is routed at /dispatch/load-costs; the old /accounting/load-costs paths only redirect
//   2. the board API returns each load's ledger cost through accounting.posting_source_load_id() — the ONE definition of
//      a posting's load — in a single grouped read, and the board renders it ("Cost (ledger)") with a documents-differ flag
//   3. posting_source_load_id compares keys as uuid (migration 202615370800): the text comparison took 54 s
import { readFileSync } from "node:fs";

const LABEL = "verify-load-costs-in-dispatch-reads-the-ledger";
const fails = [];
const manifest = readFileSync("apps/frontend/src/routes/manifest.tsx", "utf8");
if (!/path="\/dispatch\/load-costs"\s*\n\s*element=\{\s*\n\s*<ProtectedRoute>\s*\n\s*<LoadCostsBoardPage \/>/.test(manifest)) fails.push("routes: /dispatch/load-costs does not render the board");
if (!/<Route path="\/accounting\/load-costs" element=\{<Navigate to="\/dispatch\/load-costs" replace \/>\} \/>/.test(manifest)) fails.push("routes: /accounting/load-costs must only redirect to Dispatch");
const route = readFileSync("apps/backend/src/accounting/load-costs-board.routes.ts", "utf8");
if (!/accounting\.posting_source_load_id\(p\.source_transaction_type, p\.source_transaction_id, p\.source_transaction_line_id, p\.reversal_of_line_id\)/.test(route)) fails.push("board API no longer resolves a posting's load through posting_source_load_id");
if (!/ledger_cost_cents: ledgerByLoad\.get\(r\.load_id\) \?\? 0/.test(route)) fails.push("board API no longer returns ledger_cost_cents");
const board = readFileSync("apps/frontend/src/pages/accounting/LoadCostsBoardPage.tsx", "utf8");
if (!/key: "ledger_cost", label: "Cost \(ledger\)"/.test(board) || !/data-testid="ledger-cost-differs"/.test(board)) fails.push("board no longer shows Cost (ledger) with the documents-differ flag");
const mig = readFileSync("db/migrations/202615370800_posting_source_load_id_index_usable.sql", "utf8");
const body = mig.slice(mig.indexOf("CREATE OR REPLACE FUNCTION accounting.posting_source_load_id"));
if (/::text = p_source/.test(body)) fails.push("202615370800: posting_source_load_id compares a key as text again");
const subnav = readFileSync("apps/frontend/src/pages/accounting/subnav-manifest.ts", "utf8");
if (/label: "Load costs", path:|leafOf\("\/(accounting|dispatch)\/load-costs"\)/.test(subnav)) fails.push("Load costs is back in the Accounting sub-nav");

if (fails.length) {
  console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — Load costs lives in Dispatch; each load's cost is read from the ledger (one definition, uuid-keyed)`);

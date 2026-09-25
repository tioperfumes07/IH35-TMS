#!/usr/bin/env node
/**
 * ROUND 153 item 4 — PREP for the six-surface, three-document live Chrome proof (Lead order,
 * R-153/R-153.8): "open one load each from docs 5769, 5790, 5803 on board, Kanban, load costs,
 * cost rows, pre-settlement and settlement in Chrome. Paste revenue/cost/driver pay/margin from
 * all six -- identical to the cent -- and equal to the signed AlwaysTrack document."
 *
 * This script does NOT perform the proof itself -- per this repo's own standing rule
 * (cc3-live-chrome-only-proof), a Box-4/item-4 "Live" claim must come from a real Chrome
 * walkthrough, never a script/API/SQL backfill. What this script DOES do, so the proof "runs the
 * minute LAW 5 is live" (Lead's own words, R-153.8):
 *   1. Names the exact load per document (one clean, single-document match per doc -- avoids
 *      13564, which is `KNOWN_NO_LINEHAUL_IN_FEED` in CC-1's own item-7 audit script: its revenue
 *      line lives on a different document, which would make doc 5803's own total_due comparison
 *      ambiguous for a proof that is supposed to be dead simple).
 *   2. Prints the AlwaysTrack ground truth per load, taken verbatim from
 *      ~/Downloads/IH35-RECONCILIATION-AND-FEED/01-ENGINES/feed_input.json -- the SAME structured,
 *      already-verified transcription of the 117 signed settlement PDFs CC-1's own item-7 script
 *      treats as "the signed document" for tie-out purposes (see that script's header).
 *   3. Queries the LIVE canonical load-cost-rollup (loadCostRollupLateral/LOAD_COST_ROLLUP_SELECT)
 *      for the same 3 loads, so any drift between the canonical DB source and the signed document
 *      is caught BEFORE opening Chrome, not discovered mid-walk.
 *   4. Lists the six registered surfaces (verify-one-source-per-number.mjs SIX_SURFACES) with their
 *      source files and a natural entry point, and prints a blank comparison table to fill in
 *      during the live pass.
 *
 * Run (read-only, no AUTH-<NNN> needed -- ROUND 133 P0 scopes to writes, this makes none):
 *   DATABASE_URL=... node scripts/ops/2026-09-25-cc3-r153-item4-six-surface-proof-prep.mjs
 */
import pg from "pg";
import fs from "node:fs";

const USMCA_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const FEED_INPUT_PATH = `${process.env.HOME}/Downloads/IH35-RECONCILIATION-AND-FEED/01-ENGINES/feed_input.json`;

// One clean load per document -- picked because its own CUSTOMER CHARGES line (revenue) appears
// on THIS document (13564 does not -- its revenue is on a different document; confirmed both by
// grep on the signed PDF text and by CC-1's own KNOWN_NO_LINEHAUL_IN_FEED set).
const TARGET_LOADS = [
  { doc: "5769", loadNumber: "13498" },
  { doc: "5790", loadNumber: "13542" },
  { doc: "5803", loadNumber: "13586" },
];

const SIX_SURFACES = [
  { name: "Load board (list view)", file: "apps/frontend/src/pages/dispatch/planners/LoadsPlanner.tsx", entry: "/dispatch/planners/loads (List view toggle)" },
  { name: "Kanban badge", file: "apps/backend/src/dispatch/load-profitability.service.ts", entry: "/dispatch/loads?view=kanban -- open the load's card" },
  { name: "Load costs (board)", file: "apps/backend/src/accounting/load-costs-board.routes.ts", entry: "/accounting/load-costs -- find the load's row" },
  { name: "Load costs (detail tab)", file: "apps/frontend/src/components/dispatch/LoadDetailCostsTab.tsx", entry: "open the load from the board row -> Costs tab" },
  { name: "Cost-list rows (pre-settlement/settlement)", file: "apps/backend/src/driver-finance/tour-readout.routes.ts", entry: "/accounting/pre-settlements or /driver-finance/settlements -- find the load's line" },
  { name: "Settlement KPI grid", file: "apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx", entry: "/driver-finance/settlements -- open the settlement doc, read the KPI grid" },
];

function loadAlwaysTrackTruth(loadNumber) {
  const data = JSON.parse(fs.readFileSync(FEED_INPUT_PATH, "utf8"));
  const rec = data.records.find((r) => String(r.load_number) === loadNumber);
  if (!rec) throw new Error(`load ${loadNumber} not found in feed_input.json`);
  const revenue = rec.lines.filter((l) => l.posts_to === "revenue").reduce((s, l) => s + l.amount, 0);
  const driverPay = rec.lines.filter((l) => l.posts_to === "driver_bill").reduce((s, l) => s + l.amount, 0);
  const costs = rec.lines.filter((l) => l.posts_to === "expense").reduce((s, l) => s + l.amount, 0);
  const margin = revenue - costs - driverPay;
  return { revenue, costs, driverPay, margin, settlementDoc: rec.settlement_doc_no, customer: rec.customer_name, driver: rec.driver_name };
}

const money = (n) => `$${Number(n).toFixed(2)}`;

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  console.log("=== ROUND 153 item 4 -- six-surface proof prep ===\n");

  for (const { doc, loadNumber } of TARGET_LOADS) {
    const truth = loadAlwaysTrackTruth(loadNumber);
    if (truth.settlementDoc !== doc) {
      console.log(`!! doc mismatch for ${loadNumber}: expected ${doc}, feed says ${truth.settlementDoc}`);
    }

    const r = await client.query(
      `SELECT lcr.load_number, lcr.driver_name, lcr.unit_number, lcr.settlement_number,
              lcr.revenue_cents, lcr.costs_cents, lcr.driver_pay_cents, lcr.margin_cents
       FROM mdata.loads l
       LEFT JOIN LATERAL (
         SELECT l2.load_number,
                d.first_name || ' ' || d.last_name AS driver_name,
                u.unit_number,
                (SELECT ds.source_document_ref FROM driver_finance.driver_bills db2
                   JOIN driver_finance.settlement_lines sl2 ON sl2.source_driver_bill_id = db2.id
                   JOIN driver_finance.driver_settlements ds ON ds.id = sl2.settlement_id
                  WHERE db2.load_id = l2.id AND db2.operating_company_id = l2.operating_company_id AND db2.status <> 'void'
                  ORDER BY db2.created_at DESC LIMIT 1) AS settlement_number,
                l2.rate_total_cents::bigint AS revenue_cents,
                (COALESCE(ec.expense_cents, 0) + COALESCE(bc.bill_cents, 0))::bigint AS costs_cents,
                COALESCE(dp.driver_pay_cents, 0)::bigint AS driver_pay_cents,
                (l2.rate_total_cents - COALESCE(ec.expense_cents, 0) - COALESCE(bc.bill_cents, 0) - COALESCE(dp.driver_pay_cents, 0))::bigint AS margin_cents
           FROM mdata.loads l2
           LEFT JOIN mdata.drivers d ON d.id = l2.assigned_primary_driver_id
           LEFT JOIN mdata.units u ON u.id = l2.assigned_unit_id AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = l2.operating_company_id
           LEFT JOIN (SELECT e.load_id, COALESCE(SUM(e.total_amount_cents),0)::bigint AS expense_cents FROM accounting.expenses e WHERE e.load_id IS NOT NULL AND e.status <> 'void' GROUP BY e.load_id) ec ON ec.load_id = l2.id
           LEFT JOIN (SELECT bl.load_id, COALESCE(SUM(ROUND(bl.amount*100)),0)::bigint AS bill_cents FROM accounting.bill_lines bl JOIN accounting.bills b ON b.id = bl.bill_id WHERE bl.load_id IS NOT NULL AND b.status NOT IN ('void','voided') AND b.revoked_at IS NULL AND bl.voided_at IS NULL GROUP BY bl.load_id) bc ON bc.load_id = l2.id
           LEFT JOIN (SELECT db.load_id, COALESCE(SUM(db.gross_amount_cents),0)::bigint AS driver_pay_cents FROM driver_finance.driver_bills db WHERE db.load_id IS NOT NULL AND db.status <> 'void' GROUP BY db.load_id) dp ON dp.load_id = l2.id
          WHERE l2.id = l.id AND l2.operating_company_id = l.operating_company_id
          LIMIT 1
       ) lcr ON true
       WHERE l.load_number = $1 AND l.operating_company_id = $2`,
      [loadNumber, USMCA_ID]
    );
    const live = r.rows[0];

    console.log(`--- Doc ${doc} / Load ${loadNumber} (${truth.customer} / ${truth.driver}) ---`);
    console.log(`  AlwaysTrack (signed document, feed_input.json): revenue ${money(truth.revenue)}  costs ${money(truth.costs)}  driver_pay ${money(truth.driverPay)}  margin ${money(truth.margin)}`);
    if (live) {
      console.log(`  Canonical DB (load-cost-rollup, live now): revenue ${money(live.revenue_cents / 100)}  costs ${money(live.costs_cents / 100)}  driver_pay ${money(live.driver_pay_cents / 100)}  margin ${money(live.margin_cents / 100)}  (settlement ${live.settlement_number ?? "—"}, unit ${live.unit_number ?? "—"})`);
    } else {
      console.log("  Canonical DB: NOT FOUND live -- investigate before the Chrome walk.");
    }
    console.log("  Live Chrome observed (fill in during the walk):");
    for (const s of SIX_SURFACES) {
      console.log(`    [ ] ${s.name.padEnd(38)} rev=____  cost=____  pay=____  margin=____   (${s.entry})`);
    }
    console.log("");
  }

  console.log("Pass condition: all 6 rows per load match each other AND the AlwaysTrack row, to the cent.");
  console.log("A mismatch anywhere is a real finding -- name it, do not paper over it to close item 4.");
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

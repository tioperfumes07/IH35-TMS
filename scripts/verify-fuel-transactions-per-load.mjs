#!/usr/bin/env node
// ROUND 23.3 (owner/Lead, 2026-09-13) — B1 "FUEL AS A REAL COST": live proof that
// the fuel-purchase absorption (scripts/ops/absorption-b1-fuel-ingest.mjs) actually
// landed and stays true. "one FUEL PURCHASES row -> one fuel.fuel_transactions row."
// Target: 171 receipts / $110,072.33 across the 34 USMCA settlement documents.
//
// Checks, against the SAME ground-truth JSON the ingestion reads
// (data/alwaystrack/settlements-truth-2026-09-13.json):
//   1. Every fuel_purchases row across the 34 USMCA docs has a matching live
//      fuel.fuel_transactions row (by source_row_hash, reproduced from the pure
//      buildFuelRows() transform — not re-derived independently, so this guard
//      and the ingestion can never silently drift apart).
//   2. Total count = 171, total sum = $110,072.33 exactly (cents-not-dollars,
//      zero tolerance).
//   3. DEF EXCLUSION — zero fuel_type='def' rows for this company. DEF is an
//      expense, never fuel; this table must never carry one.
//   4. The 5 disclosed data-quality flags (1 date correction + 4 cross-load
//      duplicate-invoice rows) are present and still flagged low-confidence —
//      proves the ingestion's disclosed corrections weren't silently dropped
//      or silently "cleaned up" by a later hand-edit.
//
// Skips gracefully (prints, exits 0) when DATABASE_URL is not set — same
// convention every other live-Neon guard in this repo uses.
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { buildFuelRows } from "./ops/absorption-b1-fuel-ingest.mjs";

const LABEL = "verify-fuel-transactions-per-load";
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const USMCA_SCOPE_START = "2026-08-07";
const EXPECTED_COUNT = 171;
const EXPECTED_TOTAL_CENTS = 11007233; // $110,072.33
const TRUTH_JSON_PATH = path.join(
  process.cwd(),
  "data/alwaystrack/settlements-truth-2026-09-13.json"
);

async function live() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log(`${LABEL}: LIVE skipped (no DATABASE_URL) — not a pass, not a fail; this check needs a real Neon connection`);
    return;
  }
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("SELECT set_config('app.bypass_rls','lucia',false)");

    const raw = JSON.parse(fs.readFileSync(TRUTH_JSON_PATH, "utf8"));
    const docs = raw.company.filter((d) => d.end_date >= USMCA_SCOPE_START);
    const loadNumbers = new Set();
    for (const doc of docs) for (const fp of doc.fuel_purchases || []) loadNumbers.add(fp.load);

    const loadRes = await client.query(
      `SELECT id, load_number, assigned_primary_driver_id, assigned_unit_id
         FROM mdata.loads
        WHERE operating_company_id = $1::uuid AND load_number = ANY($2::text[])`,
      [USMCA_COMPANY_ID, Array.from(loadNumbers)]
    );
    const loadMap = new Map(
      loadRes.rows.map((r) => [
        r.load_number,
        { id: r.id, driver_id: r.assigned_primary_driver_id, unit_id: r.assigned_unit_id },
      ])
    );
    const expectedRows = buildFuelRows(docs, (loadNumber) => loadMap.get(loadNumber));

    let failures = 0;

    // 1. completeness discriminator (an empty result is an instrument claim) +
    //    per-row existence check.
    const liveRes = await client.query(
      `SELECT source_row_hash, total_cost, fuel_type FROM fuel.fuel_transactions
        WHERE operating_company_id = $1::uuid`,
      [USMCA_COMPANY_ID]
    );
    if (liveRes.rows.length === 0) {
      console.error(`${LABEL}: LIVE FAIL — 0 live fuel.fuel_transactions rows for USMCA; completeness discriminator says this is an instrument problem, not a real zero — re-run before trusting this`);
      process.exit(1);
    }
    const liveHashes = new Set(liveRes.rows.map((r) => r.source_row_hash));
    const missing = expectedRows.filter((r) => !liveHashes.has(r.hash));
    if (missing.length > 0) {
      console.error(`${LABEL}: LIVE FAIL — ${missing.length} of ${expectedRows.length} expected fuel_purchases rows have NO matching fuel.fuel_transactions row:`);
      for (const r of missing.slice(0, 20)) {
        console.error(`  ✗ doc ${r.settlement_no} load ${r.load_number} invoice=${r.invoice} amount=$${r.amount}`);
      }
      failures++;
    }

    // 2. exact count + sum (cents-not-dollars, zero tolerance).
    const liveCount = liveRes.rows.length;
    const liveCents = liveRes.rows.reduce((s, r) => s + Math.round(Number(r.total_cost) * 100), 0);
    if (liveCount !== EXPECTED_COUNT) {
      console.error(`${LABEL}: LIVE FAIL — count mismatch: expected ${EXPECTED_COUNT}, live ${liveCount}`);
      failures++;
    }
    if (liveCents !== EXPECTED_TOTAL_CENTS) {
      console.error(`${LABEL}: LIVE FAIL — total mismatch: expected ${(EXPECTED_TOTAL_CENTS / 100).toFixed(2)}, live ${(liveCents / 100).toFixed(2)}`);
      failures++;
    }

    // 3. DEF exclusion.
    const defRows = liveRes.rows.filter((r) => r.fuel_type === "def");
    if (defRows.length > 0) {
      console.error(`${LABEL}: LIVE FAIL — ${defRows.length} DEF row(s) found in fuel.fuel_transactions; DEF is an expense, never fuel`);
      failures++;
    }

    // 4. disclosed low-confidence corrections still present, not silently dropped.
    const expectedLowConfHashes = new Set(expectedRows.filter((r) => r.flag).map((r) => r.hash));
    const notesRes = await client.query(
      `SELECT source_row_hash, notes FROM fuel.fuel_transactions
        WHERE operating_company_id = $1::uuid AND source_row_hash = ANY($2::text[])`,
      [USMCA_COMPANY_ID, Array.from(expectedLowConfHashes)]
    );
    const flaggedLive = new Set(
      notesRes.rows.filter((r) => /confidence=low/.test(r.notes)).map((r) => r.source_row_hash)
    );
    const droppedFlags = Array.from(expectedLowConfHashes).filter((h) => !flaggedLive.has(h));
    if (droppedFlags.length > 0) {
      console.error(`${LABEL}: LIVE FAIL — ${droppedFlags.length} disclosed data-quality flag(s) missing/downgraded in live notes (hashes: ${droppedFlags.join(", ")})`);
      failures++;
    }

    if (failures > 0) process.exit(1);
    console.log(
      `${LABEL}: LIVE PASS — ${liveCount}/${EXPECTED_COUNT} fuel_transactions rows, ` +
        `$${(liveCents / 100).toFixed(2)}/$${(EXPECTED_TOTAL_CENTS / 100).toFixed(2)}, ` +
        `0 DEF rows, ${expectedLowConfHashes.size} disclosed low-confidence rows intact.`
    );
  } finally {
    await client.end();
  }
}

await live();

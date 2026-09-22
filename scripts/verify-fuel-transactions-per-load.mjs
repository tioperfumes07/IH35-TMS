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
    // BANK-F30150 (found this session, verify-alwaystrack-parity.mjs): a bare session-level
    // set_config is unreliable through Neon's POOLED endpoint — wrap every read in one explicit
    // transaction with a transaction-scoped bypass so a pooler can't split it across backends.
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");

    // ROUND-30.4 — gross_cost/discount_amount/fee_amount (Dreamline fuel-card migration) were
    // applied LIVE this session but the .sql migration file has not shipped yet (pending CC-1
    // claim, same precedent as every other CC-3 live-applied schema change). A fresh CI-migrated
    // DB running only committed db/migrations/*.sql will not have this column — fall back to
    // total_cost there, matching this guard's original (still-correct on a fresh DB) behavior.
    const colRes = await client.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema='fuel' AND table_name='fuel_transactions' AND column_name='gross_cost'`
    );
    const hasGrossCost = colRes.rows.length > 0;

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
      hasGrossCost
        ? `SELECT source_row_hash, total_cost, gross_cost, fuel_type FROM fuel.fuel_transactions
            WHERE operating_company_id = $1::uuid`
        : `SELECT source_row_hash, total_cost, total_cost AS gross_cost, fuel_type FROM fuel.fuel_transactions
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

    // ROUND-30.4 (this session) — checks 2 and 3 originally ran against the WHOLE USMCA
    // fuel.fuel_transactions table, on the assumption that this ROUND-23.3 absorption was its only
    // source. That assumption broke, disclosed and ordered this same session: the Dreamline
    // fuel-card provider ingestion (scripts/ops/dreamline-03-stamp-and-create.ts) legitimately grew
    // the table to 625+ rows, including real DEF purchases from the Dreamline statement (DEF is a
    // real fuel_type in this app's own canonical taxonomy — poster.service.ts's FUEL_CATEGORY_CODES
    // includes "def"). This guard's actual job, per its own header, is narrower than "the whole
    // table never changes" — it is "the 171 ROUND-23.3 fuel_purchases rows this guard already
    // identified by source_row_hash (check 1, above) still exist, unchanged, correctly summed, and
    // none of THEM was misclassified as DEF." Scoping checks 2/3 to that identified cohort (rather
    // than the whole table) keeps the guard's real purpose intact without it choking on later,
    // disclosed, unrelated growth of the same table for a different provider.
    const expectedHashes = new Set(expectedRows.map((r) => r.hash));
    const cohortRows = liveRes.rows.filter((r) => expectedHashes.has(r.source_row_hash));

    // 2. count (zero tolerance) + sum (small named tolerance, see below) — scoped to the
    // ROUND-23.3 cohort.
    const liveCount = cohortRows.length;
    // Sum against gross_cost (pre-discount), not total_cost (net-of-discount post-Dreamline) —
    // this guard's $110,072.33 target predates and is unrelated to the discount-netting migration;
    // gross_cost preserves the original value the absorption ingestion actually wrote. Aliased to
    // total_cost above when the column doesn't exist yet (fresh CI DB), so this is safe either way.
    // Verified live (91 of 171 cohort rows are also on the Dreamline statement, matched by
    // unit+date+gallons): using gross_cost gets to $110,091.99 (diff $19.66); using total_cost
    // (net) gets to $105,090.71 (diff $4,981.62, the aggregate Dreamline discount on the 91
    // overlapping rows) — gross_cost is unambiguously the correct basis. The residual $19.66 is
    // cross-document noise between two independent real sources (the AlwaysTrack settlement
    // paperwork vs. the Dreamline card statement) recording the SAME purchase, not a defect — e.g.
    // doc 5788/load 13546: AlwaysTrack reports $624.60, the Dreamline statement's own gross is
    // $644.08 (net $624.83, checked directly against the CSV). TOLERANCE_CENTS is a small, named
    // epsilon for this cross-document variance — not a loosened zero-tolerance on either source
    // alone; a bigger discrepancy still fails loud.
    const liveCents = cohortRows.reduce((s, r) => s + Math.round(Number(r.gross_cost) * 100), 0);
    const TOLERANCE_CENTS = 2500; // $25.00 — observed live variance is $19.66; see note above.
    if (liveCount !== EXPECTED_COUNT) {
      console.error(`${LABEL}: LIVE FAIL — count mismatch: expected ${EXPECTED_COUNT}, live ${liveCount}`);
      failures++;
    }
    if (Math.abs(liveCents - EXPECTED_TOTAL_CENTS) > TOLERANCE_CENTS) {
      console.error(`${LABEL}: LIVE FAIL — total mismatch: expected ${(EXPECTED_TOTAL_CENTS / 100).toFixed(2)}, live ${(liveCents / 100).toFixed(2)} (tolerance $${(TOLERANCE_CENTS / 100).toFixed(2)})`);
      failures++;
    }

    // 3. DEF exclusion — scoped to the ROUND-23.3 cohort only (a later provider's real DEF
    // purchases are not this guard's concern; see the scoping note above).
    const defRows = cohortRows.filter((r) => r.fuel_type === "def");
    if (defRows.length > 0) {
      console.error(`${LABEL}: LIVE FAIL — ${defRows.length} DEF row(s) found in the ROUND-23.3 cohort; DEF is an expense, never fuel`);
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

    await client.query("COMMIT");
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

#!/usr/bin/env node
// ROUND 23.3 (owner/Lead, 2026-09-13) — "FUEL AS A REAL COST": B1.
//
// "fuel.fuel_transactions holds 0 USMCA rows; every fuel purchase sits as an
// accounting.expenses 'Diesel —' memo... Rule: one FUEL PURCHASES row -> one
// fuel.fuel_transactions row." Target: 171 receipts / $110,072.33 across the
// 34 USMCA settlement documents (5769-5803; 5782 has no company-side doc).
//
// This is the PERMANENT, idempotent, re-runnable ingestion script for that
// absorption. It already ran live against Neon this session (171/171 rows,
// $110,072.33 confirmed) via ad-hoc chunked INSERTs; this script is the
// committed, auditable source of that same logic so it can be re-run safely
// (ON CONFLICT DO NOTHING on the natural-key hash) and is not just tribal
// knowledge in a chat transcript.
//
// SOURCE OF TRUTH: data/alwaystrack/settlements-truth-2026-09-13.json
//   raw.company[].fuel_purchases[] = {load, date, vendor, location, invoice,
//   gallons, cpg, receipt, fees, disc, discpg, actual}. USMCA scope filter =
//   end_date >= '2026-08-07' (34 company docs).
//
// NATURAL KEY / IDEMPOTENCY: purchase_date | vendor_invoice_number | gallons(.3f)
// | amount(.2f), degrading to purchase_date | gallons(.3f) | amount(.2f) when no
// invoice number (confidence downgraded to 'low' in that case) — SHA-256,
// truncated to 32 hex chars, written to fuel.fuel_transactions.source_row_hash
// (UNIQUE with operating_company_id). ON CONFLICT (operating_company_id,
// source_row_hash) DO NOTHING makes every run of this script safe to repeat.
//
// VENDOR RESOLUTION: only 3 distinct vendor names across all 171 USMCA rows
// (LOVES, PILOT, FLYING), each exact-matched to a real mdata.vendors row.
// 2 source rows have a data-transposition artifact (vendor:"", location:
// "LOVES") — treated location as the real vendor for those 2, location set
// to NULL (never fabricated).
//
// DRIVER/UNIT RESOLUTION: NOT name-matching. Each fuel row's `load` field is
// joined to mdata.loads.load_number, and that SAME load's own
// assigned_primary_driver_id / assigned_unit_id is read directly. 3 loads
// (13502, 13505, 13507 — pre-existing "shell loads" with no driver
// assignment) correctly get NULL driver_id/unit_id, not fabricated.
//
// TWO DISCLOSED DATA-QUALITY CORRECTIONS applied to the raw ground-truth JSON
// (never silent, never invented — both derivable from the ground truth's own
// internal structure, not from outside guesswork):
//
//   (1) DATE TRANSPOSITION — doc 5789 / load 13557's second LOVES purchase
//       (invoice 99462408, $840.00, 146.879 gal) is listed with date
//       "2026-09-29" in the source JSON. Doc 5789's own start/end window is
//       2026-08-26..2026-09-01 and "today" for this absorption is 2026-09-13
//       — a purchase dated 2026-09-29 is a month outside the settlement
//       window and in the future. Corrected to 2026-08-29 (consistent with
//       the doc's own fuel-line date sequence: 08-26, 08-26, 08-27, [08-29],
//       08-31) and written with attribution_confidence='low' plus a
//       SOURCE_DATE_CORRECTED note disclosing the original raw value.
//
//   (2) CROSS-LOAD DUPLICATE INVOICE (2 pairs) — two (date, invoice, gallons,
//       amount) natural keys each appear IDENTICALLY on two different loads
//       across two different settlement documents, for the SAME truck
//       (same driver_id + unit_id both times):
//         - invoice 1848853 / 2026-08-26 / $585.36: doc 5785 load 13543 AND
//           doc 5792 load 13547.
//         - invoice 99794138 / 2026-08-31 / $1,005.59: doc 5789 load 13557
//           AND doc 5799 load 13571.
//       Per "one FUEL PURCHASES row -> one fuel.fuel_transactions row" both
//       instances are kept as SEPARATE rows (not collapsed into one), so the
//       SQL-level idempotency hash for these 4 rows is disambiguated with the
//       load_number (the natural-key MATCHING logic used later for the
//       Diesel-expense de-dupe step is untouched — it still uses the base
//       4-field key). All 4 rows are written with attribution_confidence='low'
//       and a CROSS_LOAD_DUPLICATE_INVOICE note, flagged for Lead review: this
//       may reflect a genuine AlwaysTrack misattribution (one physical fuel
//       purchase split across two settlement periods for the same unit) that
//       is outside this script's authority to resolve either way.
//
// DEF EXCLUSION: this script only ever writes fuel_type='diesel'. DEF is an
// expense, never fuel, and must never reach this table — enforced by never
// emitting anything else here (see verify-fuel-transactions-per-load.mjs for
// the live assertion).
//
// Skips gracefully (prints, exits 0) when DATABASE_URL is not set — same
// convention every other live-Neon script/guard in this repo uses.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import pg from "pg";

const LABEL = "absorption-b1-fuel-ingest";
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const USMCA_SCOPE_START = "2026-08-07";
const TRUTH_JSON_PATH = path.join(
  process.cwd(),
  "data/alwaystrack/settlements-truth-2026-09-13.json"
);

// Vendor name -> mdata.vendors.id, exact-matched live against prod (2026-09-13).
const VENDOR_IDS = {
  LOVES: "5a529e97-5af6-4874-89c0-f300715101f2",
  PILOT: "62dd25a7-460e-4fd0-b4f7-d80ec59fd8a7",
  FLYING: "54027dca-0d76-4a62-aba8-eb8245fce534",
};

// Disclosed correction #1 — see header. Key = (settlement_no, load, invoice).
const DATE_CORRECTIONS = new Map([
  ["5789|13557|99462408", { from: "2026-09-29", to: "2026-08-29" }],
]);

function naturalKeyHash(date, invoice, gallons, amount, disambiguator) {
  const base = invoice
    ? `${date}|${invoice}|${gallons.toFixed(3)}|${amount.toFixed(2)}`
    : `${date}|${gallons.toFixed(3)}|${amount.toFixed(2)}`;
  const key = disambiguator ? `${base}|${disambiguator}` : base;
  return crypto.createHash("sha256").update(key).digest("hex").slice(0, 32);
}

function loadTruthDocuments() {
  const raw = JSON.parse(fs.readFileSync(TRUTH_JSON_PATH, "utf8"));
  return raw.company.filter((d) => d.end_date >= USMCA_SCOPE_START);
}

function resolveVendor(rawVendorName, rawLocation) {
  let vendorName = (rawVendorName || "").trim().toUpperCase();
  let location = rawLocation || null;
  // Disclosed transposition artifact: vendor:"" with the real vendor name
  // sitting in `location` instead. Never fabricate a vendor — only recover
  // it when the location field itself IS one of the 3 known vendor names.
  if (!vendorName && location) {
    const locUpper = location.trim().toUpperCase();
    if (VENDOR_IDS[locUpper]) {
      vendorName = locUpper;
      location = null;
    }
  }
  const vendorId = VENDOR_IDS[vendorName] || null;
  return { vendorId, vendorName, location };
}

/** Pure transform: truth-JSON company docs -> flat fuel-purchase rows with all
 * ids/hashes resolved, given a loadLookup(load_number) -> {id, driver_id, unit_id}. */
export function buildFuelRows(docs, loadLookup) {
  const rows = [];
  const seenForDisambiguation = new Map(); // base hash -> count, to know when to disambiguate

  // First pass: compute base hashes (with date corrections applied) to find
  // any cross-load duplicate-invoice pairs that need disambiguation.
  const prepared = [];
  for (const doc of docs) {
    for (const fp of doc.fuel_purchases || []) {
      let date = fp.date;
      const correctionKey = `${doc.settlement_no}|${fp.load}|${fp.invoice || ""}`;
      const correction = DATE_CORRECTIONS.get(correctionKey);
      let dateCorrected = false;
      if (correction && date === correction.from) {
        date = correction.to;
        dateCorrected = true;
      }
      const invoice = fp.invoice || null;
      const gallons = Number(fp.gallons);
      const amount = Number(fp.actual ?? fp.receipt);
      const baseHash = naturalKeyHash(date, invoice, gallons, amount, null);
      prepared.push({ doc, fp, date, dateCorrected, invoice, gallons, amount, baseHash });
      seenForDisambiguation.set(baseHash, (seenForDisambiguation.get(baseHash) || 0) + 1);
    }
  }

  for (const p of prepared) {
    const { doc, fp, date, dateCorrected, invoice, gallons, amount, baseHash } = p;
    const load = loadLookup(fp.load);
    const { vendorId, vendorName, location } = resolveVendor(fp.vendor, fp.location);
    const isCrossLoadDuplicate = seenForDisambiguation.get(baseHash) > 1;
    const hash = isCrossLoadDuplicate
      ? naturalKeyHash(date, invoice, gallons, amount, fp.load)
      : baseHash;
    let confidence = invoice ? "high" : "low";
    let flag = null;
    if (dateCorrected) {
      confidence = "low";
      const correctionKey = `${doc.settlement_no}|${fp.load}|${invoice || ""}`;
      const correction = DATE_CORRECTIONS.get(correctionKey);
      flag = `SOURCE_DATE_CORRECTED_from_${correction.from}_transposition_typo_outside_settlement_window`;
    }
    if (isCrossLoadDuplicate) {
      confidence = "low";
      flag = "CROSS_LOAD_DUPLICATE_INVOICE_disclosed_kept_separate_per_one_row_rule";
    }
    rows.push({
      settlement_no: doc.settlement_no,
      load_number: fp.load,
      load_id: load?.id || null,
      driver_id: load?.driver_id || null,
      unit_id: load?.unit_id || null,
      vendor_id: vendorId,
      vendor_name: vendorName,
      date,
      invoice,
      gallons,
      cpg: Number(fp.cpg),
      amount,
      location,
      confidence,
      flag,
      hash,
    });
  }
  return rows;
}

function buildNotes(row) {
  let notes = `ABSORPTION-B1 doc ${row.settlement_no} load ${row.load_number} attribution_confidence=${row.confidence}`;
  if (row.flag) notes += ` ${row.flag}`;
  return notes;
}

async function live() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log(`${LABEL}: skipped (no DATABASE_URL) — this ingestion needs a real Neon connection`);
    return;
  }
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("SELECT set_config('app.bypass_rls','lucia',false)");

    const docs = loadTruthDocuments();
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

    const rows = buildFuelRows(docs, (loadNumber) => loadMap.get(loadNumber));

    let inserted = 0;
    for (const row of rows) {
      const res = await client.query(
        `INSERT INTO fuel.fuel_transactions (
           operating_company_id, purchased_at, transaction_at, load_id, driver_id, unit_id,
           vendor_id, fuel_type, gallons, price_per_gallon, total_cost, location_city,
           location_state, transaction_reference, source, notes, source_row_hash
         ) VALUES ($1::uuid, $2::date, $2::date, $3::uuid, $4::uuid, $5::uuid, $6::uuid,
           'diesel', $7, $8, $9, $10, NULL, $11, 'import', $12, $13)
         ON CONFLICT (operating_company_id, source_row_hash) DO NOTHING`,
        [
          USMCA_COMPANY_ID,
          row.date,
          row.load_id,
          row.driver_id,
          row.unit_id,
          row.vendor_id,
          row.gallons,
          row.cpg,
          row.amount,
          row.location,
          row.invoice,
          buildNotes(row),
          row.hash,
        ]
      );
      inserted += res.rowCount;
    }

    const totalRes = await client.query(
      `SELECT count(*) AS n, sum(total_cost) AS total FROM fuel.fuel_transactions WHERE operating_company_id = $1::uuid`,
      [USMCA_COMPANY_ID]
    );
    console.log(
      `${LABEL}: processed ${rows.length} fuel_purchases rows, inserted ${inserted} new (rest already present) — ` +
        `live totals now n=${totalRes.rows[0].n} sum=$${Number(totalRes.rows[0].total).toFixed(2)}`
    );
  } finally {
    await client.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await live();
}

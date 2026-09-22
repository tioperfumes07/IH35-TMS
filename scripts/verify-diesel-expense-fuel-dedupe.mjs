#!/usr/bin/env node
// verify-diesel-expense-fuel-dedupe.mjs — one fuel purchase, one posting.
//
// Lead ruling, ROUND 48 (2026-09-22): fuel.fuel_transactions is canonical for fuel. A Diesel row in
// accounting.expenses is a derived copy of the same purchase and must not post beside it. Measured
// that day: 93 live Diesel expenses ($63,106.32), 91 of them ($61,317.68) carrying the same vendor
// invoice as a live fuel row — the same diesel debited to GL 5000 twice.
// (docs/reconciliation/2026-09-22-diesel-expense-void-preview.md)
//
// The previous version of this guard failed only when a Diesel expense had NO matching fuel row,
// so every matched pair passed — it protected the duplicate it was named after.
//
// SHRINK-ONLY RATCHET against scripts/verify-diesel-expense-fuel-dedupe.baseline.json:
//   doubled_with_live_fuel_twin  live Diesel expense whose invoice (a trailing "-L<load>" stripped on
//                                both sides) matches a live fuel row anywhere in USMCA, where BOTH
//                                copies post — the purchase is in the GL twice. A twin that exists
//                                but does not post is a WARN (void the expense only after re-posting it).
//   live_diesel_expenses         every live Diesel expense (no new ones may appear)
//   current > baseline -> FAIL (new double, or a new Diesel expense was written)
//   current <= baseline -> PASS; when lower, prints the tighter number to commit to the baseline
// Plus the prior regression lock: the two settlement-5782 rows stay voided with their disclosed reason.
//
// Fail-closed (ROUND 29.9-B): no DATABASE_URL, or no connection, is a FAIL. money-pr-local-gate.mjs
// runs it only when DATABASE_URL is set or the diff touches accounting/, fuel/ or db/migrations/.
// DIESEL_DEDUPE_BASELINE_PATH overrides the baseline location (red-run proof only).
import fs from "node:fs";
import path from "node:path";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

// REQUIRES_LIVE_DB (ruled 2026-09-23, docs/bus/INBOX-CC-1.md): excluded from verify-static.mjs's no-DB sweep;
// money-pr-local-gate.mjs runs it live and it fails closed there.
export const REQUIRES_LIVE_DB =
  "shrink-only ceilings on live Diesel expenses vs fuel.fuel_transactions, fails closed via requireLiveDbOrExit, cannot be exercised without a live Neon connection";

const LABEL = "verify-diesel-expense-fuel-dedupe";
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const BASELINE_PATH =
  process.env.DIESEL_DEDUPE_BASELINE_PATH || path.join(ROOT, "scripts/verify-diesel-expense-fuel-dedupe.baseline.json");
const VOID_REASON_5782 = "ABSORPTION-D5 duplicate or unmatched fuel row";
const KNOWN_VOIDED_5782_IDS = [
  "fc1e34b9-98a2-49cc-bfcb-febf2b67f678",
  "0154cb7e-6b14-4d97-9ebc-8b19268ad124",
];
const METRICS = ["doubled_with_live_fuel_twin", "live_diesel_expenses"];

// A posting is live only when all five hold: je.status='posted', je.voided_at, je.reversed_by_je_id,
// je.reverses_je_id and p.reversed_by_line_id all NULL (a JE-level reversal leaves the line fields NULL).
const LIVE_POSTING = (typeCol, idExpr) => `EXISTS (
    SELECT 1 FROM accounting.journal_entry_postings p
      JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid
     WHERE p.source_transaction_type = '${typeCol}' AND p.source_transaction_id::text = ${idExpr}
       AND je.status = 'posted' AND je.voided_at IS NULL AND je.reversed_by_je_id IS NULL
       AND je.reverses_je_id IS NULL AND p.reversed_by_line_id IS NULL)`;

// doubled       both copies post: the purchase is in the GL twice.
// twin_unposted a live fuel twin exists but only the expense posts — voiding the expense now would
//               drop the cost; the fuel row must be re-posted first (e.g. a row restored from archive).
const DIESEL_SQL = `
  WITH de AS (
    SELECT e.id, e.total_amount_cents, e.vendor_document_number, e.source_settlement_ref,
           NULLIF(regexp_replace(coalesce(e.vendor_document_number, ''), '-L[0-9]+$', ''), '') AS inv
      FROM accounting.expenses e
     WHERE e.operating_company_id = $1::uuid AND e.voided_at IS NULL AND e.memo ILIKE 'Diesel%'
  ), tw AS (
    SELECT de.*,
           bool_or(ft.id IS NOT NULL) AS has_twin,
           bool_or(ft.id IS NOT NULL AND ${LIVE_POSTING("fuel_event", "ft.id::text")}) AS twin_posts
      FROM de
      LEFT JOIN fuel.fuel_transactions ft
        ON ft.operating_company_id = $1::uuid AND ft.archived_at IS NULL
       AND de.inv IS NOT NULL AND de.inv <> 'no-invoice'
       AND regexp_replace(ft.transaction_reference, '-L[0-9]+$', '') = de.inv
     GROUP BY de.id, de.total_amount_cents, de.vendor_document_number, de.source_settlement_ref, de.inv
  )
  SELECT tw.id, tw.total_amount_cents, tw.vendor_document_number, tw.source_settlement_ref,
         (coalesce(tw.twin_posts, false) AND ${LIVE_POSTING("expense", "tw.id::text")}) AS doubled,
         (coalesce(tw.has_twin, false) AND NOT coalesce(tw.twin_posts, false)) AS twin_unposted
    FROM tw`;

function readBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) {
    console.error(`${LABEL}: FAIL — baseline not found at ${path.relative(ROOT, BASELINE_PATH)}`);
    process.exit(1);
  }
  const b = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
  for (const m of METRICS) {
    if (!Number.isInteger(b[m]) || b[m] < 0) {
      console.error(`${LABEL}: FAIL — baseline field ${m} missing or not a non-negative integer`);
      process.exit(1);
    }
  }
  return b;
}

async function live() {
  const baseline = readBaseline();
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    // One explicit transaction with a transaction-scoped bypass: Neon's pooled endpoint can split a
    // bare session-level set_config across backends (BANK-F30150).
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    let failures = 0;

    const rows = (await client.query(DIESEL_SQL, [USMCA_COMPANY_ID])).rows;
    const doubled = rows.filter((r) => r.doubled);
    const current = { doubled_with_live_fuel_twin: doubled.length, live_diesel_expenses: rows.length };
    const usd = (list) => (list.reduce((a, r) => a + Number(r.total_amount_cents), 0) / 100).toFixed(2);

    for (const m of METRICS) {
      if (current[m] > baseline[m]) {
        console.error(`${LABEL}: LIVE FAIL — ${m} grew: ${current[m]} > baseline ${baseline[m]}`);
        failures++;
      } else if (current[m] < baseline[m]) {
        console.log(`${LABEL}: ${m} shrank ${baseline[m]} -> ${current[m]}; commit ${current[m]} to ${path.relative(ROOT, BASELINE_PATH)}`);
      }
    }
    for (const r of rows.filter((x) => x.twin_unposted)) {
      console.warn(
        `${LABEL}: WARN — ${r.id} inv=${r.vendor_document_number} $${(Number(r.total_amount_cents) / 100).toFixed(2)} ` +
          `has a live fuel twin that does NOT post; re-post the fuel row before voiding this expense or the cost is lost`,
      );
    }
    if (current.doubled_with_live_fuel_twin > baseline.doubled_with_live_fuel_twin) {
      console.error(`  a Diesel expense beside its fuel row posts the same purchase twice — void it through voidDocument({ type: 'expense' }):`);
      for (const r of doubled.slice(0, 20)) {
        console.error(`  ✗ ${r.id} inv=${r.vendor_document_number} $${(Number(r.total_amount_cents) / 100).toFixed(2)} settlement=${r.source_settlement_ref}`);
      }
    }

    const knownRes = await client.query(
      `SELECT id, status, void_reason FROM accounting.expenses WHERE id = ANY($1::uuid[]) AND operating_company_id = $2::uuid`,
      [KNOWN_VOIDED_5782_IDS, USMCA_COMPANY_ID]
    );
    if (knownRes.rows.length !== KNOWN_VOIDED_5782_IDS.length) {
      console.error(`${LABEL}: LIVE FAIL — expected ${KNOWN_VOIDED_5782_IDS.length} known settlement-5782 rows, found ${knownRes.rows.length}`);
      failures++;
    }
    for (const r of knownRes.rows) {
      if (r.status !== "void" || r.void_reason !== VOID_REASON_5782) {
        console.error(`${LABEL}: LIVE FAIL — ${r.id} is not correctly voided (status=${r.status}, void_reason=${r.void_reason})`);
        failures++;
      }
    }

    await client.query("COMMIT");
    if (failures > 0) process.exit(1);
    console.log(
      `${LABEL}: LIVE PASS — ${current.doubled_with_live_fuel_twin} doubled ($${usd(doubled)}) <= baseline ` +
        `${baseline.doubled_with_live_fuel_twin}; ${current.live_diesel_expenses} live Diesel expenses ($${usd(rows)}) <= baseline ` +
        `${baseline.live_diesel_expenses}; 2/2 settlement-5782 rows voided.`
    );
  } finally {
    client.release();
    await pool.end();
  }
}

await live();

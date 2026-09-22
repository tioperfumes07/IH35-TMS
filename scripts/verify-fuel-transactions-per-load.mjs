#!/usr/bin/env node
// ROUND 23.3 (owner/Lead, 2026-09-13) — B1 "FUEL AS A REAL COST": live proof that
// the fuel-purchase absorption (scripts/ops/absorption-b1-fuel-ingest.mjs) actually
// landed and stays true. "one FUEL PURCHASES row -> one fuel.fuel_transactions row."
// Original target: 171 receipts / $110,072.33 across the 34 USMCA settlement documents.
//
// ROUND 30.6 (Lead ruling, 2026-09-23 00:35 CT, docs/bus/INBOX-CC-1.md): the hardcoded
// 171/$110,072.33 total was written before Dreamline, Relay, and the batch-2 AlwaysTrack
// settlement fuel rows landed — "it is measuring its own obsolescence, not a defect."
// Assertions 2 (exact row count) and its dollar total are now a SHRINK-ONLY four-arm ratchet
// against scripts/verify-fuel-transactions-per-load.baseline.json, same shape as the already-
// merged, already-proven verify-alwaystrack-parity.baseline.json:
//   no baseline / doesn't match hardcoded original    -> FAIL (first-run / no-baseline edge)
//   in baseline, live DIVERGES from it (either way)    -> FAIL — new, unreconciled drift; a
//                                                          human re-reconciles (like CC-3 did
//                                                          for the 625/$271,499.26 figure) and
//                                                          regenerates the baseline with a cited
//                                                          reason before this can pass again
//   in baseline, live MATCHES it exactly               -> PASS, printed as the known, reconciled
//                                                          total (not silent)
//   live returns to the ORIGINAL hardcoded 171/$110,072.33 exactly -> FAIL "remove me from the
//                                                          baseline" (a return to the pre-growth
//                                                          state is itself suspicious and worth a
//                                                          human look, not a silent pass)
// CARVE-OUT, explicit, permanent: assertion 3 (DEF exclusion) is NEVER baselined and NEVER
// widened — DEF rows counted as fuel is a live IFTA gallon-taxation defect (CC-3's lane,
// apps/backend/src/ifta/ifta-state-gallons-aggregator.ts summing DEF gallons as taxable highway
// fuel with no fuel_type filter), not drift. It stays a hard, unconditional FAIL exactly as
// written. Deliberately NO automated regenerate mode: unlike verify-alwaystrack-parity.mjs's
// mechanical per-document delta, updating this baseline means a human did a fresh reconciliation
// (as CC-3 and the Lead both did for 625/$271,499.26) — hand-edit
// scripts/verify-fuel-transactions-per-load.baseline.json's count/total_cents AND its
// `reconciliation` field together, every time, or the guard is lying about why the number moved.
//
// Checks, against the SAME ground-truth JSON the ingestion reads
// (data/alwaystrack/settlements-truth-2026-09-13.json):
//   1. Every fuel_purchases row across the 34 USMCA docs has a matching live
//      fuel.fuel_transactions row (by source_row_hash, reproduced from the pure
//      buildFuelRows() transform — not re-derived independently, so this guard
//      and the ingestion can never silently drift apart). UNCHANGED — this checks a subset
//      (the original 171 rows) that must remain present regardless of later growth.
//   2. Row count / dollar total — see the ratchet above.
//   3. DEF EXCLUSION — zero fuel_type='def' rows for this company. DEF is an
//      expense, never fuel; this table must never carry one. NEVER BASELINED.
//   4. The 5 disclosed data-quality flags (1 date correction + 4 cross-load
//      duplicate-invoice rows) are present and still flagged low-confidence —
//      proves the ingestion's disclosed corrections weren't silently dropped
//      or silently "cleaned up" by a later hand-edit. UNCHANGED.
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
const ORIGINAL_COUNT = 171;
const ORIGINAL_TOTAL_CENTS = 11007233; // $110,072.33 — the pre-Dreamline B1 target, kept only
// as the "now clean, remove me" comparison point (see the ratchet arm above), never the pass bar.
const TRUTH_JSON_PATH = path.join(
  process.cwd(),
  "data/alwaystrack/settlements-truth-2026-09-13.json"
);
const BASELINE_PATH = path.join(process.cwd(), "scripts/verify-fuel-transactions-per-load.baseline.json");

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return null;
  return JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
}

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

    // ROUND-30.4 (CC-3, PR #22176) introduced a gross_cost/total_cost fallback + a cohort-scoped,
    // $25-tolerance version of assertion 2 below. SUPERSEDED by the Lead's ROUND-30.6 ruling
    // (docs/bus/INBOX-CC-1.md, 2026-09-23 00:35 CT): "it is measuring its own obsolescence, not a
    // defect" — the fix is the shrink-only whole-table ratchet below, not a narrower cohort + a
    // tolerance. gross_cost is not read by this guard; total_cost (the column that has always
    // existed, no fresh-CI-DB fallback needed) is authoritative for the ratchet.
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
    // ROUND 30.6 bug fix: this query never filtered archived_at IS NULL — 2 archived/voided rows
    // ($807.03 total) were silently counted as live, live-measured as the exact cause of a
    // 625-vs-627 / $271,499.26-vs-$272,306.29 discrepancy against CC-3's and the Lead's own
    // independently-reconciled figures. Every other live-row read in this codebase excludes
    // archived rows by convention; this one had drifted.
    const liveRes = await client.query(
      `SELECT source_row_hash, total_cost, fuel_type FROM fuel.fuel_transactions
        WHERE operating_company_id = $1::uuid AND archived_at IS NULL`,
      [USMCA_COMPANY_ID]
    );
    if (liveRes.rows.length === 0) {
      console.error(`${LABEL}: LIVE FAIL — 0 live fuel.fuel_transactions rows for USMCA; completeness discriminator says this is an instrument problem, not a real zero — re-run before trusting this`);
      process.exit(1);
    }
    const liveHashes = new Set(liveRes.rows.map((r) => r.source_row_hash));
    // ROUND 30.6 finding: fixing the archived_at filter above (for the count/total ratchet)
    // correctly surfaced that 2 of the original 171 rows are now archived — NOT a silent drop:
    // both carry a real void note citing an owner ruling (settlement 5796 stands exactly as
    // printed; the row came from a stale duplicate PDF, see docs/bus/OUTBOX-CC-3.md). This
    // assertion's own purpose is catching SILENT drops, not forbidding a documented void — a row
    // found archived WITH a real reason in its notes counts as accounted-for, same as live.
    const archivedWithReasonRes = await client.query(
      `SELECT source_row_hash FROM fuel.fuel_transactions
        WHERE operating_company_id = $1::uuid AND archived_at IS NOT NULL
          AND notes IS NOT NULL AND notes !~ '^\\s*$'`,
      [USMCA_COMPANY_ID]
    );
    const documentedVoidHashes = new Set(archivedWithReasonRes.rows.map((r) => r.source_row_hash));
    const missing = expectedRows.filter((r) => !liveHashes.has(r.hash) && !documentedVoidHashes.has(r.hash));
    if (missing.length > 0) {
      console.error(`${LABEL}: LIVE FAIL — ${missing.length} of ${expectedRows.length} expected fuel_purchases rows have NO matching fuel.fuel_transactions row (live or documented-voided):`);
      for (const r of missing.slice(0, 20)) {
        console.error(`  ✗ doc ${r.settlement_no} load ${r.load_number} invoice=${r.invoice} amount=$${r.amount}`);
      }
      failures++;
    }

    // 2. row count / dollar total — shrink-only four-arm ratchet against
    // scripts/verify-fuel-transactions-per-load.baseline.json (Lead ruling, ROUND 30.6). See the
    // file header for the full rationale; this is deliberately NOT the old exact-match-171 check.
    const liveCount = liveRes.rows.length;
    const liveCents = liveRes.rows.reduce((s, r) => s + Math.round(Number(r.total_cost) * 100), 0);
    const baseline = loadBaseline();
    if (!baseline) {
      if (liveCount === ORIGINAL_COUNT && liveCents === ORIGINAL_TOTAL_CENTS) {
        // No baseline yet AND live still matches the original B1 target exactly — the pre-ratchet
        // state, nothing to ratchet. Falls through to PASS below.
      } else {
        console.error(
          `${LABEL}: LIVE FAIL — no baseline file (${path.basename(BASELINE_PATH)}) and live ` +
            `(${liveCount}/${(liveCents / 100).toFixed(2)}) does not match the original B1 target ` +
            `(${ORIGINAL_COUNT}/${(ORIGINAL_TOTAL_CENTS / 100).toFixed(2)}) — a reconciled baseline ` +
            `must exist before this guard can pass on a grown total.`
        );
        failures++;
      }
    } else if (liveCount === ORIGINAL_COUNT && liveCents === ORIGINAL_TOTAL_CENTS) {
      console.error(
        `${LABEL}: LIVE FAIL — live (${liveCount}/${(liveCents / 100).toFixed(2)}) has returned to the ` +
          `ORIGINAL pre-growth B1 target exactly, but a baseline for ${baseline.count}/` +
          `${(baseline.total_cents / 100).toFixed(2)} still exists — remove ${path.basename(BASELINE_PATH)} ` +
          `(a return to the pre-Dreamline state is itself suspicious and worth a human look, not a silent pass).`
      );
      failures++;
    } else if (liveCount !== baseline.count || liveCents !== baseline.total_cents) {
      console.error(
        `${LABEL}: LIVE FAIL — live (${liveCount} rows / $${(liveCents / 100).toFixed(2)}) diverges from ` +
          `the reconciled baseline (${baseline.count} rows / $${(baseline.total_cents / 100).toFixed(2)}, ` +
          `established ${baseline.established}). New, unreconciled drift either way (grew or shrank) — a ` +
          `human re-reconciles (see the baseline file's own 'reconciliation' field for the last one CC-3 ` +
          `and the Lead did) and regenerates the baseline with a cited reason before this can pass again.`
      );
      failures++;
    } else {
      console.log(
        `${LABEL}: known, reconciled total — ${liveCount} rows / $${(liveCents / 100).toFixed(2)} ` +
          `(baseline established ${baseline.established}; see the baseline file for CC-3's/the Lead's ` +
          `reconciliation of the delta vs the original B1 target).`
      );
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

    await client.query("COMMIT");
    if (failures > 0) process.exit(1);
    console.log(
      `${LABEL}: LIVE PASS — ${liveCount} fuel_transactions rows / $${(liveCents / 100).toFixed(2)} ` +
        `(original B1 target ${ORIGINAL_COUNT}/$${(ORIGINAL_TOTAL_CENTS / 100).toFixed(2)}; ` +
        `${baseline ? `reconciled baseline ${baseline.count}/$${(baseline.total_cents / 100).toFixed(2)} holds` : "no growth beyond original target"}), ` +
        `0 DEF rows, ${expectedLowConfHashes.size} disclosed low-confidence rows intact.`
    );
  } finally {
    await client.end();
  }
}

await live();

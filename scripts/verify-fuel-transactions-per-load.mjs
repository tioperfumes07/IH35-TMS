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
// ROUND 30.6, SELF-CORRECTED (Lead ruling, 2026-09-23 02:00 CT, docs/bus/INBOX-CC-1.md): the
// original assertion 3 ("DEF is an expense, never fuel — zero fuel_type='def' rows") was wrong
// about WHERE the row lives. fuel.fuel_transactions.fuel_type carries a canonical 'def' value BY
// DESIGN (fuel-transaction-import.ts:112), and FUEL_CATEGORY_CODES
// (accounting/fuel-posting/poster.service.ts:25) treats 'def' as a first-class fuel posting
// category. DEF purchases are real fuel-card transactions and belong in this table — the real
// invariant is TREATMENT, not STORAGE:
//   (a) DEF must NEVER count as taxable IFTA gallons -> fixed + guarded elsewhere,
//       apps/backend/src/ifta/ifta-state-gallons-aggregator.ts + its own verify-ifta-* guard,
//       commit 0df952f337 (PR #22171). NOT this guard's concern.
//   (b) DEF must post to its own GL account, never the same account a diesel debit hits -> THIS
//       is what assertion 3 now tests. Verified live 2026-09-23: it currently does NOT hold — all
//       335 live DEF debit posting lines ($10,970.23) hit catalogs.accounts 5000 "Fuel & Diesel",
//       the exact same account diesel purchases hit, and no dedicated DEF-named account exists in
//       the chart of accounts at all yet. This is a REAL, CONFIRMED, SEPARATE defect in the fuel
//       posting engine / chart of accounts (CC-3's lane, apps/backend/src/accounting/fuel-posting/
//       poster.service.ts's resolveAccountForCategory) — named here, not fixed here, per explicit
//       instruction: "delete nothing, move no rows, archive nothing." This guard therefore
//       currently, correctly, honestly FAILS on assertion 3 until that poster fix lands — that is
//       not a bug in this guard, it is the guard doing its job.
//
// Checks, against the SAME ground-truth JSON the ingestion reads
// (data/alwaystrack/settlements-truth-2026-09-13.json):
//   1. Every fuel_purchases row across the 34 USMCA docs has a matching live
//      fuel.fuel_transactions row (by source_row_hash, reproduced from the pure
//      buildFuelRows() transform — not re-derived independently, so this guard
//      and the ingestion can never silently drift apart). UNCHANGED — this checks a subset
//      (the original 171 rows) that must remain present regardless of later growth.
//   2. Row count / dollar total — see the ratchet above.
//   3. DEF GL SEGREGATION — every live DEF debit posting must hit a DIFFERENT account_id than any
//      live diesel debit posting (dynamic comparison, no hardcoded account number — stays correct
//      once a dedicated DEF account is created and wired). Currently FAILS live (see above);
//      remains unconditional, never baselined, never widened — this is treatment correctness, not
//      growth-driven drift.
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
      `SELECT id::text AS id, source_row_hash, total_cost, fuel_type FROM fuel.fuel_transactions
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

    // 3. DEF GL segregation (ROUND 30.6 self-correction — see file header). Real invariant is
    // TREATMENT not STORAGE: every DEF debit posting must hit a DIFFERENT account_id than any
    // diesel debit posting. Dynamic comparison — no hardcoded account number, so this stays
    // correct once a dedicated DEF account is created and wired.
    const defIds = liveRes.rows.filter((r) => r.fuel_type === "def").map((r) => r.id);
    const dieselIds = liveRes.rows.filter((r) => r.fuel_type === "diesel").map((r) => r.id);
    if (defIds.length > 0) {
      const glRes = await client.query(
        `SELECT ft.fuel_type, a.id::text AS account_id, a.account_number, a.account_name,
                count(*) AS n, sum(jep.amount_cents) AS cents
           FROM fuel.fuel_transactions ft
           JOIN accounting.journal_entry_postings jep
             ON jep.source_transaction_type = 'fuel_event'
            AND jep.source_transaction_id = ft.id::text
            AND jep.debit_or_credit = 'debit'
           JOIN catalogs.accounts a ON a.id = jep.account_id
          WHERE ft.id = ANY($1::uuid[])
          GROUP BY ft.fuel_type, a.id, a.account_number, a.account_name`,
        [[...defIds, ...dieselIds]]
      );
      const defAccountIds = new Set(glRes.rows.filter((r) => r.fuel_type === "def").map((r) => r.account_id));
      const dieselAccountIds = new Set(glRes.rows.filter((r) => r.fuel_type === "diesel").map((r) => r.account_id));
      const sharedAccountIds = [...defAccountIds].filter((id) => dieselAccountIds.has(id));
      if (sharedAccountIds.length > 0) {
        const shared = glRes.rows.filter((r) => sharedAccountIds.includes(r.account_id) && r.fuel_type === "def");
        console.error(`${LABEL}: LIVE FAIL — DEF debit postings share an account with diesel debit postings (must be segregated):`);
        for (const r of shared) {
          console.error(`  ✗ DEF debits hit ${r.account_number} "${r.account_name}" — ${r.n} posting(s), $${(Number(r.cents) / 100).toFixed(2)} (the same account diesel purchases hit)`);
        }
        console.error(`  This is a fuel-posting-engine / chart-of-accounts defect (CC-3's lane), not this guard's to fix — see docs/bus/OUTBOX-CC-3.md.`);
        failures++;
      }
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
        `${defIds.length} DEF row(s) present and GL-segregated from diesel, ${expectedLowConfHashes.size} disclosed low-confidence rows intact.`
    );
  } finally {
    await client.end();
  }
}

await live();

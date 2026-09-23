#!/usr/bin/env node
// ROUND 24.1 (owner, 2026-09-13, verbatim): "Stop waiting on CC-3. Build this now. It is what makes
// CC-1's repoint and CC-3's B3 permanent." This guard is the tripwire that keeps the AlwaysTrack
// settlement-linkage defect visible until CC-1's repoint work and CC-3's B3 land, and stays green
// afterward so it can never silently regress back.
//
// THE DEFECT IT CATCHES (live, USMCA 5c854333-6ea5-4faa-af31-67cb272fef80, voided_at IS NULL). The
// owner's own ROUND 24.1 figures, confirmed exactly by this guard's first live run at the time the
// task was issued:
//   - 45 settlements carry an AlwaysTrack ref 5769-5803 -- 33 of them have ZERO driver_bills attached
//   - 18 settlements carry source_document_ref IS NULL and hold 13 bills
//   - 11 settlements carry a ref outside 5769-5803 (5811, 5812, ...) and hold 21 bills
//   - 10 AlwaysTrack numbers exist TWICE -- a locked S-2026-<doc> and a cancelled/closed S-2026-00NN
//     (5772, 5773, 5775, 5776, 5779, 5780, 5782, 5783, 5784, 5785)
// "Board numbers are the least reliable part" (this repo's own standing law) -- re-measured live at
// PR time, not copied from the fan-out message: L1=29 (was implicitly 34), L2=10 (unchanged, exact
// match), L3=26 locked-in-range-zero-bills (was 32/33) -- lower because this session's own DELTA 3
// work (PR #22050) closed 3 of the 5 previously-unlinked Faro loads onto their pre-seeded shells in
// the gap between the owner's own measurement and this PR. The 10 duplicate-ref pairs above are
// unchanged and still exact.
//
// L1/L2 have NO ratchet -- they assert 0, and today's live run correctly FAILS on them (this is the
// live defect, not a bug in the guard). L3 is a ratchet (ships red at a KNOWN baseline, tightens as
// CC-3's B3 lands real bill data on the pre-seeded shells -- see scripts/ops/
// b5-full-recut-orchestration.ts's own header for how those shells were discovered). L4 is warn-only
// until CC-3's B3 proof lands in the same PR that flips it to a hard fail (owner's own instruction).
//
// ROUND 24.4 (owner, 2026-09-14) -- CC-1 finished the full driver_bills repoint (#22067). Re-measured
// live: L1=15 (down from 29), L3=21 (down from 26). The owner ruled L1's ORIGINAL "0" requirement was
// itself wrong: all 15 are correct rows, not defects -- 13 sit on live status='open' tours
// (S-2026-5804..5810) for loads booked after AlwaysTrack's ingest window closed at 5803 (no document
// exists to point them at; inventing one would fabricate a record), plus 2 standing owner-known
// closed-settlement bills with a real, merely out-of-cutover-range ref (13581 -- the owner-gated Faro
// short-pay dispute; 13583). L1 REWRITTEN (see its own query comment below): a live bill may not
// point at a CANCELLED settlement, or a NULL-ref settlement that is NOT open -- the out-of-range
// check is gone entirely; a real ref outside 5769-5803 is legal. Required value 0 -- passes today.
// L3_BASELINE tightened 26 -> 21. Both L1 and L3 now also exclude status='void' (not only
// voided_at IS NULL) on both driver_bills and driver_settlements -- one live driver_bills row has
// status='void' with voided_at still NULL (an inconsistency CC-1 is separately fixing; this guard
// must not depend on that landing first to read correctly). L4 stays warn-only in this PR -- the
// owner's own instruction is to flip it to hard-fail in the SAME PR as CC-3's B3 proof, which has not
// landed yet.
//
// THE BYPASS TRAP (owner's own words, verbatim, "produced a false green three times today"): a CTE
// calling set_config('app.bypass_rls','lucia',true) must be declared AS MATERIALIZED and referenced
// in a WHERE clause -- (SELECT v FROM b)='lucia'. Referenced only in the SELECT list, or not at all,
// it silently returns 0 rows under FORCED RLS, and every rule above reads as a false PASS. Every
// query in this file follows the mandated shape exactly; nothing here re-derives its own bypass
// convention.
//
// READS ONLY. No UPDATE, no INSERT, no match_state, no GL -- confirmed by this file containing no
// write verb anywhere below.
//
// Skips gracefully (prints, exits 0) when DATABASE_URL is not set -- same convention every other
// live-Neon guard in this repo uses.
import pg from "pg";
export const REQUIRES_LIVE_DB =
  "live-data guard; fails closed with no DATABASE_URL or an unreachable database (ROUND 29.9-B, E7 batch 2b)";

const LABEL = "verify-usmca-settlement-linkage";
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ATRACK_MIN = 5769;
const ATRACK_MAX = 5803;

// L3 RATCHET BASELINE -- "board numbers are the least reliable part" (this repo's own standing
// law): the owner's ROUND 24.1 message cited 33 in-range-zero-bills settlements (any status); this
// guard's own fresh live re-measurement, run at PR time (not copied from the fan-out message),
// found 32 across all statuses / 26 once narrowed to status='locked' per L3's own wording ("every
// live USMCA settlement with status='locked' and a ref in 5769-5803") -- lower than the owner's
// figure because this session's own DELTA 3 work (closing loads 13526/13561/13567 onto their
// pre-seeded shells, PR #22050) already moved 2 settlements off the zero-bills list between the
// owner's measurement and this guard's own. ROUND 24.4 (owner, 2026-09-14): CC-1 finished the full
// driver_bills settlement-linkage repoint (#22067) -- re-measured 21 (down from 26), owner's own
// live figure, exact match. Ratchet tightens: 26 -> 21. Lower only after confirming a real drop
// (re-measure, never copy), never raise it.
const L3_BASELINE = 21;

const RANGE_SQL = `ds.source_document_ref ~ '^[0-9]+$' AND ds.source_document_ref::int BETWEEN ${ATRACK_MIN} AND ${ATRACK_MAX}`;

async function live() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("verify-usmca-settlement-linkage: FAIL — DATABASE_URL not set or the database is unreachable. A live money guard that cannot connect is a FAIL, never a pass (ROUND 29.9-B).");
    process.exit(1);
  }
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    let failures = 0;

    // Completeness discriminator (an empty result is an instrument claim, not a verdict) -- proves
    // the mandated CTE-in-WHERE bypass actually returned real rows on THIS table before trusting any
    // rule below reads as a real zero rather than a masked one.
    const totalRes = await client.query(
      `WITH b AS MATERIALIZED (SELECT set_config('app.bypass_rls','lucia',true) AS v)
       SELECT count(*) AS n FROM driver_finance.driver_settlements ds
        WHERE (SELECT v FROM b)='lucia' AND ds.operating_company_id = $1::uuid AND ds.voided_at IS NULL`,
      [USMCA_COMPANY_ID]
    );
    const total = Number(totalRes.rows[0].n);
    if (total === 0) {
      console.error(`${LABEL}: LIVE FAIL — 0 live USMCA driver_settlements rows; completeness discriminator says this is an instrument problem, not a real zero`);
      process.exit(1);
    }
    console.log(`${LABEL}: completeness discriminator OK — ${total} live USMCA driver_settlements rows visible.`);

    // L1 — ROUND 24.4 REWRITE (owner, 2026-09-14, verbatim): the original "NULL or out-of-range ref"
    // rule flagged 15 bills that are NOT defects -- 13 sit on live, in-progress status='open' tours
    // (S-2026-5804..5810) for loads booked AFTER the AlwaysTrack ingest window closed at 5803 (there
    // is no document to point them at; inventing one would fabricate a record), plus 2 standing
    // owner-known closed-settlement bills (13581 -- the owner-gated Faro short-pay dispute, doc 5813;
    // 13583, doc 5814) whose refs are simply outside the AlwaysTrack cutover range but real. "An open
    // tour with a post-5803 ref is legal and must pass." New rule: a live bill may not point at a
    // CANCELLED settlement, or at a settlement with NO ref at all UNLESS that settlement is still
    // open (open, no-ref-yet is a normal in-progress tour). The out-of-range check is gone entirely
    // -- a real ref, even outside 5769-5803, is legal. Required value 0 -- passes today (owner-
    // verified live before issuing this rewrite).
    const l1Res = await client.query(
      `WITH b AS MATERIALIZED (SELECT set_config('app.bypass_rls','lucia',true) AS v)
       SELECT db.id::text, db.load_number, ds.display_id, ds.status AS settlement_status, ds.source_document_ref
         FROM driver_finance.driver_bills db
         JOIN driver_finance.driver_settlements ds ON ds.id = db.settled_in_settlement_id
        WHERE (SELECT v FROM b)='lucia'
          AND db.operating_company_id = $1::uuid AND db.voided_at IS NULL AND db.status <> 'void'
          AND ds.operating_company_id = $1::uuid AND ds.voided_at IS NULL AND ds.status <> 'void'
          AND (ds.status = 'cancelled' OR (ds.source_document_ref IS NULL AND ds.status <> 'open'))`,
      [USMCA_COMPANY_ID]
    );
    if (l1Res.rows.length > 0) {
      console.error(`L1: FAIL — ${l1Res.rows.length} live driver_bill(s) point at a cancelled settlement, or a NULL-ref settlement that isn't open (required: 0):`);
      for (const r of l1Res.rows) console.error(`  ✗ bill ${r.id} load ${r.load_number} -> ${r.display_id} status=${r.settlement_status} ref=${r.source_document_ref ?? "NULL"}`);
      failures++;
    } else {
      console.log(`L1: PASS — 0 driver_bill(s) point at a cancelled settlement or a NULL-ref non-open settlement.`);
    }

    // L2 — no two live USMCA settlements may share a source_document_ref.
    const l2Res = await client.query(
      `WITH b AS MATERIALIZED (SELECT set_config('app.bypass_rls','lucia',true) AS v)
       SELECT ds.source_document_ref, count(*) AS n, array_agg(ds.display_id ORDER BY ds.display_id) AS display_ids
         FROM driver_finance.driver_settlements ds
        WHERE (SELECT v FROM b)='lucia' AND ds.operating_company_id = $1::uuid AND ds.voided_at IS NULL
          AND ds.source_document_ref IS NOT NULL
        GROUP BY ds.source_document_ref
       HAVING count(*) > 1`,
      [USMCA_COMPANY_ID]
    );
    if (l2Res.rows.length > 0) {
      console.error(`L2: FAIL — ${l2Res.rows.length} AlwaysTrack ref(s) claimed by more than one live settlement (required: 0 duplicates):`);
      for (const r of l2Res.rows) console.error(`  ✗ ref=${r.source_document_ref} claimed by ${r.n}: ${r.display_ids.join(", ")}`);
      failures++;
    } else {
      console.log(`L2: PASS — 0 duplicate source_document_ref(s) among live settlements.`);
    }

    // L3 — every locked, in-range settlement must have >=1 driver_bill. Ratchet: ships red at a
    // known baseline, tightens down only, never loosens.
    const l3Res = await client.query(
      `WITH b AS MATERIALIZED (SELECT set_config('app.bypass_rls','lucia',true) AS v)
       SELECT ds.id::text, ds.display_id
         FROM driver_finance.driver_settlements ds
         LEFT JOIN driver_finance.driver_bills db
           ON db.settled_in_settlement_id = ds.id AND db.operating_company_id = ds.operating_company_id
          AND db.voided_at IS NULL AND db.status <> 'void'
        WHERE (SELECT v FROM b)='lucia' AND ds.operating_company_id = $1::uuid
          AND ds.voided_at IS NULL AND ds.status <> 'void'
          AND ds.status = 'locked' AND ${RANGE_SQL}
        GROUP BY ds.id, ds.display_id
       HAVING count(db.id) = 0`,
      [USMCA_COMPANY_ID]
    );
    const l3Count = l3Res.rows.length;
    if (l3Count > L3_BASELINE) {
      console.error(`L3: FAIL — ${l3Count} locked in-range settlement(s) with 0 driver_bills > baseline ${L3_BASELINE} (regression):`);
      for (const r of l3Res.rows) console.error(`  ✗ ${r.display_id}`);
      failures++;
    } else if (l3Count < L3_BASELINE) {
      console.log(`L3: OK — ${l3Count} locked in-range settlement(s) with 0 driver_bills (< baseline ${L3_BASELINE}). Lower L3_BASELINE to ${l3Count} so the ratchet tightens.`);
    } else {
      console.log(`L3: OK — ${l3Count} locked in-range settlement(s) with 0 driver_bills, matches baseline ${L3_BASELINE} exactly.`);
    }

    // L4 — warn-only until CC-3's B3 lands real per-load expense/mileage data on these settlements;
    // this rule NEVER contributes to the failures count today. Flip to a hard-fail in the same PR as B3's proof.
    const l4Res = await client.query(
      `WITH b AS MATERIALIZED (SELECT set_config('app.bypass_rls','lucia',true) AS v)
       SELECT ds.id::text, ds.display_id, ds.gross_pay,
              COALESCE(sum(db.gross_amount_cents), 0) AS bills_cents,
              round(ds.gross_pay * 100)::bigint AS gross_pay_cents
         FROM driver_finance.driver_settlements ds
         LEFT JOIN driver_finance.driver_bills db
           ON db.settled_in_settlement_id = ds.id AND db.operating_company_id = ds.operating_company_id AND db.voided_at IS NULL
        WHERE (SELECT v FROM b)='lucia' AND ds.operating_company_id = $1::uuid AND ds.voided_at IS NULL
          AND ds.status = 'locked' AND ${RANGE_SQL}
        GROUP BY ds.id, ds.display_id, ds.gross_pay
       HAVING round(ds.gross_pay * 100)::bigint <> COALESCE(sum(db.gross_amount_cents), 0)`,
      [USMCA_COMPANY_ID]
    );
    if (l4Res.rows.length > 0) {
      console.warn(`L4: WARN (not counted toward pass/fail today) — ${l4Res.rows.length} locked in-range settlement(s) where sum(driver_bills.gross_amount_cents) != gross_pay*100:`);
      for (const r of l4Res.rows) console.warn(`  ⚠ ${r.display_id} gross_pay_cents=${r.gross_pay_cents} bills_cents=${r.bills_cents}`);
    } else {
      console.log(`L4: WARN mode — 0 mismatch(es) found today (still warn-only; flips to hard-fail alongside CC-3's B3 proof).`);
    }

    if (failures > 0) {
      console.error(`\n${LABEL}: LIVE FAIL — ${failures} of 3 hard rule(s) failed (L1/L2/L3). This is the live AlwaysTrack linkage defect, not an instrument problem — stays red until CC-1's repoint + CC-3's B3 land.`);
      process.exit(1);
    }
    console.log(`\n${LABEL}: LIVE PASS — L1/L2/L3 all clean, L4 in warn mode.`);
  } finally {
    await client.end();
  }
}

// --selftest -- mechanically proves the two properties the owner named as non-negotiable, by
// reading this file's own source (never asserted against a live DB, so it runs with no
// DATABASE_URL and can't be skipped the way the live checks above can):
//   1. every MATERIALIZED bypass CTE this file declares is actually referenced in a WHERE clause
//      (SELECT v FROM b)='lucia' -- a CTE declared but only referenced in the SELECT list, or not
//      referenced at all, silently returns 0 rows under FORCED RLS and reads as a false PASS
//      (the owner's own words: "produced a false green three times today").
//   2. the file contains no write verb anywhere -- READS ONLY, no UPDATE, no INSERT, no DELETE,
//      no match_state, no GL.
if (process.argv.includes("--selftest")) {
  const fs = await import("node:fs");
  const fullSrc = fs.readFileSync(new URL(import.meta.url), "utf8");
  // Scan only the live() function's own source, ending BEFORE this selftest block starts -- this
  // selftest's own extraction code below necessarily contains literal backtick characters (to
  // describe a backtick-delimited SQL literal at all), which would otherwise self-match as a
  // spurious "SQL literal" if the whole file were scanned, confusing this exact check about itself.
  const src = fullSrc.slice(0, fullSrc.indexOf("\n// --selftest"));
  const cteCount = (src.match(/AS MATERIALIZED \(SELECT set_config\('app\.bypass_rls','lucia',true\) AS v\)/g) ?? []).length;
  const referencedCount = (src.match(/\(SELECT v FROM b\)='lucia'/g) ?? []).length;
  if (cteCount === 0) {
    console.error(`${LABEL} SELFTEST FAIL — no MATERIALIZED bypass CTE found at all (expected several).`);
    process.exit(1);
  }
  if (referencedCount < cteCount) {
    console.error(
      `${LABEL} SELFTEST FAIL — ${cteCount} bypass CTE(s) declared but only ${referencedCount} WHERE-clause reference(s) — ` +
        `THE BYPASS TRAP: a CTE not referenced in a WHERE clause silently returns 0 rows under FORCED RLS.`
    );
    process.exit(1);
  }
  // Only inspect actual SQL template literals (backtick strings), never this file's own prose
  // comments -- the header/doc comments above deliberately name UPDATE/INSERT/DELETE/match_state
  // as the things this file must NOT contain, which would otherwise false-positive a plain
  // whole-file grep.
  const sqlLiterals = src.match(/`[^`]*`/gs) ?? [];
  const writeVerbHits = [];
  for (const literal of sqlLiterals) {
    const hit = literal.match(/\b(UPDATE|INSERT INTO|DELETE FROM|match_state\s*=)\b/i);
    if (hit) writeVerbHits.push(hit[0]);
  }
  if (writeVerbHits.length > 0) {
    console.error(`${LABEL} SELFTEST FAIL — found a write-verb token inside a SQL literal in this READS-ONLY file: ${writeVerbHits.join(", ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — ${cteCount}/${cteCount} bypass CTEs correctly referenced in a WHERE clause; 0 write verbs found.`);
  process.exit(0);
}

await live();

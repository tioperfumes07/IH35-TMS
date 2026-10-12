#!/usr/bin/env node
// ROUND 23.2 B4/B5 (ACCT-F26307) — for every USMCA settlement, net_pay must equal the signed
// AlwaysTrack document's TOTAL DUE to the cent, and (ROUND 326 item 18, superseding B5) every settlement
// is posted exactly once through the close engine (closeSettlementPayRun / driver_finance.payrun_gl_runs).
//
// GROUND TRUTH: data/alwaystrack/settlements-truth-2026-09-13.json (self-validating parse of the
// 44 signed AlwaysTrack documents, L5). Never re-parsed here — read as committed.
//
// ROOT CAUSE this guard locks down (live-verified 2026-09-13, USMCA): both settlement GL posters
// (settlement-payrun-close.service.ts's closeSettlementPayRun AND settlement-posting/
// settlement-bill-payment-posting.service.ts's postSettlementBillPayment) compute gross/deductions/
// reimbursements/net correctly and post a fully-balanced JE reflecting them, but neither wrote those
// numbers back onto driver_finance.driver_settlements' own gross_pay/deductions_total/
// reimbursements_total/net_pay columns — the fields every report and the owner's own live reads
// actually show. Measured: 33 of 36 posted USMCA settlements carried a header net_pay that
// disagreed with their own already-correct, signed-document-matching journal entry (the JE was never
// wrong; the header display field was simply never synced). Both posters now write the header in
// the same transaction they post in (this fix); apps/backend/scripts/
// r232-backfill-settlement-header-from-posted-je.mts is the one-time, JE-derived, no-new-GL-write
// correction for settlements posted before the fix landed.
//
// Usage: DATABASE_URL=<prod or rehearse branch> node scripts/verify-settlement-net-matches-signed-doc.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createRequire } from "node:module";
// 443.99: TLS by host (localhost / CI postgres service = off, Neon = on) — a hard-coded ssl option cannot connect to CI's local postgres.
const { inferPgSslOption } = createRequire(import.meta.url)("./lib/pg-connection-options.cjs");
export const REQUIRES_LIVE_DB =
  "live-data guard; fails closed with no DATABASE_URL or an unreachable database (ROUND 29.9-B, E7 batch 2b)";

const LABEL = "verify-settlement-net-matches-signed-doc";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TRUTH_PATH = path.join(ROOT, "data/alwaystrack/settlements-truth-2026-09-13.json");
const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80"; // USMCA
// STANDING CORRECTION (owner, 2026-09-13, GO 2): both governing round-23.2 docs originally said "34
// USMCA settlements, 5769 through 5803" -- that range is actually 35 numbers inclusive
// (5803-5769+1). Root cause: the docs counted COMPANY-side settlement PDFs (34 of them), not driver-
// side ones -- document 5782 has a driver settlement but no company settlement, so DRIVER documents
// = 35, COMPANY documents = 34. This guard reads driver_finance.driver_settlements (driver-side), so
// 35 is the correct count HERE. A guard counting company-side line-haul/fuel/expense documents
// correctly asserts 34 instead -- state which set an assertion uses, do not assume they're the same
// number. Verified: all 35 driver documents exist as distinct entries in the truth file and their
// total_due values sum to exactly $49,297.42, the same target both docs cite.
// LEAD RULINGS 443.43 / 443.50 (2026-10-11, measured prod): documents 5770 (loads 13503/13509) and 5796 (load 13541) are
// IH35 TRANSPORTATION settlements, "not USMCA entries" — their old USMCA rows were purged under AUTH-400
// (audit.record_deletions) and they are never re-entered in USMCA. They leave the USMCA set and are asserted ABSENT from
// USMCA instead (a live USMCA row for either fails). 35 driver documents - 2 = 33; sum 49,297.42 - 1,997.50 - 379.73.
export const NOT_USMCA_DOCS = Object.freeze(["5770", "5796"]);
const USMCA_CUTOVER_DOCS = Array.from({ length: 35 }, (_, i) => String(5769 + i)).filter((d) => !NOT_USMCA_DOCS.includes(d)); // 5769..5803 less the 2
const USMCA_DOC_COUNT = 33;
const USMCA_TARGET_SUM = 46920.19;

// The known duplicate mega-row for tour 5782 (CC-2's B5 1:1 re-cut territory, not this guard's job)
// — see r232-backfill-settlement-header-from-posted-je.mts's own header comment for the live-verified
// anomaly this display_id names.
const KNOWN_DUPLICATE_EXEMPT = new Set(["S-2026-0011"]);

function loadSignedTotals() {
  const raw = JSON.parse(fs.readFileSync(TRUTH_PATH, "utf8"));
  const byDoc = new Map();
  for (const d of raw.driver ?? []) {
    if (d.settlement_no && typeof d.total_due === "number") byDoc.set(d.settlement_no, d.total_due);
  }
  return byDoc;
}

/** Per-document verdict over the live rows (pure — --selftest feeds it synthetic rows). */
export function judgeSettlements(usmcaDocs, truth, liveRows) {
  const byDocRows = new Map();
  for (const row of liveRows) {
    if (!byDocRows.has(row.source_document_ref)) byDocRows.set(row.source_document_ref, []);
    byDocRows.get(row.source_document_ref).push(row);
  }

  const lines = [];
  const failures = [];
  for (const doc of usmcaDocs) {
    const target = truth.get(doc);
    const rows = (byDocRows.get(doc) ?? []).filter((r) => !KNOWN_DUPLICATE_EXEMPT.has(r.display_id));
    if (rows.length === 0) {
      failures.push(`${doc}: NO live settlement row found (target TOTAL DUE ${target.toFixed(2)})`);
      lines.push(`${doc.padEnd(5)} MISSING          target=${target.toFixed(2).padStart(10)}`);
      continue;
    }
    if (rows.length > 1) {
      failures.push(
        `${doc}: ${rows.length} non-cancelled, non-exempt settlement rows exist (${rows
          .map((r) => r.display_id)
          .join(", ")}) — expected exactly 1 (1:1 re-cut, CC-2 B5); cannot assert a single net_pay`
      );
      lines.push(`${doc.padEnd(5)} DUPLICATE(${rows.length})   target=${target.toFixed(2).padStart(10)}`);
      continue;
    }
    const row = rows[0];
    const net = Number(row.net_pay);
    const ok = Math.abs(net - target) < 0.005;
    if (!ok) failures.push(`${doc} (${row.display_id}): net_pay ${net.toFixed(2)} != signed TOTAL DUE ${target.toFixed(2)}`);
    lines.push(
      `${doc.padEnd(5)} ${row.display_id.padEnd(16)} net=${net.toFixed(2).padStart(10)} signed=${target.toFixed(2).padStart(10)} ${ok ? "OK" : "FAIL"}`
    );
  }
  return { lines, failures };
}

/**
 * Posting mechanism. B5 (ROUND 23.2, 2026-09-13) required 0 closeSettlementPayRun postings; ROUND 326 item 18 (#24181,
 * 958d732399, owner: "the totals he verifies must come from the same code path the post writes — do not create a second
 * calculator") made the close engine THE settlement poster: the Settlement Creator previews and posts through
 * closeSettlementPayRun. The law this guard now holds: every USMCA document's settlement is posted EXACTLY ONCE through
 * the close engine — no settlement left unposted, none posted twice.
 */
export function payrunFailures(postedCloseRunsByDoc) {
  const failures = [];
  for (const [doc, n] of postedCloseRunsByDoc) {
    if (n !== 1) failures.push(`${doc}: ${n} posted close run(s) (driver_finance.payrun_gl_runs) — the settlement must be posted exactly once through the close engine (ROUND 326 item 18)`);
  }
  return failures;
}

/** 443.101: a Transportation document must never have a live USMCA settlement. */
export function notUsmcaFailures(rows) {
  return rows.map((r) => `${r.source_document_ref} (${r.display_id}): a live USMCA settlement exists for a Transportation document (LEAD 443.43/443.50: not a USMCA entry)`);
}

function selftest() {
  const truth = loadSignedTotals();
  const docs = USMCA_CUTOVER_DOCS.filter((d) => truth.has(d));
  const clean = docs.map((d, i) => ({ source_document_ref: d, display_id: `S-2026-${String(100 + i).padStart(4, "0")}`, status: "posted", net_pay: truth.get(d).toFixed(2) }));
  const off = (doc, delta) => clean.map((r) => (r.source_document_ref === doc ? { ...r, net_pay: (Number(r.net_pay) + delta).toFixed(2) } : r));
  const planted = [
    ["net_pay one cent high", judgeSettlements(docs, truth, off(docs[0], 0.01)).failures.length === 1],
    ["net_pay one cent low", judgeSettlements(docs, truth, off(docs[docs.length - 1], -0.01)).failures.length === 1],
    ["document with no live settlement", judgeSettlements(docs, truth, clean.filter((r) => r.source_document_ref !== docs[13])).failures.length === 1],
    ["two live settlements for one document", judgeSettlements(docs, truth, [...clean, { ...clean[5], display_id: "S-2026-9999" }]).failures.length === 1],
    ["settlement never posted through the close engine", payrunFailures(new Map([["5771", 0]])).length === 1],
    ["settlement posted twice through the close engine", payrunFailures(new Map([["5771", 2]])).length === 1],
    ["Transportation document 5770 live in USMCA", notUsmcaFailures([{ source_document_ref: "5770", display_id: "P-9999" }]).length === 1],
  ];
  const caught = planted.filter(([, ok]) => ok).length;
  for (const [name, ok] of planted) if (!ok) console.error(`${LABEL} SELFTEST: planted violation escaped — ${name}`);
  const cleanOk = docs.length === USMCA_CUTOVER_DOCS.length
    && judgeSettlements(docs, truth, clean).failures.length === 0
    // the named duplicate mega-row is exempt, so it must not turn a clean document red
    && judgeSettlements(docs, truth, [...clean, { ...clean[13], display_id: "S-2026-0011" }]).failures.length === 0
    && payrunFailures(new Map(docs.map((d) => [d, 1]))).length === 0
    && notUsmcaFailures([]).length === 0
    && !docs.includes("5770") && !docs.includes("5796") && docs.length === USMCA_DOC_COUNT;
  if (!cleanOk) console.error(`${LABEL} SELFTEST: clean input flagged`);
  console.log(`${LABEL} SELFTEST: ${caught}/${planted.length} planted violations caught`);
  process.exit(caught === planted.length && cleanOk ? 0 : 1);
}

async function main() {
  const truth = loadSignedTotals();
  const usmcaDocs = USMCA_CUTOVER_DOCS.filter((d) => truth.has(d));
  // STALE-LITERAL-OK: structural assertion — exact count verified against array/fixture in this file
  if (usmcaDocs.length !== USMCA_DOC_COUNT) {
    throw new Error(
      `expected exactly ${USMCA_DOC_COUNT} USMCA settlement documents (5769-5803 less ${NOT_USMCA_DOCS.join("/")}) in ${path.basename(TRUTH_PATH)}, found ${usmcaDocs.length} — ` +
        `ground-truth file may be stale or the L2 boundary changed; re-verify before trusting this guard`
    );
  }
  const targetSum = usmcaDocs.reduce((s, d) => s + truth.get(d), 0);
  if (Math.abs(targetSum - USMCA_TARGET_SUM) > 0.005) {
    throw new Error(
      `sum of the ${USMCA_DOC_COUNT} USMCA documents' TOTAL DUE is ${targetSum.toFixed(2)}, not the expected ${USMCA_TARGET_SUM.toFixed(2)} — ` +
        `ground-truth file changed since this guard was written; re-verify the acceptance figure before trusting it`
    );
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("verify-settlement-net-matches-signed-doc: FAIL — DATABASE_URL not set or the database is unreachable. A live money guard that cannot connect is a FAIL, never a pass (ROUND 29.9-B).");
    process.exit(1);
  }
  const pool = new pg.Pool({ connectionString: url, ssl: inferPgSslOption(url) });
  const client = await pool.connect();
  try {
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");

    const res = await client.query(
      `
      WITH b AS MATERIALIZED (SELECT set_config('app.bypass_rls','lucia',true) AS v)
      SELECT ds.source_document_ref, ds.display_id, ds.status, ds.net_pay::text AS net_pay
      FROM driver_finance.driver_settlements ds, b
      WHERE (SELECT v FROM b) = 'lucia'
        AND ds.operating_company_id = $1::uuid
        AND ds.source_document_ref = ANY($2::text[])
        AND ds.status <> 'cancelled'
      ORDER BY ds.source_document_ref::int, ds.display_id
      `,
      [OPCO, usmcaDocs]
    );

    const { lines, failures } = judgeSettlements(usmcaDocs, truth, res.rows);

    // ROUND 326 item 18: each USMCA document's live settlement is posted EXACTLY ONCE through the close engine.
    const payrunRes = await client.query(
      `
      WITH b AS MATERIALIZED (SELECT set_config('app.bypass_rls','lucia',true) AS v)
      SELECT ds.source_document_ref, count(pr.id) FILTER (WHERE pr.status = 'posted')::int AS n
      FROM driver_finance.driver_settlements ds
      LEFT JOIN driver_finance.payrun_gl_runs pr
        ON pr.settlement_id = ds.id AND pr.operating_company_id = ds.operating_company_id
      CROSS JOIN b
      WHERE (SELECT v FROM b) = 'lucia'
        AND ds.operating_company_id = $1::uuid
        AND ds.status <> 'cancelled'
        AND ds.source_document_ref = ANY($2::text[])
        AND NOT (ds.display_id = ANY($3::text[]))
      GROUP BY ds.source_document_ref
      `,
      [OPCO, usmcaDocs, [...KNOWN_DUPLICATE_EXEMPT]]
    );
    const postedByDoc = new Map(payrunRes.rows.map((r) => [r.source_document_ref, Number(r.n)]));
    const notUsmcaRes = await client.query(
      `
      WITH b AS MATERIALIZED (SELECT set_config('app.bypass_rls','lucia',true) AS v)
      SELECT ds.source_document_ref, ds.display_id
      FROM driver_finance.driver_settlements ds, b
      WHERE (SELECT v FROM b) = 'lucia'
        AND ds.operating_company_id = $1::uuid
        AND ds.status <> 'cancelled'
        AND ds.source_document_ref = ANY($2::text[])
      `,
      [OPCO, [...NOT_USMCA_DOCS]]
    );

    console.log(`${LABEL} — ${usmcaDocs.length} USMCA settlement documents (5769-5803 less ${NOT_USMCA_DOCS.join("/")}, Transportation):\n`);
    console.log("doc   display_id       net        signed     status");
    console.log("----- ---------------- ---------- ---------- ------");
    for (const l of lines) console.log(l);
    const onceCount = [...postedByDoc.values()].filter((n) => n === 1).length;
    console.log(`\nposted exactly once through the close engine: ${onceCount} of ${postedByDoc.size} live settlement(s); Transportation documents live in USMCA: ${notUsmcaRes.rows.length}`);

    failures.push(...payrunFailures(postedByDoc));
    failures.push(...notUsmcaFailures(notUsmcaRes.rows));

    if (failures.length > 0) {
      throw new Error(`${failures.length} failure(s):\n  ${failures.join("\n  ")}`);
    }
    console.log(`\n${LABEL} PASS — all ${usmcaDocs.length} documents net_pay = signed TOTAL DUE, each posted exactly once through the close engine; 0 Transportation documents in USMCA.`);
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv.includes("--selftest")) selftest();
else main().catch((err) => {
  console.error(`${LABEL} FAIL: ${err.message}`);
  process.exit(1);
});

#!/usr/bin/env node
// ROUND 23.2 B4/B5 (ACCT-F26307) — for every USMCA settlement, net_pay must equal the signed
// AlwaysTrack document's TOTAL DUE to the cent, and every settlement must post through the
// canonical Bill+BillPayment engine, never the single-JE driver_finance.payrun_gl_runs
// (closeSettlementPayRun) path.
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

const LABEL = "verify-settlement-net-matches-signed-doc";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TRUTH_PATH = path.join(ROOT, "data/alwaystrack/settlements-truth-2026-09-13.json");
const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80"; // USMCA
// NOTE: both governing round-23.2 docs say "34 USMCA settlements, 5769 through 5803" — that range is
// actually 35 numbers inclusive (5803-5769+1), a shared off-by-one. Verified against ground truth:
// all 35 numbers exist as distinct documents in the truth file, and their total_due values sum to
// exactly $49,297.42 -- the SAME target figure both docs cite -- so 35 is the count this guard
// checks; "34" in the prose is the error, not this guard.
const USMCA_CUTOVER_DOCS = Array.from({ length: 35 }, (_, i) => String(5769 + i)); // 5769..5803

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

async function main() {
  const truth = loadSignedTotals();
  const usmcaDocs = USMCA_CUTOVER_DOCS.filter((d) => truth.has(d));
  if (usmcaDocs.length !== 35) {
    throw new Error(
      `expected exactly 35 USMCA settlement documents (5769-5803 inclusive) in ${path.basename(TRUTH_PATH)}, found ${usmcaDocs.length} — ` +
        `ground-truth file may be stale or the L2 boundary changed; re-verify before trusting this guard`
    );
  }
  const targetSum = usmcaDocs.reduce((s, d) => s + truth.get(d), 0);
  if (Math.abs(targetSum - 49297.42) > 0.005) {
    throw new Error(
      `sum of all 35 documents' TOTAL DUE is ${targetSum.toFixed(2)}, not the expected 49,297.42 — ` +
        `ground-truth file changed since this guard was written; re-verify the acceptance figure before trusting it`
    );
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log(`${LABEL}: SKIPPED-DB-CHECK (DATABASE_URL is unset) -- static sweep only, no live check ran`);
    return;
  }
  const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
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

    const byDocRows = new Map();
    for (const row of res.rows) {
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

    // 0 rows posted via closeSettlementPayRun (B5 law: canonical Bill+BillPayment only, going forward).
    const payrunRes = await client.query(
      `
      WITH b AS MATERIALIZED (SELECT set_config('app.bypass_rls','lucia',true) AS v)
      SELECT count(*)::int AS n
      FROM driver_finance.payrun_gl_runs pr
      JOIN driver_finance.driver_settlements ds ON ds.id = pr.settlement_id
      CROSS JOIN b
      WHERE (SELECT v FROM b) = 'lucia'
        AND pr.operating_company_id = $1::uuid
        AND pr.status = 'posted'
        AND ds.source_document_ref = ANY($2::text[])
      `,
      [OPCO, usmcaDocs]
    );
    const payrunCount = Number(payrunRes.rows[0]?.n ?? 0);

    console.log(`${LABEL} — ${usmcaDocs.length} USMCA settlement documents (5769-5803):\n`);
    console.log("doc   display_id       net        signed     status");
    console.log("----- ---------------- ---------- ---------- ------");
    for (const l of lines) console.log(l);
    console.log(`\ncloseSettlementPayRun (payrun_gl_runs) posted rows for these documents: ${payrunCount} (law requires 0)`);

    if (payrunCount > 0) {
      failures.push(
        `${payrunCount} USMCA settlement(s) are posted via the disfavored single-JE closeSettlementPayRun ` +
          `path (driver_finance.payrun_gl_runs) — B5 requires the canonical Bill+BillPayment engine only. ` +
          `These postings are individually penny-exact to their signed documents (verified above) — this is ` +
          `a mechanism migration, not a money error, and reversing+reposting 30+ already-correct settlements ` +
          `is a separate, owner-gated undertaking, not a header-sync fix.`
      );
    }

    if (failures.length > 0) {
      throw new Error(`${failures.length} failure(s):\n  ${failures.join("\n  ")}`);
    }
    console.log(`\n${LABEL} PASS — all ${usmcaDocs.length} documents net_pay = signed TOTAL DUE; 0 rows via closeSettlementPayRun.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(`${LABEL} FAIL: ${err.message}`);
  process.exit(1);
});

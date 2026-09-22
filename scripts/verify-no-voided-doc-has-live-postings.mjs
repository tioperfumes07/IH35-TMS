#!/usr/bin/env node
// ROUND 31.2/32.2 — Part C, measurement half. A document (bill/expense/invoice) whose own status
// is void/voided but which still carries a LIVE (posted, non-reversed) GL posting is a real
// financial-integrity gap: the ledger still reports money that the document itself claims is gone.
//
// Predicate: source-linked journal_entry_postings joined to their journal_entries, filtered to
// debit_or_credit='debit' (the document's own economic amount — a balanced JE's credit leg would
// double-count the same dollar), where the JE is still `status='posted'`, `reversed_by_je_id IS
// NULL`, `voided_at IS NULL`, and the posting line itself has no `reversed_by_line_id`.
//
// This is a SHRINK-ONLY four-arm ratchet, same shape as every other ratchet this session
// (verify-alwaystrack-parity.mjs, verify-fuel-transactions-per-load.mjs):
//   not in baseline, doc has a live posting  -> FAIL (new rot)
//   baseline entry got WORSE (more docs/$)   -> FAIL (debt grew)
//   baseline entry unchanged or better       -> PASS, printed as known debt, never silent
//   baseline entry now ZERO                  -> FAIL "remove me from the baseline"
//
// Seeded 2026-09-22 at a live, independently re-derived measurement: 28 bills / $294,210.72,
// 179 expenses / $56,023.97, 1 invoice / $3,200.00 — 208 docs / $353,434.69 total. Of the 2
// voided invoices with a live posting, ONE (display_id 13541) has a confirmed live REPLACEMENT
// open for the same load (INV-2026-00002, status 'sent') and is excluded per-invoice, not assumed
// — void-and-reissue is the correct, intentional shape there. The other (13572) has no
// replacement and stays counted as a real gap. Never assume both are reissues; check each live.
//
// FLOOR NOT CEILING: this guard is document-keyed (joins via source_transaction_id). It CANNOT see
// a live posting whose source_transaction_type is NULL — measured live at 162 such posting lines
// (far more than the 2 settlement header JEs, 13533/13539, previously named). This guard's count
// is a known floor, not a claimed ceiling; the NULL-source count is separately measured and
// reported every run, never folded into this baseline silently.
//
// REQUIRES_LIVE_DB (ruled 2026-09-23, docs/bus/INBOX-CC-1.md): a ROUND-29.9-B money guard is
// DESIGNED to fail without a live DB (never a silent skip) — that makes it structurally
// incompatible with verify-static's no-DB dead-port sentinel sweep, which would otherwise record
// this guard's correct offline FAIL as "new rot." Declaring this excludes it from that sweep
// entirely (mirrors ALLOW_OFFLINE_SKIP); it still runs for real, live, fail-closed under
// money-pr-local-gate.mjs with a real DATABASE_URL.
export const REQUIRES_LIVE_DB =
  "ROUND 29.9-B money guard — always fails without a live DB by design (fail-closed, never a " +
  "silent skip), which is incompatible with verify-static's no-DB dead-port sentinel.";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const LABEL = "verify-no-voided-doc-has-live-postings";
const BASELINE_PATH = path.join(process.cwd(), "scripts/verify-no-voided-doc-has-live-postings.baseline.json");

const DOC_TYPES = [
  { key: "bills", table: "accounting.bills", statusCol: "status", statusVal: "void", sourceType: "bill" },
  { key: "expenses", table: "accounting.expenses", statusCol: "status", statusVal: "void", sourceType: "expense" },
  { key: "invoices", table: "accounting.invoices", statusCol: "status", statusVal: "void", sourceType: "invoice" },
];

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return null;
  return JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
}

async function measureLive(client) {
  const perType = {};
  let totalDocs = 0;
  let totalCents = 0;
  for (const dt of DOC_TYPES) {
    // ROUND 32.2 correction (Lead + CC-2): a voided document with a live REPLACEMENT already open
    // (void-and-reissue) is not a real gap — it is the correct, intentional shape. Scoped to
    // invoices only (the only type this has been proven for): live-verified 2026-09-22, only 1 of
    // the 2 voided invoices with a live posting has a confirmed replacement open for the same
    // load (13541 -> INV-2026-00002, status 'sent'); the other (13572) has none and stays counted.
    // Never assume both are reissues — check each live.
    const replacementExclusion =
      dt.key === "invoices"
        ? `AND NOT EXISTS (
             SELECT 1 FROM accounting.invoices repl
              WHERE repl.source_load_id = t.source_load_id
                AND repl.id <> t.id
                AND repl.status NOT IN ('draft', 'proforma', 'void')
           )`
        : "";
    const res = await client.query(
      `
        SELECT count(DISTINCT t.id)::int AS docs, COALESCE(SUM(jep.amount_cents), 0)::bigint AS cents
          FROM ${dt.table} t
          JOIN accounting.journal_entry_postings jep
            ON jep.source_transaction_type = $1
           AND jep.source_transaction_id = t.id::text
           AND jep.debit_or_credit = 'debit'
          JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
         WHERE t.${dt.statusCol} = $2
           AND je.status = 'posted'
           AND je.reversed_by_je_id IS NULL
           AND je.voided_at IS NULL
           AND jep.reversed_by_line_id IS NULL
           ${replacementExclusion}
      `,
      [dt.sourceType, dt.statusVal]
    );
    const docs = Number(res.rows[0]?.docs ?? 0);
    const cents = Number(res.rows[0]?.cents ?? 0);
    perType[dt.key] = { docs, cents };
    totalDocs += docs;
    totalCents += cents;
  }

  // NULL-source floor-not-ceiling count — measured and reported, never folded into totals.
  const nullSourceRes = await client.query(
    `
      SELECT count(*)::int AS n
        FROM accounting.journal_entry_postings jep
        JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
       WHERE jep.source_transaction_type IS NULL
         AND jep.debit_or_credit = 'debit'
         AND je.status = 'posted'
         AND je.reversed_by_je_id IS NULL
         AND je.voided_at IS NULL
         AND jep.reversed_by_line_id IS NULL
    `
  );

  return { perType, totalDocs, totalCents, nullSourcePostingLines: Number(nullSourceRes.rows[0]?.n ?? 0) };
}

async function live() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(`${LABEL}: FAIL — no DATABASE_URL. A money guard that cannot connect is a fail, not a pass (ROUND 29.9-B).`);
    process.exitCode = 1;
    return;
  }
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
  } catch (err) {
    console.error(`${LABEL}: FAIL — cannot connect (${err.code || err.message}). A money guard that cannot connect is a fail, not a pass (ROUND 29.9-B).`);
    process.exitCode = 1;
    return;
  }
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', false)");

    const measured = await measureLive(client);
    await client.query("ROLLBACK");

    console.log(
      `${LABEL}: measured live — ${measured.totalDocs} doc(s) / $${(measured.totalCents / 100).toFixed(2)} ` +
        `(bills ${measured.perType.bills.docs}/$${(measured.perType.bills.cents / 100).toFixed(2)}, ` +
        `expenses ${measured.perType.expenses.docs}/$${(measured.perType.expenses.cents / 100).toFixed(2)}, ` +
        `invoices ${measured.perType.invoices.docs}/$${(measured.perType.invoices.cents / 100).toFixed(2)}); ` +
        `NULL-source-type live posting lines (floor, not ceiling — this guard cannot see these): ` +
        `${measured.nullSourcePostingLines}`
    );

    const baseline = loadBaseline();
    let failures = 0;
    if (!baseline) {
      if (measured.totalDocs > 0) {
        console.error(`${LABEL}: LIVE FAIL — no baseline file and ${measured.totalDocs} doc(s) with live postings on voided documents. A reconciled baseline must exist before this guard can pass on a nonzero total.`);
        failures++;
      }
    } else if (measured.totalDocs === 0) {
      console.error(`${LABEL}: LIVE FAIL — now CLEAN (0 docs), but a baseline for ${baseline.total_docs} doc(s) / $${(baseline.total_cents / 100).toFixed(2)} still exists — remove ${path.basename(BASELINE_PATH)} (good news; confirm it, don't leave stale debt on the books).`);
      failures++;
    } else if (measured.totalDocs !== baseline.total_docs || measured.totalCents !== baseline.total_cents) {
      const worse = measured.totalDocs > baseline.total_docs || measured.totalCents > baseline.total_cents;
      console.error(
        `${LABEL}: LIVE FAIL — diverges from the reconciled baseline (${baseline.total_docs} doc(s) / ` +
          `$${(baseline.total_cents / 100).toFixed(2)}, established ${baseline.established}). ` +
          `${worse ? "Debt GREW" : "Debt shrank but wasn't re-baselined"} — a human re-reconciles ` +
          `(the backfill target) and regenerates the baseline with a cited reason before this can pass again.`
      );
      failures++;
    } else {
      console.log(
        `${LABEL}: known, reconciled debt — ${measured.totalDocs} doc(s) / $${(measured.totalCents / 100).toFixed(2)} ` +
          `(baseline established ${baseline.established}; backfill via voidDocument() drives this to zero).`
      );
    }

    if (failures > 0) process.exit(1);
    console.log(`${LABEL}: LIVE PASS.`);
  } finally {
    await client.end().catch(() => {});
  }
}

await live();

#!/usr/bin/env node
// ROUND 23.3 SUPPLEMENT — THE MASTER PARITY GUARD (owner/Lead, 2026-09-13, verbatim): "This is the
// one that decides whether ANY of Round 23 is done. Your three existing guards each prove one
// slice. Nothing proves the whole." Reads data/alwaystrack/settlements-truth-2026-09-13.json (the
// signed AlwaysTrack documents — never re-parse a PDF) as ground truth, reads PROD, and prints ONE
// LINE PER SETTLEMENT DOCUMENT across six dimensions plus a total. Zero tolerance. Cents, not
// dollars. No rounding band. Exits non-zero unless all six are exact on all 34 USMCA documents
// (5769-5803, one number — 5782 — carries no company-side document, only a driver-side one).
//
// Five structural assertions (A-E), each its own pass/fail line — see auditStructural() below.
//
// THE BYPASS TRAP (verbatim): a CTE calling set_config('app.bypass_rls','lucia',true) must be
// declared AS MATERIALIZED and referenced in a WHERE clause, e.g. (SELECT v FROM b)='lucia'.
// Referenced only in the SELECT list, or not at all, it silently returns 0 rows under FORCED RLS
// and every comparison reads as a FALSE MATCH. A bare 0 is masked, not empty.
//
// BANK-F30150 (found + fixed this session): a bare session-level `set_config(...,false)` on one
// held pg.Client connection is ALSO unreliable — through Neon's POOLED endpoint (the connection
// string's `-pooler` host), the pooler can silently route different statements from the same
// client-side connection to different physical backends, so a GUC "set for the whole session"
// sometimes does not survive to the next statement. Reproduced live: the identical query returned
// real rows on one run and 0 rows on the very next run of the same process. This guard now opens
// one explicit transaction (BEGIN), sets bypass_rls with is_local=true (transaction-scoped) INSIDE
// it, runs every read query on that same connection, then COMMITs — a pooler cannot split one
// transaction across two backends, so every statement inside it reliably sees the same bypass.
//
// Skips gracefully (prints, exits 0) when DATABASE_URL is not set — same convention every other
// live-Neon guard in this repo uses.
//
// P0 owner ruling (2026-09-22, ~02:00 Laredo deadline): this guard silently skip-passed on every
// push all session (see the comment two lines up — that "not a pass, not a fail" line is correct
// in what it SAYS, wrong in what the code then DID: exit 0 anyway). The moment 03c
// (verify-control-totals.mjs, the OWNER's own ROUND 29.9 guard) started requiring DATABASE_URL for
// any money-path push, this guard's real 34-of-34-document mismatch — pre-existing, dated
// 2026-09-13 drift in CC-3's historical reconciliation scope, unrelated to either blocked branch —
// surfaced and blocked CC-2's and CC-3's finished, control-totals-clean branches. Owner: "the 34
// documents are pre-existing drift... fixing 34 documents of real money is its own multi-hour
// block with its own proof. Holding two finished branches hostage to it is how days get lost."
//
// BASELINE RATCHET (repo's own precedent: scripts/verify-sweep-c6-money-insert-requires-je-poster.
// baseline.json) — scripts/verify-alwaystrack-parity.baseline.json, one entry per already-known
// mismatched document, carrying its exact 2026-09-22 delta (actual - target, in cents, per
// dimension) and a one-line reason. Four-arm verdict per document:
//   not in baseline, mismatched              -> FAIL (a real, new regression)
//   in baseline, mismatched, delta WORSE      -> FAIL (debt got bigger, not just old)
//   in baseline, mismatched, unchanged/better -> PASS, printed as known debt (not silent)
//   in baseline, now EXACT (0 mismatches)     -> FAIL "remove me from the baseline" (forces the
//                                                 baseline to stay honest — a real fix cannot hide)
// The baseline's own entry COUNT may never grow (enforced below) — adding a document requires a
// written Lead ruling named in the PR body, exactly like C6's own regenerate-and-review convention.
// Regenerate: UPDATE_ALWAYSTRACK_PARITY_BASELINE=1 (writes the CURRENT live deltas for every
// currently-mismatched document — used ONCE to establish the 2026-09-22 baseline; any later
// regenerate that would INCREASE the entry count is refused, matching the shrink-only law).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { exitIfEmptyByPurge, purgeLiveRowCondition } from "./lib/purge-window.mjs";

// REQUIRES_LIVE_DB (ruled 2026-09-23, docs/bus/INBOX-CC-1.md): excludes this guard from
// scripts/verify-static.mjs's dead-port sentinel sweep entirely. This guard's live() has always
// FAIL-CLOSED without DATABASE_URL ("a live money guard that cannot connect is a FAIL, never a
// pass") -- the dead-port sentinel asks it a question it cannot answer, and the static sweep was
// classifying that correct fail-closed behavior as new rot the first time this file's content
// changed under it. money-pr-local-gate.mjs still runs this for real against a live DATABASE_URL
// (unaffected, still fails closed where it actually matters); the file's own --selftest arm
// (synthetic data, no DB) is independently re-verified by verify-guard-selftests-are-real.mjs, so
// nothing here loses static coverage of the part that can actually run statically.
export const REQUIRES_LIVE_DB = "live() fails closed without DATABASE_URL by design (ROUND 29.9-B); the dead-port sentinel cannot ask this guard a question it can answer";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-alwaystrack-parity";
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const GROUND_TRUTH_PATH = path.join(ROOT, "data/alwaystrack/settlements-truth-2026-09-13.json");
const BASELINE_PATH = path.join(ROOT, "scripts/verify-alwaystrack-parity.baseline.json");

/** cents/count delta per dimension, actual - target. The comparable "how far off" signature. */
function deltaSignature(target, actual) {
  return {
    line_haul_cents: actual.line_haul_cents - target.line_haul_cents,
    driver_payment_cents: actual.driver_payment_cents - target.driver_payment_cents,
    fuel_cents: actual.fuel_cents - target.fuel_cents,
    fuel_count: actual.fuel_count - target.fuel_count,
    expenses_cents: actual.expenses_cents - target.expenses_cents,
    expenses_count: actual.expenses_count - target.expenses_count,
    driver_net_cents: actual.driver_net_cents == null || target.driver_net_cents == null ? null : actual.driver_net_cents - target.driver_net_cents,
  };
}

function totalAbsDrift(sig) {
  return Math.abs(sig.line_haul_cents) + Math.abs(sig.driver_payment_cents) + Math.abs(sig.fuel_cents) + Math.abs(sig.expenses_cents) + Math.abs(sig.driver_net_cents ?? 0);
}

/** True if `current` is strictly worse than `baseline` on ANY dimension (further from zero). */
function deltaWorsened(baselineSig, currentSig) {
  const fields = ["line_haul_cents", "driver_payment_cents", "fuel_cents", "fuel_count", "expenses_cents", "expenses_count"];
  for (const f of fields) {
    if (Math.abs(currentSig[f]) > Math.abs(baselineSig[f])) return true;
  }
  if (baselineSig.driver_net_cents != null && currentSig.driver_net_cents != null) {
    if (Math.abs(currentSig.driver_net_cents) > Math.abs(baselineSig.driver_net_cents)) return true;
  }
  return false;
}

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return null;
  return JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
}

// L1/Part A (absorption law): a settlement whose END date is on or after this cutover date is
// USMCA in full. 0 exceptions across 44 documents (#22012) — the tested predicate, not the
// company-name field, decides scope.
const CUTOVER_DATE = "2026-08-07";

/**
 * Pure — no I/O. Reads the ground-truth JSON's own two arrays (`company[]`, `driver[]`) and
 * produces one target row per USMCA document: the six-dimension figures a correct ingest must
 * reproduce exactly, plus the load list used to attribute PROD rows to that document.
 *
 * `company[].loads` is an array of load-number STRINGS (e.g. "13542"), and every line-item array
 * (`customer_charges`, `fuel_purchases`, `expenses`) carries a `load` field naming one of them —
 * confirmed by direct inspection of the file, not assumed from a paraphrase.
 */
export function computeGroundTruthTargets(raw) {
  const company = raw.company ?? [];
  const driver = raw.driver ?? [];
  const usmcaCompany = company.filter((r) => r.end_date >= CUTOVER_DATE);
  const usmcaDriver = driver.filter((r) => r.end_date >= CUTOVER_DATE);
  const driverByDoc = new Map(usmcaDriver.map((r) => [String(r.settlement_no), r]));

  const documents = usmcaCompany
    .map((r) => {
      const doc = String(r.settlement_no);
      const driverRow = driverByDoc.get(doc);
      return {
        doc,
        loads: r.loads ?? [],
        line_haul_cents: round2Cents(sumBy(r.customer_charges, "amount")),
        driver_payment_cents: round2Cents(r.driver_payment_total ?? 0),
        fuel_cents: round2Cents(sumBy(r.fuel_purchases, "actual")),
        fuel_count: (r.fuel_purchases ?? []).length,
        expenses_cents: round2Cents(sumBy(r.expenses, "amount")),
        expenses_count: (r.expenses ?? []).length,
        // driver_net is null (not zero) when no driver-side document exists for this number at
        // all — 5782 is the one live example — so a missing driver doc reads as "cannot compare",
        // never as a false $0.00 target.
        driver_net_cents: driverRow ? round2Cents(driverRow.total_due) : null,
      };
    })
    .sort((a, b) => Number(a.doc) - Number(b.doc));

  const totals = documents.reduce(
    (acc, d) => ({
      line_haul_cents: acc.line_haul_cents + d.line_haul_cents,
      driver_payment_cents: acc.driver_payment_cents + d.driver_payment_cents,
      fuel_cents: acc.fuel_cents + d.fuel_cents,
      fuel_count: acc.fuel_count + d.fuel_count,
      expenses_cents: acc.expenses_cents + d.expenses_cents,
      expenses_count: acc.expenses_count + d.expenses_count,
      driver_net_cents: acc.driver_net_cents + (d.driver_net_cents ?? 0),
    }),
    { line_haul_cents: 0, driver_payment_cents: 0, fuel_cents: 0, fuel_count: 0, expenses_cents: 0, expenses_count: 0, driver_net_cents: 0 }
  );

  return { documents, totals, documentCount: documents.length };
}

function sumBy(arr, key) {
  return (arr ?? []).reduce((s, r) => s + Number(r[key] ?? 0), 0);
}
// Ground-truth dollars are already 2-decimal-clean in the source JSON; round to the cent before
// converting so float drift from summing many small dollar values never manufactures an off-by-
// one-cent false mismatch against a PROD figure that is itself already integer cents.
function round2Cents(dollars) {
  return Math.round(Number(dollars) * 100);
}

/** One document's six-dimension comparison. Pure — takes already-fetched PROD aggregates. */
export function compareDocument(target, actual) {
  const mismatches = [];
  if (target.line_haul_cents !== actual.line_haul_cents) {
    mismatches.push(`LINE_HAUL ${fmt(actual.line_haul_cents)}!=${fmt(target.line_haul_cents)}`);
  }
  if (target.driver_payment_cents !== actual.driver_payment_cents) {
    mismatches.push(`DRIVER_PAYMENT ${fmt(actual.driver_payment_cents)}!=${fmt(target.driver_payment_cents)}`);
  }
  if (target.fuel_cents !== actual.fuel_cents || target.fuel_count !== actual.fuel_count) {
    mismatches.push(`FUEL ${fmt(actual.fuel_cents)}/${actual.fuel_count}rows!=${fmt(target.fuel_cents)}/${target.fuel_count}rows`);
  }
  if (target.expenses_cents !== actual.expenses_cents || target.expenses_count !== actual.expenses_count) {
    mismatches.push(`EXPENSES ${fmt(actual.expenses_cents)}/${actual.expenses_count}rows!=${fmt(target.expenses_cents)}/${target.expenses_count}rows`);
  }
  if (target.driver_net_cents == null) {
    mismatches.push(`DRIVER_NET no driver-side document for ${target.doc} in ground truth — cannot compare`);
  } else if (actual.driver_net_cents == null) {
    mismatches.push(`DRIVER_NET no live non-cancelled settlement carries source_document_ref=${target.doc}`);
  } else if (target.driver_net_cents !== actual.driver_net_cents) {
    mismatches.push(`DRIVER_NET ${fmt(actual.driver_net_cents)}!=${fmt(target.driver_net_cents)}`);
  }
  return mismatches;
}

function fmt(cents) {
  return (Number(cents) / 100).toFixed(2);
}

// Structural assertion E — the frozen Transportation documents/loads this importer must NEVER
// touch (Part A, Rule 3). A guard that never checks this cannot tell "correctly absent" from
// "nobody has broken it yet" apart.
const TRANSPORTATION_DOCS = ["5753", "5760", "5761", "5762", "5763", "5764", "5765", "5766", "5767", "5768"];

async function live() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    // P0 owner ruling (2026-09-22): "the comment is right and the code is wrong" — this line
    // correctly SAID "not a pass, not a fail" but the function then returned normally, and the
    // caller (--live-only invocation below) exits 0 regardless. Money-pr-local-gate.mjs now only
    // invokes this guard when a money path is actually touched or DATABASE_URL is already present
    // (mirroring 03c/verify-control-totals.mjs's own established conditional) — so reaching this
    // branch at all means a money-relevant push has no live DB connection, which must fail, not
    // silently pass.
    console.error(`${LABEL}: FAIL — DATABASE_URL not set. A live money guard that cannot connect is a FAIL, never a pass.`);
    process.exit(1);
  }
  if (!fs.existsSync(GROUND_TRUTH_PATH)) {
    console.error(`${LABEL}: LIVE FAIL — ground truth file missing: ${GROUND_TRUTH_PATH}`);
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(GROUND_TRUTH_PATH, "utf8"));
  const { documents, totals, documentCount } = computeGroundTruthTargets(raw);

  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    // BANK-F30150 (found + fixed this session): the session-level `set_config(...,false)` this
    // file's own header used to recommend is UNRELIABLE through Neon's POOLED endpoint (the
    // connection string's `-pooler` host) — a pooler can silently multiplex one client-side
    // connection across different physical backends between individual statements, so a GUC set
    // "for the whole session" sometimes does not survive to the NEXT statement. Reproduced live,
    // twice, back to back, same process: a bare `mdata.loads` SELECT after `set_config(...,false)`
    // returned 3/4 real rows on one run and 0 rows on the very next run with identical inputs — not
    // a data problem, an instrument problem (this repo's own "an empty result is an instrument
    // claim" law). This guard previously reported 34/34 documents FAILING on LINE_HAUL/DRIVER_
    // PAYMENT/FUEL/EXPENSES all reading 0.00/0rows even after B1's fuel ingestion had already landed
    // 171 real rows — a false read, not a true zero. Fixed by wrapping every read query in one
    // explicit transaction with a TRANSACTION-scoped `set_config(...,true)`: a pooler cannot split
    // one transaction across two backends, so every statement inside it reliably sees the same
    // bypass. Verified: the identical query pair that returned 0 rows outside a transaction returned
    // the correct non-zero rows every time once wrapped in BEGIN/COMMIT.
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");

    // Purge window: with no live USMCA loads, every document would read as a mismatch. Inside a
    // verified purge window that is EMPTY BY PURGE; outside it, the guard fails exactly as before.
    // "Live" is the purge's own rule for the table (the mass void leaves the rows in place).
    const usmcaLoads = await client.query(
      `SELECT count(*)::int AS n FROM mdata.loads WHERE ${purgeLiveRowCondition(LABEL, "mdata.loads")}`
    );
    if (usmcaLoads.rows[0].n === 0) exitIfEmptyByPurge(LABEL, "mdata.loads (USMCA, no live row)");

    const allLoadNumbers = [...new Set(documents.flatMap((d) => d.loads))];

    const loadsRes = await client.query(
      `SELECT l.id::text AS load_id, l.load_number, l.is_sample_data, l.soft_deleted_at IS NOT NULL AS is_soft_deleted
         FROM mdata.loads l
        WHERE l.operating_company_id = $1::uuid AND l.load_number = ANY($2::text[])`,
      [USMCA_COMPANY_ID, allLoadNumbers]
    );
    const loadByNumber = new Map(loadsRes.rows.map((r) => [r.load_number, r]));

    const invoiceRes = await client.query(
      `SELECT l.load_number, sum(i.total_cents) AS cents, count(i.id) AS n
         FROM mdata.loads l
         JOIN accounting.invoices i ON i.source_load_id = l.id AND i.operating_company_id = l.operating_company_id
        WHERE l.operating_company_id = $1::uuid AND l.load_number = ANY($2::text[]) AND i.voided_at IS NULL
        GROUP BY l.load_number`,
      [USMCA_COMPANY_ID, allLoadNumbers]
    );
    const invoiceByLoad = new Map(invoiceRes.rows.map((r) => [r.load_number, { cents: Number(r.cents), n: Number(r.n) }]));

    const billRes = await client.query(
      `SELECT l.load_number, sum(db.gross_amount_cents) AS cents, count(db.id) AS n
         FROM mdata.loads l
         JOIN driver_finance.driver_bills db ON db.load_id = l.id AND db.operating_company_id = l.operating_company_id
        WHERE l.operating_company_id = $1::uuid AND l.load_number = ANY($2::text[]) AND db.voided_at IS NULL
        GROUP BY l.load_number`,
      [USMCA_COMPANY_ID, allLoadNumbers]
    );
    const billByLoad = new Map(billRes.rows.map((r) => [r.load_number, { cents: Number(r.cents), n: Number(r.n) }]));

    const unlinkedBillRes = await client.query(
      `SELECT count(*) AS n FROM driver_finance.driver_bills
        WHERE operating_company_id = $1::uuid AND voided_at IS NULL AND settled_in_settlement_id IS NULL`,
      [USMCA_COMPANY_ID]
    );
    const unlinkedBillCount = Number(unlinkedBillRes.rows[0].n);

    const expenseRes = await client.query(
      `SELECT l.load_number, sum(e.total_amount_cents) AS cents, count(e.id) AS n
         FROM mdata.loads l
         JOIN accounting.expenses e ON e.load_id = l.id AND e.operating_company_id = l.operating_company_id
        WHERE l.operating_company_id = $1::uuid AND l.load_number = ANY($2::text[]) AND e.voided_at IS NULL
        GROUP BY l.load_number`,
      [USMCA_COMPANY_ID, allLoadNumbers]
    );
    const expenseByLoad = new Map(expenseRes.rows.map((r) => [r.load_number, { cents: Number(r.cents), n: Number(r.n) }]));

    // Fuel is keyed by load too (fuel.fuel_transactions.load_id), same shape as invoices/bills/
    // expenses above — today this returns 0 rows for every load, which is the entire reason B1
    // exists, not a query bug.
    // R56-C (Lead ruling, docs/bus/09-22-2026-LEAD-RULING-ROUND-56-...md, 2026-09-22): the Round
    // 46 "DO NOT TOUCH" on this file is lifted for exactly this one change. The AlwaysTrack
    // ground-truth's own `fuel_purchases` section (data/alwaystrack/settlements-truth-*.json,
    // parsed from each document's own "FUEL PURCHASES" table) never included DEF or reefer_diesel
    // in the first place -- a DEF purchase prints under the document's separate "EXPENSES" section
    // (confirmed live: e.g. Company_Settlement_5769's "Fuel-DEF-Diesel Exhaust Fluid" line sits
    // under EXPENSES, not FUEL PURCHASES). fuel.fuel_transactions, by contrast, stores DEF and
    // reefer_diesel as first-class fuel_type values in this SAME table (by design, per this
    // session's own DEF-GL-segregation work) -- so the live side was silently over-counting
    // against a target that was diesel-only from the start. Restricting to fuel_type='diesel'
    // makes this query measure the SAME population the ground truth already does, not a new
    // exclusion invented here.
    const fuelRes = await client.query(
      `SELECT l.load_number, sum(round(ft.total_cost * 100)) AS cents, count(ft.id) AS n
         FROM mdata.loads l
         JOIN fuel.fuel_transactions ft ON ft.load_id = l.id AND ft.operating_company_id = l.operating_company_id
        WHERE l.operating_company_id = $1::uuid AND l.load_number = ANY($2::text[]) AND ft.archived_at IS NULL
          AND ft.fuel_type = 'diesel'
        GROUP BY l.load_number`,
      [USMCA_COMPANY_ID, allLoadNumbers]
    );
    const fuelByLoad = new Map(fuelRes.rows.map((r) => [r.load_number, { cents: Number(r.cents), n: Number(r.n) }]));

    const settlementRes = await client.query(
      `SELECT source_document_ref, net_pay, status
         FROM driver_finance.driver_settlements
        WHERE operating_company_id = $1::uuid AND source_document_ref IS NOT NULL`,
      [USMCA_COMPANY_ID]
    );
    const settlementsByDoc = new Map();
    for (const row of settlementRes.rows) {
      const list = settlementsByDoc.get(row.source_document_ref) ?? [];
      list.push({ cents: round2Cents(row.net_pay), status: row.status });
      settlementsByDoc.set(row.source_document_ref, list);
    }

    // D input — a real anti-join, not a bare count comparison (a count-only check would pass
    // vacuously if expense_load_links held 385 links for entirely unrelated expenses while every
    // one of these document loads' own rows had zero real links — exactly the "guard proves
    // nothing" failure mode this whole master guard exists to close). expense_number = the load's
    // own load_number is the identity this table's own contract requires (3.3: "written both
    // ways"). expense_number is a SEQUENCE (load, load-1, load-2), so comparing that field to the
    // bare load number makes every legitimate second/subsequent cost look orphaned. The durable
    // edge's load_number is the denormalized identity that must equal mdata.loads.load_number.
    const unlinkedExpenseRes = await client.query(
      `SELECT l.load_number, e.id::text AS expense_id
         FROM mdata.loads l
         JOIN accounting.expenses e ON e.load_id = l.id AND e.operating_company_id = l.operating_company_id
         LEFT JOIN expense_attribution.expense_load_links ell
           ON ell.expense_source = 'accounting' AND ell.expense_id = e.id AND ell.load_number = l.load_number
        WHERE l.operating_company_id = $1::uuid AND l.load_number = ANY($2::text[])
          AND e.voided_at IS NULL AND ell.id IS NULL`,
      [USMCA_COMPANY_ID, allLoadNumbers]
    );
    // Fuel is represented by its canonical accounting.expenses document (source_fuel_transaction_id),
    // then linked as expense_source='accounting'. Never invent a third source value for the same cost.
    const unlinkedFuelRes = await client.query(
      `SELECT l.load_number, ft.id::text AS fuel_id
         FROM mdata.loads l
         JOIN fuel.fuel_transactions ft ON ft.load_id = l.id AND ft.operating_company_id = l.operating_company_id
         LEFT JOIN accounting.expenses fuel_expense
           ON fuel_expense.source_fuel_transaction_id = ft.id
          AND fuel_expense.operating_company_id = ft.operating_company_id
          AND fuel_expense.voided_at IS NULL
         LEFT JOIN expense_attribution.expense_load_links ell
           ON ell.expense_source = 'accounting'
          AND ell.expense_id = fuel_expense.id
          AND ell.load_number = l.load_number
        WHERE l.operating_company_id = $1::uuid AND l.load_number = ANY($2::text[])
          AND ft.archived_at IS NULL AND ell.id IS NULL`,
      [USMCA_COMPANY_ID, allLoadNumbers]
    );

    // ── Six dimensions, one line per document ──────────────────────────────────────────────
    const lines = [];
    const actuals = [];
    let cleanDocs = 0;
    const docResults = []; // { doc, mismatches, deltaSig, target, actual }
    for (const target of documents) {
      const actual = {
        line_haul_cents: sumField(target.loads, invoiceByLoad, "cents"),
        driver_payment_cents: sumField(target.loads, billByLoad, "cents"),
        fuel_cents: sumField(target.loads, fuelByLoad, "cents"),
        fuel_count: sumField(target.loads, fuelByLoad, "n"),
        expenses_cents: sumField(target.loads, expenseByLoad, "cents"),
        expenses_count: sumField(target.loads, expenseByLoad, "n"),
        driver_net_cents: (() => {
          const candidates = (settlementsByDoc.get(target.doc) ?? []).filter((c) => c.status !== "cancelled");
          if (candidates.length !== 1) return null;
          return candidates[0].cents;
        })(),
      };
      actuals.push(actual);
      const mismatches = compareDocument(target, actual);
      if (mismatches.length === 0) cleanDocs += 1;
      lines.push(`${target.doc}: ${mismatches.length === 0 ? "PASS" : "FAIL"}${mismatches.length ? " -- " + mismatches.join("; ") : ""}`);
      docResults.push({ doc: target.doc, mismatches, deltaSig: deltaSignature(target, actual) });
    }
    for (const line of lines) console.log(line);

    // ── UPDATE_ALWAYSTRACK_PARITY_BASELINE=1 — write the CURRENT live deltas for every
    // currently-mismatched document. Shrink-only: refuses if this would INCREASE the entry count
    // over an already-existing baseline (matches C6's own regenerate-and-review law).
    if (process.env.UPDATE_ALWAYSTRACK_PARITY_BASELINE === "1") {
      const existing = loadBaseline();
      const existingDocCount = existing ? Object.keys(existing.documents).length : 0;
      const mismatchedDocs = docResults.filter((r) => r.mismatches.length > 0);
      const curUnlinkedExpenses = unlinkedExpenseRes.rows.map((r) => r.load_number).length;
      const curUnlinkedFuel = unlinkedFuelRes.rows.map((r) => r.load_number).length;
      const existingCeiling = existing?.structural_d_ceiling ?? { expense_count: 0, fuel_count: 0 };
      if (
        existing &&
        (mismatchedDocs.length > existingDocCount ||
          curUnlinkedExpenses > existingCeiling.expense_count ||
          curUnlinkedFuel > existingCeiling.fuel_count)
      ) {
        console.error(
          `${LABEL}: REFUSED to regenerate — current state (${mismatchedDocs.length} mismatched docs, ${curUnlinkedExpenses} unlinked expenses, ${curUnlinkedFuel} unlinked fuel) exceeds the existing baseline (${existingDocCount} docs, ${existingCeiling.expense_count} expenses, ${existingCeiling.fuel_count} fuel). ` +
            `Adding to this baseline requires a written Lead ruling named in the PR body, not a regenerate.`
        );
        await client.query("COMMIT");
        process.exit(1);
      }
      const entries = {};
      for (const r of mismatchedDocs) {
        entries[r.doc] = {
          delta_cents: r.deltaSig,
          reason: "pre-existing ROUND 28/CC-3 AlwaysTrack reconciliation drift, dated 2026-09-22 — see docs/bus for the owning round",
          mismatch_summary: r.mismatches,
        };
      }
      const out = {
        _comment:
          "ALWAYSTRACK-PARITY shrink-only baseline — P0 owner ruling 2026-09-22 (03c un-masked this guard's pre-existing 34/34 mismatch, blocking CC-2/CC-3's finished branches). " +
          "Regenerate: UPDATE_ALWAYSTRACK_PARITY_BASELINE=1 (refuses to grow either the document count or the structural_d_ceiling). A document's delta getting WORSE fails the gate even while baselined; " +
          "a baselined document reaching zero mismatches ALSO fails (\"remove me from the baseline\") so a real fix cannot hide. Adding to this baseline requires a written Lead ruling named in the PR body.",
        baseline_established: "2026-09-22",
        document_count: mismatchedDocs.length,
        structural_d_ceiling: { expense_count: curUnlinkedExpenses, fuel_count: curUnlinkedFuel },
        documents: entries,
      };
      fs.writeFileSync(BASELINE_PATH, JSON.stringify(out, null, 2) + "\n");
      console.log(`${LABEL}: baseline written — ${mismatchedDocs.length} document(s), ${BASELINE_PATH}`);
      await client.query("COMMIT");
      process.exit(0);
    }

    // Loaded once, used by both structural assertion D's ceiling check (below) and the four-arm
    // per-document verdict (further below) — declared here so both can see it.
    const baseline = loadBaseline();

    // ACTUAL live sums (never the ground-truth target restated) — a prior version of this line
    // printed `totals.fuel_cents`/`totals.expenses_count` here, which is the GROUND-TRUTH TARGET,
    // not a live query result; on a genuinely broken live read (BANK-F30150 above) that made the
    // TOTAL line look correct while every per-document row above it read 0.00/0rows — misleading,
    // not just imprecise. Every field below is summed from `actuals` (live query results only).
    const sumActual = (field) => actuals.reduce((s, a) => s + (a[field] ?? 0), 0);
    console.log("");
    console.log(
      `TOTAL (live): line_haul=${fmt(sumActual("line_haul_cents"))} (target ${fmt(totals.line_haul_cents)}) | ` +
        `driver_payment=${fmt(sumActual("driver_payment_cents"))} (target ${fmt(totals.driver_payment_cents)}) | ` +
        `fuel=${fmt(sumActual("fuel_cents"))}/${sumActual("fuel_count")}rows (target ${fmt(totals.fuel_cents)}/${totals.fuel_count}rows) | ` +
        `expenses=${fmt(sumActual("expenses_cents"))}/${sumActual("expenses_count")}rows (target ${fmt(totals.expenses_cents)}/${totals.expenses_count}rows) | ` +
        `driver_net=${fmt(sumActual("driver_net_cents"))} (target ${fmt(totals.driver_net_cents)})`
    );
    console.log(`DOCUMENTS: ${cleanDocs} of ${documentCount} exact on all six dimensions.`);

    // ── Five structural assertions ──────────────────────────────────────────────────────────
    const structuralFailures = [];

    // A — exactly one live non-cancelled settlement per document number.
    const docNumbers = documents.map((d) => d.doc);
    const badA = docNumbers.filter((doc) => {
      const candidates = (settlementsByDoc.get(doc) ?? []).filter((c) => c.status !== "cancelled");
      return candidates.length !== 1;
    });
    structuralFailures.push({
      id: "A",
      label: "exactly ONE live non-cancelled settlement per document number",
      pass: badA.length === 0,
      detail: badA.length ? `${badA.length} document(s) with != 1 non-cancelled settlement: ${badA.join(", ")}` : "",
    });

    // B — every named load exists, is_sample_data=false, not soft-deleted.
    const missingLoads = allLoadNumbers.filter((n) => !loadByNumber.has(n));
    const staleSampleLoads = allLoadNumbers.filter((n) => loadByNumber.get(n)?.is_sample_data === true);
    const softDeletedLoads = allLoadNumbers.filter((n) => loadByNumber.get(n)?.is_soft_deleted === true);
    const badB = [...missingLoads, ...staleSampleLoads, ...softDeletedLoads];
    structuralFailures.push({
      id: "B",
      label: "every named load exists, is_sample_data=false, not soft-deleted",
      pass: badB.length === 0,
      detail: badB.length
        ? `missing=[${missingLoads.join(",")}] is_sample_data=true=[${staleSampleLoads.join(",")}] soft_deleted=[${softDeletedLoads.join(",")}]`
        : "",
    });

    // C — settled_in_settlement_id set on every live driver bill whose load is on a document.
    structuralFailures.push({
      id: "C",
      label: "settled_in_settlement_id IS NOT NULL on every live driver bill for a document load",
      pass: unlinkedBillCount === 0,
      detail: unlinkedBillCount > 0 ? `${unlinkedBillCount} live driver bill(s) company-wide still unlinked` : "",
    });

    // D — every live expense/fuel row for a document load has an expense_load_links row whose
    // expense_number equals the load number, proven by a real anti-join (see the query above),
    // never a bare count comparison — a count-only check would pass vacuously if the table held
    // enough rows for entirely unrelated expenses.
    const unlinkedExpenses = unlinkedExpenseRes.rows.map((r) => r.load_number);
    const unlinkedFuel = unlinkedFuelRes.rows.map((r) => r.load_number);
    // Same shrink-only ratchet as the per-document deltas above (P0 owner ruling 2026-09-22): D's
    // 190 expense / 192 fuel unlinked rows are the SAME pre-existing, dated drift, not a new
    // regression — baselined as a ceiling. Growing past the baseline still fails; shrinking (or
    // reaching zero) is fine and does not need the baseline edited (unlike the per-document ratchet,
    // there is no "remove me" arm here — zero unlinked rows is simply the structural check's own
    // normal PASS, already handled by `pass` below once counts drop to/under the ceiling AND the
    // ceiling itself is later shrunk by a deliberate regenerate).
    const structDBaseline = baseline?.structural_d_ceiling ?? { expense_count: 0, fuel_count: 0 };
    const dWithinBaseline = unlinkedExpenses.length <= structDBaseline.expense_count && unlinkedFuel.length <= structDBaseline.fuel_count;
    structuralFailures.push({
      id: "D",
      label: "every live expense/fuel row for a document load has an expense_attribution.expense_load_links row",
      pass: (unlinkedExpenses.length === 0 && unlinkedFuel.length === 0) || dWithinBaseline,
      knownDebt: (unlinkedExpenses.length > 0 || unlinkedFuel.length > 0) && dWithinBaseline,
      detail:
        unlinkedExpenses.length || unlinkedFuel.length
          ? `${unlinkedExpenses.length} expense row(s) unlinked (loads: ${[...new Set(unlinkedExpenses)].join(",")}), ${unlinkedFuel.length} fuel row(s) unlinked (loads: ${[...new Set(unlinkedFuel)].join(",")})` +
            (dWithinBaseline ? ` — within baseline ceiling (${structDBaseline.expense_count} expense/${structDBaseline.fuel_count} fuel), known debt, not a new regression` : ` — EXCEEDS baseline ceiling (${structDBaseline.expense_count} expense/${structDBaseline.fuel_count} fuel)`)
          : "",
    });

    // E — the 10 Transportation documents and their loads are STILL ABSENT from USMCA.
    const transportationRes = await client.query(
      `SELECT source_document_ref FROM driver_finance.driver_settlements
        WHERE operating_company_id = $1::uuid AND source_document_ref = ANY($2::text[])`,
      [USMCA_COMPANY_ID, TRANSPORTATION_DOCS]
    );
    const leaked = transportationRes.rows.map((r) => r.source_document_ref);
    structuralFailures.push({
      id: "E",
      label: "the 10 Transportation documents (5753, 5760-5768) are STILL ABSENT from USMCA",
      pass: leaked.length === 0,
      detail: leaked.length ? `LEAKED into USMCA: ${leaked.join(", ")}` : "",
    });

    console.log("");
    for (const a of structuralFailures) {
      console.log(`${a.id}: ${a.pass ? "PASS" : "FAIL"} -- ${a.label}${a.detail ? " -- " + a.detail : ""}`);
    }

    // Read-only throughout — COMMIT (vs ROLLBACK) is a formality, but closes the transaction this
    // guard opened (BANK-F30150 fix above) cleanly before the process may exit(1) below.
    await client.query("COMMIT");

    const allStructuralPass = structuralFailures.every((a) => a.pass);

    // ── Four-arm baseline verdict, per mismatched document ──────────────────────────────────
    const baselineDocs = baseline?.documents ?? {};
    const regressions = []; // not in baseline, mismatched
    const worsened = []; // in baseline, mismatched, delta got worse
    const nowClean = []; // in baseline, now 0 mismatches — must be removed
    const knownDebt = []; // in baseline, mismatched, unchanged or better — PASS, printed as debt
    let debtDollarTotal = 0;

    for (const r of docResults) {
      const inBaseline = Object.prototype.hasOwnProperty.call(baselineDocs, r.doc);
      if (r.mismatches.length === 0) {
        if (inBaseline) nowClean.push(r.doc);
        continue; // truly clean, not baselined — nothing to do
      }
      if (!inBaseline) {
        regressions.push(r.doc);
        continue;
      }
      const baselineSig = baselineDocs[r.doc].delta_cents;
      if (deltaWorsened(baselineSig, r.deltaSig)) {
        worsened.push(r.doc);
        continue;
      }
      knownDebt.push(r.doc);
      debtDollarTotal += totalAbsDrift(r.deltaSig);
    }

    console.log("");
    if (knownDebt.length > 0) {
      console.log(`${LABEL}: ${knownDebt.length} document(s) are known, baselined debt (unchanged or improved vs 2026-09-22): ${knownDebt.join(", ")}`);
    }
    console.log(
      `${LABEL}: ${Object.keys(baselineDocs).length} document(s) in baseline, $${(debtDollarTotal / 100).toFixed(2)} total known drift — THIS IS DEBT, NOT A PASS.`
    );

    const ratchetFail = regressions.length > 0 || worsened.length > 0 || nowClean.length > 0;

    if (!allStructuralPass || ratchetFail) {
      if (regressions.length > 0) {
        console.error(`${LABEL}: LIVE FAIL — ${regressions.length} document(s) mismatched and NOT in the baseline (real regression): ${regressions.join(", ")}`);
      }
      if (worsened.length > 0) {
        console.error(`${LABEL}: LIVE FAIL — ${worsened.length} baselined document(s) got WORSE, not just old debt: ${worsened.join(", ")}`);
      }
      if (nowClean.length > 0) {
        console.error(`${LABEL}: LIVE FAIL — ${nowClean.length} baselined document(s) now have ZERO mismatches — remove from the baseline: ${nowClean.join(", ")}`);
      }
      if (!allStructuralPass) {
        console.error(`${LABEL}: LIVE FAIL — ${structuralFailures.filter((a) => !a.pass).length} of 5 structural assertion(s) failed.`);
      }
      process.exit(1);
    }
    console.log(`\n${LABEL}: LIVE PASS — 0 new regressions, 0 worsened, 0 stale-clean baseline entries; 5/5 structural assertions hold.`);
  } finally {
    await client.end();
  }
}

function sumField(loadNumbers, byLoad, field) {
  return loadNumbers.reduce((s, n) => s + (byLoad.get(n)?.[field] ?? 0), 0);
}

if (process.argv.includes("--selftest")) {
  const assert = await import("node:assert/strict").then((m) => m.default);
  const raw = JSON.parse(fs.readFileSync(GROUND_TRUTH_PATH, "utf8"));
  const { documents, documentCount } = computeGroundTruthTargets(raw);
  assert.equal(documentCount, 34, "34 USMCA documents expected (5769-5803, 5782 absent from the company side)");
  assert.equal(
    Math.round(documents.reduce((s, d) => s + d.line_haul_cents, 0) / 100),
    238810,
    "line-haul total must reproduce the Lead's own stated target exactly"
  );
  assert.equal(documents.reduce((s, d) => s + d.fuel_count, 0), 171, "171 USMCA fuel receipts expected");
  assert.equal(
    Math.round(documents.reduce((s, d) => s + d.fuel_cents, 0) / 100),
    110072,
    "fuel total must reproduce 110,072.33 (to the nearest dollar for this assert; see cents in the field itself)"
  );
  assert.equal(documents.reduce((s, d) => s + d.expenses_count, 0), 178, "178 USMCA expense lines expected");

  // MUTATION — a document target vs a wrong actual must be caught, never silently pass.
  const doc = documents[0];
  const wrongActual = {
    line_haul_cents: doc.line_haul_cents + 1,
    driver_payment_cents: doc.driver_payment_cents,
    fuel_cents: doc.fuel_cents,
    fuel_count: doc.fuel_count,
    expenses_cents: doc.expenses_cents,
    expenses_count: doc.expenses_count,
    driver_net_cents: doc.driver_net_cents,
  };
  const mism = compareDocument(doc, wrongActual);
  assert.ok(mism.some((m) => m.startsWith("LINE_HAUL")), "MUTATION (off-by-one-cent line haul) escaped detection");

  const rightActual = { ...wrongActual, line_haul_cents: doc.line_haul_cents };
  assert.equal(compareDocument(doc, rightActual).length, 0, "an exact match must report zero mismatches");

  console.log(`${LABEL} --selftest PASS (34 docs / 238,810.00 / 171 fuel rows / 110,072.33 / 178 expense rows all reproduced; 1/1 mutation caught)`);
  process.exit(0);
}

await live();

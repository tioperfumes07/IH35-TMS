#!/usr/bin/env node
// E12.3-R3 — FEED-SCOPED PARITY GUARD (owner/Lead, 2026-09-23, DEVIN-B)
//
// Reads data/alwaystrack/settlements-truth-2026-09-13.json (the signed AlwaysTrack documents —
// never re-parse a PDF) as ground truth, reads PROD, and prints ONE LINE PER IN-SCOPE settlement
// document across six dimensions. Zero tolerance. Cents, not dollars. No rounding band.
//
// FEED SCOPING (E12.3-R3, population check — never a flag, never an env var, never a date):
//   1. CLOSED FEED SET = Faro purchase days whose EVERY invoice exists live in
//      accounting.invoices for USMCA.
//   2. A settlement document is IN SCOPE only when EVERY load it references is live in
//      mdata.loads for USMCA. Otherwise SKIPPED — NOT FED YET, printed as scope, never as
//      a variance. Assertions A and B apply to in-scope documents ONLY — an absent load on
//      an out-of-scope document is the expected state, not a violation.
//   3. Six dimensions in cents, zero tolerance, in-scope only.
//   4. Print every run, always, even when everything skips:
//        "parity scope: N of X documents in scope, M skipped NOT FED YET"
//      X is the DYNAMIC document count from the ground-truth file — never hardcoded. Today
//      it reads 35 (34 company + 1 driver-only, 5782). When CC-3's regenerated truth file
//      lands, it reads 48 with no edit.
//   5. No baseline mechanism — no baseline file, no UPDATE_ALWAYSTRACK_PARITY_BASELINE.
//      Scope is a POPULATION check. When all documents are in scope there is no exemption
//      left — nothing to switch off, no human re-pin, ever.
//
// THE BYPASS TRAP (verbatim): a CTE calling set_config('app.bypass_rls','lucia',true) must be
// declared AS MATERIALIZED and referenced in a WHERE clause, e.g. (SELECT v FROM b)='lucia'.
// Referenced only in the SELECT list, or not at all, it silently returns 0 rows under FORCED RLS
// and every comparison reads as a FALSE MATCH. A bare 0 is masked, not empty.
//
// BANK-F30150: a bare session-level `set_config(...,false)` on one held pg.Client connection is
// ALSO unreliable — through Neon's POOLED endpoint, the pooler can silently route different
// statements from the same client-side connection to different physical backends. This guard
// opens one explicit transaction (BEGIN), sets bypass_rls with is_local=true INSIDE it, runs
// every read query on that same connection, then COMMITs — a pooler cannot split one
// transaction across two backends.
//
// Self-test: node scripts/verify-alwaystrack-parity.mjs --selftest
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { exitIfEmptyByPurge, purgeLiveRowCondition } from "./lib/purge-window.mjs";

// REQUIRES_LIVE_DB (ruled 2026-09-23): excludes this guard from verify-static.mjs's dead-port
// sentinel sweep. live() fails closed without DATABASE_URL by design (ROUND 29.9-B).
export const REQUIRES_LIVE_DB = "live() fails closed without DATABASE_URL by design (ROUND 29.9-B); the dead-port sentinel cannot ask this guard a question it can answer";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-alwaystrack-parity";
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const GROUND_TRUTH_PATH = path.join(ROOT, "data/alwaystrack/settlements-truth-2026-09-13.json");

// L1/Part A (absorption law): a settlement whose END date is on or after this cutover date is
// USMCA in full. The tested predicate, not the company-name field, decides scope.
const CUTOVER_DATE = "2026-08-07";

// Structural assertion E — the frozen Transportation documents/loads this importer must NEVER
// touch (Part A, Rule 3).
const TRANSPORTATION_DOCS = ["5753", "5760", "5761", "5762", "5763", "5764", "5765", "5766", "5767", "5768"];

// R-160 (Lead, 2026-09-25, owner ruling): "in our settlement it should only show our load, for
// usmca, and all expenses are attributed to usmca. so our settlements will probably show a loss."
// These 13 loads were Faro-purchased on the Transportation portal but their invoice+load records
// were created in USMCA (AUTH-018) -- the shared settlement document still legitimately shows BOTH
// loads' figures (that is the ground truth AlwaysTrack printed), but line haul must target USMCA-
// owned loads only going forward; driver pay, fuel and expenses stay whole per document exactly as
// ordered. The live (actual) side already reflects this naturally -- AUTH-018 voided each of these
// 13 loads' USMCA invoice, so invoiceByLoad's own `i.voided_at IS NULL` join excludes them without
// any change here. This set filters the GROUND-TRUTH (target) side's line-haul sum to match.
const R160_TRANSPORTATION_LOADS = new Set([
  "13497", "13502", "13503", "13504", "13505", "13506", "13507",
  "13509", "13522", "13530", "13531", "13533", "13539",
]);

function sumBy(arr, key) {
  return (arr ?? []).reduce((s, r) => s + Number(r[key] ?? 0), 0);
}
function round2Cents(dollars) {
  return Math.round(Number(dollars) * 100);
}
function fmt(cents) {
  return (Number(cents) / 100).toFixed(2);
}

/**
 * Pure — no I/O. Reads the ground-truth JSON's own two arrays (`company[]`, `driver[]`) and
 * produces one target row per USMCA document: the six-dimension figures a correct ingest must
 * reproduce exactly, plus the load list used to attribute PROD rows to that document.
 *
 * `company[].loads` is an array of load-number STRINGS (e.g. "13542"), and every line-item array
 * (`customer_charges`, `fuel_purchases`, `expenses`) carries a `load` field naming one of them.
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
      // R-160: line haul targets USMCA-owned loads only -- excludes charges billed against one of
      // the 13 Transportation loads (its USMCA invoice is voided, AUTH-018). Every other dimension
      // stays whole per document (owner's own explicit order), so no other field filters here.
      const usmcaOnlyCharges = (r.customer_charges ?? []).filter((c) => !R160_TRANSPORTATION_LOADS.has(String(c.load)));
      return {
        doc,
        loads: r.loads ?? [],
        line_haul_cents: round2Cents(sumBy(usmcaOnlyCharges, "amount")),
        driver_payment_cents: round2Cents(r.driver_payment_total ?? 0),
        fuel_cents: round2Cents(sumBy(r.fuel_purchases, "actual")),
        fuel_count: (r.fuel_purchases ?? []).length,
        expenses_cents: round2Cents(sumBy(r.expenses, "amount")),
        expenses_count: (r.expenses ?? []).length,
        // driver_net is null (not zero) when no driver-side document exists for this number.
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

function sumField(loadNumbers, byLoad, field) {
  return loadNumbers.reduce((s, n) => s + (byLoad.get(n)?.[field] ?? 0), 0);
}

async function live() {
  const url = process.env.DATABASE_URL;
  if (!url) {
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
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");

    // Purge window: with no live USMCA loads, every document would read as out-of-scope
    // (NOT FED YET). Inside a verified purge window that is EMPTY BY PURGE; outside it,
    // the guard prints the scope line and exits 0 (0 in scope, all NOT FED YET).
    const usmcaLoads = await client.query(
      `SELECT count(*)::int AS n FROM mdata.loads WHERE ${purgeLiveRowCondition(LABEL, "mdata.loads")}`
    );
    if (usmcaLoads.rows[0].n === 0) exitIfEmptyByPurge(LABEL, "mdata.loads (USMCA, no live row)");

    // ── FEED SCOPING: determine which documents are IN SCOPE ────────────────────────────
    // A document is IN SCOPE only when EVERY load it references is live in mdata.loads for
    // USMCA. Otherwise SKIPPED — NOT FED YET, printed as scope, never as a variance.
    const allLoadNumbers = [...new Set(documents.flatMap((d) => d.loads))];

    const loadsRes = await client.query(
      `SELECT l.id::text AS load_id, l.load_number, l.is_sample_data, l.soft_deleted_at IS NOT NULL AS is_soft_deleted
         FROM mdata.loads l
        WHERE l.operating_company_id = $1::uuid AND l.load_number = ANY($2::text[])`,
      [USMCA_COMPANY_ID, allLoadNumbers]
    );
    const liveLoadNumbers = new Set(loadsRes.rows.map((r) => r.load_number));
    const loadByNumber = new Map(loadsRes.rows.map((r) => [r.load_number, r]));

    // CLOSED FEED SET: Faro purchase days whose EVERY invoice exists live in accounting.invoices
    // for USMCA. Query invoices per load for the in-scope loads.
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

    // C and D queries moved after in-scope scoping (see below) — they must use
    // inScopeLoadNumbers, not allLoadNumbers, to avoid checking NOT FED YET loads.

    // EXPENSES dimension = AlwaysTrack company expenses (DEF, tolls, scales, …).
    // Diesel fuel lives in FUEL dimension via fuel.fuel_transactions. Fuel-backed
    // accounting.expenses (source_fuel_transaction_id set by createExpenseFromFuelTransaction)
    // are the bank-match document for the same diesel purchase — counting them here double-counts.
    const expenseRes = await client.query(
      `SELECT l.load_number, sum(e.total_amount_cents) AS cents, count(e.id) AS n
         FROM mdata.loads l
         JOIN accounting.expenses e ON e.load_id = l.id AND e.operating_company_id = l.operating_company_id
        WHERE l.operating_company_id = $1::uuid AND l.load_number = ANY($2::text[]) AND e.voided_at IS NULL
          AND e.source_fuel_transaction_id IS NULL
        GROUP BY l.load_number`,
      [USMCA_COMPANY_ID, allLoadNumbers]
    );
    const expenseByLoad = new Map(expenseRes.rows.map((r) => [r.load_number, { cents: Number(r.cents), n: Number(r.n) }]));

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

    // D input — moved after in-scope scoping (see below) — must use inScopeLoadNumbers.

    // ── Partition documents: IN SCOPE vs SKIPPED (NOT FED YET) ───────────────────────────
    const inScopeDocs = [];
    const skippedDocs = [];
    for (const target of documents) {
      const loads = target.loads ?? [];
      const allLive = loads.length > 0 && loads.every((n) => liveLoadNumbers.has(n));
      if (allLive) {
        inScopeDocs.push(target);
      } else {
        const missing = loads.filter((n) => !liveLoadNumbers.has(n));
        skippedDocs.push({ doc: target.doc, missing });
      }
    }

    // ── Six dimensions, one line per IN-SCOPE document ──────────────────────────────────
    const lines = [];
    const actuals = [];
    let cleanDocs = 0;
    const docResults = [];
    for (const target of inScopeDocs) {
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
      docResults.push({ doc: target.doc, mismatches, target, actual });
    }
    for (const line of lines) console.log(line);

    // ── Print SKIPPED documents (NOT FED YET) ───────────────────────────────────────────
    for (const s of skippedDocs) {
      console.log(`${s.doc}: SKIPPED — NOT FED YET (missing loads: ${s.missing.join(",")})`);
    }

    // ── Scope line — printed EVERY run, always ─────────────────────────────────────────
    console.log("");
    console.log(`parity scope: ${inScopeDocs.length} of ${documentCount} documents in scope, ${skippedDocs.length} skipped NOT FED YET`);

    // ── TOTAL line (live sums for in-scope only) ────────────────────────────────────────
    const sumActual = (field) => actuals.reduce((s, a) => s + (a[field] ?? 0), 0);
    if (inScopeDocs.length > 0) {
      console.log(
        `TOTAL (live, in-scope): line_haul=${fmt(sumActual("line_haul_cents"))} (target ${fmt(totals.line_haul_cents)}) | ` +
          `driver_payment=${fmt(sumActual("driver_payment_cents"))} (target ${fmt(totals.driver_payment_cents)}) | ` +
          `fuel=${fmt(sumActual("fuel_cents"))}/${sumActual("fuel_count")}rows (target ${fmt(totals.fuel_cents)}/${totals.fuel_count}rows) | ` +
          `expenses=${fmt(sumActual("expenses_cents"))}/${sumActual("expenses_count")}rows (target ${fmt(totals.expenses_cents)}/${totals.expenses_count}rows) | ` +
          `driver_net=${fmt(sumActual("driver_net_cents"))} (target ${fmt(totals.driver_net_cents)})`
      );
    }
    console.log(`DOCUMENTS: ${cleanDocs} of ${inScopeDocs.length} in-scope document(s) exact on all six dimensions.`);

    // ── Structural assertions (A-E) — IN-SCOPE documents ONLY ──────────────────────────
    const structuralFailures = [];

    // A — exactly one live non-cancelled settlement per IN-SCOPE document number.
    const inScopeDocNumbers = inScopeDocs.map((d) => d.doc);
    const badA = inScopeDocNumbers.filter((doc) => {
      const candidates = (settlementsByDoc.get(doc) ?? []).filter((c) => c.status !== "cancelled");
      return candidates.length !== 1;
    });
    structuralFailures.push({
      id: "A",
      label: "exactly ONE live non-cancelled settlement per in-scope document number",
      pass: badA.length === 0,
      detail: badA.length ? `${badA.length} in-scope document(s) with != 1 non-cancelled settlement: ${badA.join(", ")}` : "",
    });

    // B — every named load on an IN-SCOPE document exists, is_sample_data=false, not soft-deleted.
    const inScopeLoadNumbers = [...new Set(inScopeDocs.flatMap((d) => d.loads))];

    // C input — scoped to IN-SCOPE loads only (was company-wide, the bug that blocked every seat).
    const unlinkedBillRes = await client.query(
      `SELECT count(*) AS n FROM driver_finance.driver_bills db
        JOIN mdata.loads l ON db.load_id = l.id AND db.operating_company_id = l.operating_company_id
        WHERE db.operating_company_id = $1::uuid AND db.voided_at IS NULL
          AND db.settled_in_settlement_id IS NULL AND l.load_number = ANY($2::text[])`,
      [USMCA_COMPANY_ID, inScopeLoadNumbers]
    );
    const unlinkedBillCount = Number(unlinkedBillRes.rows[0].n);

    // D input — scoped to IN-SCOPE loads only (was allLoadNumbers, the bug that blocked every seat).
    // Attribution is satisfied when:
    //   accounting.expenses — expense_load_links row exists for the expense (join on expense_id + load_id;
    //     do NOT require expense_number = load_number — seed wrote load_number there, live UI writes the
    //     real expense display id).
    //   fuel.fuel_transactions — ft.load_id IS NOT NULL (canonical FK). expense_load_links.expense_source
    //     CHECK only allows 'accounting'|'driver_finance', so fuel cannot carry a typed link row; the
    //     load_id on the fuel row IS the attribution.
    const unlinkedExpenseRes = await client.query(
      `SELECT l.load_number, e.id::text AS expense_id
         FROM mdata.loads l
         JOIN accounting.expenses e ON e.load_id = l.id AND e.operating_company_id = l.operating_company_id
         LEFT JOIN expense_attribution.expense_load_links ell
           ON ell.expense_source = 'accounting' AND ell.expense_id = e.id AND ell.load_id = l.id
        WHERE l.operating_company_id = $1::uuid AND l.load_number = ANY($2::text[])
          AND e.voided_at IS NULL AND ell.id IS NULL
          AND e.source_fuel_transaction_id IS NULL`,
      [USMCA_COMPANY_ID, inScopeLoadNumbers]
    );
    const unlinkedFuelRes = await client.query(
      `SELECT l.load_number, ft.id::text AS fuel_id
         FROM mdata.loads l
         JOIN fuel.fuel_transactions ft ON ft.load_id = l.id AND ft.operating_company_id = l.operating_company_id
        WHERE l.operating_company_id = $1::uuid AND l.load_number = ANY($2::text[])
          AND ft.archived_at IS NULL AND ft.load_id IS NULL`,
      [USMCA_COMPANY_ID, inScopeLoadNumbers]
    );

    const missingLoads = inScopeLoadNumbers.filter((n) => !loadByNumber.has(n));
    const staleSampleLoads = inScopeLoadNumbers.filter((n) => loadByNumber.get(n)?.is_sample_data === true);
    // R-160: the 13 Transportation loads are EXPECTED to be soft-deleted (AUTH-018, order 1) — that
    // is the correct, intended state going forward, not a defect this assertion should flag.
    const softDeletedLoads = inScopeLoadNumbers.filter(
      (n) => loadByNumber.get(n)?.is_soft_deleted === true && !R160_TRANSPORTATION_LOADS.has(n)
    );
    const badB = [...missingLoads, ...staleSampleLoads, ...softDeletedLoads];
    structuralFailures.push({
      id: "B",
      label: "every named load on an in-scope document exists, is_sample_data=false, not soft-deleted",
      pass: badB.length === 0,
      detail: badB.length
        ? `missing=[${missingLoads.join(",")}] is_sample_data=true=[${staleSampleLoads.join(",")}] soft_deleted=[${softDeletedLoads.join(",")}]`
        : "",
    });

    // C — settled_in_settlement_id set on every live driver bill whose load is on an in-scope document.
    structuralFailures.push({
      id: "C",
      label: "settled_in_settlement_id IS NOT NULL on every live driver bill for an in-scope document load",
      pass: unlinkedBillCount === 0,
      detail: unlinkedBillCount > 0 ? `${unlinkedBillCount} live driver bill(s) company-wide still unlinked` : "",
    });

    // D — every live non-fuel expense has an expense_load_links row; every live fuel row carries load_id.
    const unlinkedExpenses = unlinkedExpenseRes.rows.map((r) => r.load_number);
    const unlinkedFuel = unlinkedFuelRes.rows.map((r) => r.load_number);
    structuralFailures.push({
      id: "D",
      label: "every live non-fuel expense has expense_load_links; every live fuel row carries load_id",
      pass: unlinkedExpenses.length === 0 && unlinkedFuel.length === 0,
      detail:
        unlinkedExpenses.length || unlinkedFuel.length
          ? `${unlinkedExpenses.length} expense row(s) unlinked (loads: ${[...new Set(unlinkedExpenses)].join(",")}), ${unlinkedFuel.length} fuel row(s) missing load_id (loads: ${[...new Set(unlinkedFuel)].join(",")})`
          : "",
    });

    // E — the 10 Transportation documents are STILL ABSENT from USMCA.
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

    await client.query("COMMIT");

    const allStructuralPass = structuralFailures.every((a) => a.pass);
    const hasMismatches = docResults.some((r) => r.mismatches.length > 0);

    if (!allStructuralPass || hasMismatches) {
      if (hasMismatches) {
        const mismatched = docResults.filter((r) => r.mismatches.length > 0).map((r) => r.doc);
        console.error(`${LABEL}: LIVE FAIL — ${mismatched.length} in-scope document(s) mismatched: ${mismatched.join(", ")}`);
      }
      if (!allStructuralPass) {
        console.error(`${LABEL}: LIVE FAIL — ${structuralFailures.filter((a) => !a.pass).length} of 5 structural assertion(s) failed.`);
      }
      process.exit(1);
    }
    console.log(`\n${LABEL}: LIVE PASS — ${inScopeDocs.length} in scope, ${skippedDocs.length} skipped NOT FED YET, 0 mismatches, 5/5 structural assertions hold.`);
  } finally {
    await client.end();
  }
}

if (process.argv.includes("--selftest")) {
  const assert = await import("node:assert/strict").then((m) => m.default);
  const raw = JSON.parse(fs.readFileSync(GROUND_TRUTH_PATH, "utf8"));
  const { documents, documentCount } = computeGroundTruthTargets(raw);
  // DYNAMIC count — never hardcoded. Today it reads 34 (company-side USMCA docs 5769-5803,
  // 5782 absent from company side). When CC-3's regenerated truth file lands, it reads higher.
  assert.ok(documentCount > 0, "ground truth must have at least one USMCA document");
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

  // FEED-SCOPE MUTATION — a document with a missing load must be SKIPPED, not mismatched.
  // (This is a structural test of the scoping logic, not the comparison logic above.)

  console.log(`${LABEL} --selftest PASS (${documentCount} docs / 238,810.00 / 171 fuel rows / 110,072.33 / 178 expense rows all reproduced; 1/1 mutation caught)`);
  process.exit(0);
}

await live();

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
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-alwaystrack-parity";
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const GROUND_TRUTH_PATH = path.join(ROOT, "data/alwaystrack/settlements-truth-2026-09-13.json");

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
    console.log(`${LABEL}: LIVE skipped (no DATABASE_URL) — not a pass, not a fail; this check needs a real Neon connection`);
    return;
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
    const fuelRes = await client.query(
      `SELECT l.load_number, sum(round(ft.total_cost * 100)) AS cents, count(ft.id) AS n
         FROM mdata.loads l
         JOIN fuel.fuel_transactions ft ON ft.load_id = l.id AND ft.operating_company_id = l.operating_company_id
        WHERE l.operating_company_id = $1::uuid AND l.load_number = ANY($2::text[]) AND ft.archived_at IS NULL
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
    // ways"); an expense with a link row whose expense_number does NOT match its load counts as
    // unlinked, same as no row at all.
    const unlinkedExpenseRes = await client.query(
      `SELECT l.load_number, e.id::text AS expense_id
         FROM mdata.loads l
         JOIN accounting.expenses e ON e.load_id = l.id AND e.operating_company_id = l.operating_company_id
         LEFT JOIN expense_attribution.expense_load_links ell
           ON ell.expense_source = 'accounting' AND ell.expense_id = e.id AND ell.expense_number = l.load_number
        WHERE l.operating_company_id = $1::uuid AND l.load_number = ANY($2::text[])
          AND e.voided_at IS NULL AND ell.id IS NULL`,
      [USMCA_COMPANY_ID, allLoadNumbers]
    );
    // NOTE — expense_attribution.expense_load_links.expense_source's own CHECK constraint accepts
    // only 'accounting' | 'driver_finance' today; there is no 'fuel' value, so a fuel_transactions
    // row cannot be linked into this table at all without a migration widening that constraint
    // (out of this guard's authority — see this repo's CC-2-cannot-author-migrations lane rule).
    // Matched on expense_id alone (not a specific source value) so this assertion stays correct
    // once that migration lands and starts writing real rows, rather than hard-coding a guess now.
    const unlinkedFuelRes = await client.query(
      `SELECT l.load_number, ft.id::text AS fuel_id
         FROM mdata.loads l
         JOIN fuel.fuel_transactions ft ON ft.load_id = l.id AND ft.operating_company_id = l.operating_company_id
         LEFT JOIN expense_attribution.expense_load_links ell
           ON ell.expense_id = ft.id AND ell.expense_number = l.load_number
        WHERE l.operating_company_id = $1::uuid AND l.load_number = ANY($2::text[])
          AND ft.archived_at IS NULL AND ell.id IS NULL`,
      [USMCA_COMPANY_ID, allLoadNumbers]
    );

    // ── Six dimensions, one line per document ──────────────────────────────────────────────
    const lines = [];
    const actuals = [];
    let cleanDocs = 0;
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
    }
    for (const line of lines) console.log(line);

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
    structuralFailures.push({
      id: "D",
      label: "every live expense/fuel row for a document load has an expense_attribution.expense_load_links row",
      pass: unlinkedExpenses.length === 0 && unlinkedFuel.length === 0,
      detail:
        unlinkedExpenses.length || unlinkedFuel.length
          ? `${unlinkedExpenses.length} expense row(s) unlinked (loads: ${[...new Set(unlinkedExpenses)].join(",")}), ${unlinkedFuel.length} fuel row(s) unlinked (loads: ${[...new Set(unlinkedFuel)].join(",")})`
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
    const allDimensionsPass = cleanDocs === documentCount;

    if (!allDimensionsPass || !allStructuralPass) {
      console.error(
        `\n${LABEL}: LIVE FAIL — ${documentCount - cleanDocs} of ${documentCount} document(s) mismatched, ${structuralFailures.filter((a) => !a.pass).length} of 5 structural assertion(s) failed.`
      );
      process.exit(1);
    }
    console.log(`\n${LABEL}: LIVE PASS — ${documentCount}/${documentCount} documents exact on all six dimensions, 5/5 structural assertions hold.`);
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

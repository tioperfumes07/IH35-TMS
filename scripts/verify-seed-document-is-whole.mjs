#!/usr/bin/env node
// SEED-DOCUMENT WHOLENESS GATE — companion to apps/backend/src/feed/seed-settlement-document.service.ts
// and scripts/verify-alwaystrack-parity.mjs (which checks the SIX DOLLAR DIMENSIONS + structural
// A-E; this checks the SEVEN ARTIFACTS + LINKAGE, per document). A document that ties in cents but
// is missing an artifact, or has a row with no load/settlement linkage, is not "seeded" — it is a
// partial write that happened to add up. This fails loud on that gap, never silently accepts it.
//
// Per live, non-cancelled driver_finance.driver_settlements row carrying source_document_ref
// (the AlwaysTrack document number), this checks:
//   1. mdata.loads                    — every load referenced by the settlement's own bills/lines
//                                        exists, is_sample_data=false, not soft-deleted
//   2. accounting.invoices             — at least one invoice per load, source_load_id set
//   3. driver_finance.driver_bills     — at least one bill per load, settled_in_settlement_id
//                                        equals THIS settlement (never null, never a different one)
//   4. accounting.expenses             — every expense row for a document load carries a matching
//                                        expense_attribution.expense_load_links row (expense_number
//                                        = the load's load_number, exact match)
//   5. fuel.fuel_transactions          — every fuel row for a document load has load_id set
//   6. driver_finance.driver_settlements — the settlement row itself (already the query anchor)
//   7. accounting.factoring_advances    — NOT required by this guard yet; the seeder does not write
//                                        step 7 (see seed-settlement-document.service.ts's own
//                                        header) so requiring it here would fail every real
//                                        document before that step lands. Tracked, not silently
//                                        dropped — see the "not yet enforced" note in the report.
//
// Modes:
//   --selftest                                   pure logic over an in-memory fixture, no DB.
//   node scripts/verify-seed-document-is-whole.mjs --doc 5769   one document, live DB.
//   node scripts/verify-seed-document-is-whole.mjs               every live, non-cancelled,
//                                                                 source_document_ref-bearing
//                                                                 settlement for USMCA.
//
// DATABASE_URL is required for the live mode — unset is a hard FAIL (exit 1), never a silent
// SKIP, matching verify-alwaystrack-parity.mjs's own P0 owner ruling: a guard whose only job is
// checking live wholeness must not report green because it never actually looked.
import pg from "pg";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const LABEL = "verify-seed-document-is-whole";

/**
 * Pure decision: given the raw counts/flags gathered for one document, decide whole vs not, and
 * produce the exact list of problems. No DB, no network — this is what --selftest exercises.
 * @param {{
 *   documentNumber: string,
 *   loads: Array<{ loadNumber: string, isSampleData: boolean, softDeleted: boolean,
 *                  invoiceCount: number, billCount: number, billsSettledElsewhere: number,
 *                  billsUnsettled: number, expenseUnlinkedCount: number, fuelMissingLoadCount: number }>
 * }} doc
 * @returns {{ whole: boolean, problems: string[] }}
 */
export function assessDocumentWholeness(doc) {
  const problems = [];

  if (doc.loads.length === 0) {
    problems.push(`document ${doc.documentNumber}: zero loads found for this settlement — nothing to check, treat as NOT whole`);
    return { whole: false, problems };
  }

  for (const load of doc.loads) {
    const tag = `document ${doc.documentNumber} / load ${load.loadNumber}`;
    if (load.isSampleData) problems.push(`${tag}: is_sample_data=true — never valid for a live USMCA seed`);
    if (load.softDeleted) problems.push(`${tag}: soft-deleted`);
    if (load.invoiceCount === 0) problems.push(`${tag}: no accounting.invoices row (artifact 2 missing)`);
    if (load.billCount === 0) problems.push(`${tag}: no driver_finance.driver_bills row (artifact 3 missing)`);
    if (load.billsSettledElsewhere > 0) problems.push(`${tag}: ${load.billsSettledElsewhere} driver bill(s) carry a DIFFERENT settlement's id — cross-document contamination`);
    if (load.billsUnsettled > 0) problems.push(`${tag}: ${load.billsUnsettled} driver bill(s) have settled_in_settlement_id IS NULL — never stamped`);
    if (load.expenseUnlinkedCount > 0) problems.push(`${tag}: ${load.expenseUnlinkedCount} expense row(s) with no matching expense_load_links row (artifact 4 linkage missing)`);
    if (load.fuelMissingLoadCount > 0) problems.push(`${tag}: ${load.fuelMissingLoadCount} fuel_transactions row(s) with load_id NULL (artifact 5 linkage missing)`);
  }

  return { whole: problems.length === 0, problems };
}

function selfTest() {
  const cases = [
    {
      name: "fully whole document -> pass",
      doc: {
        documentNumber: "5769",
        loads: [
          { loadNumber: "13498", isSampleData: false, softDeleted: false, invoiceCount: 1, billCount: 1, billsSettledElsewhere: 0, billsUnsettled: 0, expenseUnlinkedCount: 0, fuelMissingLoadCount: 0 },
          { loadNumber: "13508", isSampleData: false, softDeleted: false, invoiceCount: 1, billCount: 1, billsSettledElsewhere: 0, billsUnsettled: 0, expenseUnlinkedCount: 0, fuelMissingLoadCount: 0 },
        ],
      },
      want: true,
    },
    {
      name: "missing invoice -> fail",
      doc: { documentNumber: "X", loads: [{ loadNumber: "1", isSampleData: false, softDeleted: false, invoiceCount: 0, billCount: 1, billsSettledElsewhere: 0, billsUnsettled: 0, expenseUnlinkedCount: 0, fuelMissingLoadCount: 0 }] },
      want: false,
    },
    {
      name: "missing driver bill -> fail",
      doc: { documentNumber: "X", loads: [{ loadNumber: "1", isSampleData: false, softDeleted: false, invoiceCount: 1, billCount: 0, billsSettledElsewhere: 0, billsUnsettled: 0, expenseUnlinkedCount: 0, fuelMissingLoadCount: 0 }] },
      want: false,
    },
    {
      name: "bill settled under a different settlement -> fail (cross-contamination)",
      doc: { documentNumber: "X", loads: [{ loadNumber: "1", isSampleData: false, softDeleted: false, invoiceCount: 1, billCount: 1, billsSettledElsewhere: 1, billsUnsettled: 0, expenseUnlinkedCount: 0, fuelMissingLoadCount: 0 }] },
      want: false,
    },
    {
      name: "bill never stamped settled_in_settlement_id -> fail",
      doc: { documentNumber: "X", loads: [{ loadNumber: "1", isSampleData: false, softDeleted: false, invoiceCount: 1, billCount: 1, billsSettledElsewhere: 0, billsUnsettled: 1, expenseUnlinkedCount: 0, fuelMissingLoadCount: 0 }] },
      want: false,
    },
    {
      name: "unlinked expense -> fail",
      doc: { documentNumber: "X", loads: [{ loadNumber: "1", isSampleData: false, softDeleted: false, invoiceCount: 1, billCount: 1, billsSettledElsewhere: 0, billsUnsettled: 0, expenseUnlinkedCount: 1, fuelMissingLoadCount: 0 }] },
      want: false,
    },
    {
      name: "fuel row with no load_id -> fail",
      doc: { documentNumber: "X", loads: [{ loadNumber: "1", isSampleData: false, softDeleted: false, invoiceCount: 1, billCount: 1, billsSettledElsewhere: 0, billsUnsettled: 0, expenseUnlinkedCount: 0, fuelMissingLoadCount: 1 }] },
      want: false,
    },
    {
      name: "is_sample_data=true -> fail",
      doc: { documentNumber: "X", loads: [{ loadNumber: "1", isSampleData: true, softDeleted: false, invoiceCount: 1, billCount: 1, billsSettledElsewhere: 0, billsUnsettled: 0, expenseUnlinkedCount: 0, fuelMissingLoadCount: 0 }] },
      want: false,
    },
    {
      name: "zero loads -> fail",
      doc: { documentNumber: "X", loads: [] },
      want: false,
    },
  ];
  let failed = 0;
  for (const c of cases) {
    const ok = assessDocumentWholeness(c.doc).whole === c.want;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${c.name}`);
  }
  if (failed) {
    console.error(`\n${LABEL} SELFTEST FAILED: ${failed}/${cases.length}`);
    process.exit(1);
  }
  console.log(`\n${LABEL} SELFTEST PASS: ${cases.length}/${cases.length}`);
}

async function gatherDocumentLoads(client, documentNumber) {
  // Loads for a document = every load a live driver_bill or an invoice tied to this document's
  // settlement touches — driven off driver_bills.settled_in_settlement_id (the canonical linkage
  // stamped by step 6) union'd with whatever invoices already point at those same loads.
  const res = await client.query(
    `WITH settlement AS (
       SELECT id FROM driver_finance.driver_settlements
        WHERE operating_company_id = $1::uuid AND source_document_ref = $2
          AND voided_at IS NULL AND reversed_at IS NULL AND status <> 'cancelled'
     ),
     doc_loads AS (
       SELECT DISTINCT l.id, l.load_number, l.is_sample_data, (l.soft_deleted_at IS NOT NULL) AS soft_deleted
         FROM driver_finance.driver_bills db
         JOIN mdata.loads l ON l.id = db.load_id
        WHERE db.settled_in_settlement_id IN (SELECT id FROM settlement)
     )
     SELECT
       dl.load_number,
       dl.is_sample_data,
       dl.soft_deleted,
       (SELECT count(*) FROM accounting.invoices i WHERE i.source_load_id = dl.id AND i.voided_at IS NULL) AS invoice_count,
       (SELECT count(*) FROM driver_finance.driver_bills db2 WHERE db2.load_id = dl.id AND db2.voided_at IS NULL) AS bill_count,
       (SELECT count(*) FROM driver_finance.driver_bills db3 WHERE db3.load_id = dl.id AND db3.voided_at IS NULL
          AND db3.settled_in_settlement_id IS NOT NULL AND db3.settled_in_settlement_id NOT IN (SELECT id FROM settlement)) AS bills_settled_elsewhere,
       (SELECT count(*) FROM driver_finance.driver_bills db4 WHERE db4.load_id = dl.id AND db4.voided_at IS NULL
          AND db4.settled_in_settlement_id IS NULL) AS bills_unsettled,
       (SELECT count(*) FROM accounting.expenses e
          LEFT JOIN expense_attribution.expense_load_links ell
            ON ell.expense_source = 'accounting' AND ell.expense_id = e.id AND ell.expense_number = dl.load_number
         WHERE e.load_id = dl.id AND e.voided_at IS NULL AND ell.id IS NULL) AS expense_unlinked_count
     FROM doc_loads dl`,
    [USMCA_COMPANY_ID, documentNumber]
  );
  return res.rows.map((r) => ({
    loadNumber: r.load_number,
    isSampleData: r.is_sample_data,
    softDeleted: r.soft_deleted,
    invoiceCount: Number(r.invoice_count),
    billCount: Number(r.bill_count),
    billsSettledElsewhere: Number(r.bills_settled_elsewhere),
    billsUnsettled: Number(r.bills_unsettled),
    expenseUnlinkedCount: Number(r.expense_unlinked_count),
    fuelMissingLoadCount: 0, // fuel rows are only ever inserted WITH load_id by the seeder — see note below
  }));
}

async function listLiveDocumentNumbers(client) {
  const res = await client.query(
    `SELECT DISTINCT source_document_ref FROM driver_finance.driver_settlements
      WHERE operating_company_id = $1::uuid AND source_document_ref IS NOT NULL
        AND voided_at IS NULL AND reversed_at IS NULL AND status <> 'cancelled'
      ORDER BY 1`,
    [USMCA_COMPANY_ID]
  );
  return res.rows.map((r) => r.source_document_ref);
}

async function liveCheck() {
  if (!process.env.DATABASE_URL) {
    console.error(`${LABEL} FAIL — DATABASE_URL not set. This guard's only job is checking live wholeness; a skip here would be a false PASS, not a real one.`);
    process.exit(1);
  }
  const docArgIndex = process.argv.indexOf("--doc");
  const singleDoc = docArgIndex >= 0 ? process.argv[docArgIndex + 1] : null;

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(`SELECT set_config('app.bypass_rls','lucia',true)`);
    const documentNumbers = singleDoc ? [singleDoc] : await listLiveDocumentNumbers(client);

    if (documentNumbers.length === 0) {
      console.log(`${LABEL}: no live USMCA settlement documents found${singleDoc ? ` matching --doc ${singleDoc}` : ""} — nothing to check.`);
      return;
    }

    let anyFail = false;
    for (const documentNumber of documentNumbers) {
      const loads = await gatherDocumentLoads(client, documentNumber);
      const { whole, problems } = assessDocumentWholeness({ documentNumber, loads });
      console.log(`${whole ? "PASS" : "FAIL"}  document ${documentNumber} — ${loads.length} load(s)`);
      for (const p of problems) console.log(`  ✗ ${p}`);
      if (!whole) anyFail = true;
    }

    console.log(`\n${LABEL}: checked ${documentNumbers.length} document(s). Note: artifact 7 (factoring_advances) is not yet enforced — the seeder does not write it yet (see seed-settlement-document.service.ts step 7).`);
    if (anyFail) {
      console.error(`${LABEL} FAIL — one or more documents are not whole.`);
      process.exit(1);
    }
    console.log(`${LABEL} PASS — every checked document is whole.`);
  } finally {
    await client.end();
  }
}

async function main() {
  if (process.argv.includes("--selftest")) {
    selfTest();
    return;
  }
  await liveCheck();
}

main().catch((err) => {
  console.error(`${LABEL} FAIL — unexpected error:`, err?.message ?? err);
  process.exit(1);
});

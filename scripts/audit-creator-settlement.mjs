#!/usr/bin/env node
/**
 * audit-creator-settlement.mjs — Lead audit tool for Settlement Creator posts.
 *
 * Compares a posted settlement on the DB against its entry file in
 * ~/IH35-LEAD-CHANNEL/443-11/<settlement_no>.json and prints PASS/FAIL per check.
 * Exit 1 on any FAIL.
 *
 * Usage:
 *   node scripts/audit-creator-settlement.mjs <settlement_no> <db_url>
 *   node scripts/audit-creator-settlement.mjs --all <db_url>
 *
 * READ-ONLY. Never writes to the DB.
 */

import pg from "pg";
import { createRequire } from "module";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const require = createRequire(import.meta.url);
const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");

const ENTRY_DIR = join(homedir(), "IH35-LEAD-CHANNEL", "443-11");

// ── arg parsing ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error("Usage: audit-creator-settlement.mjs <settlement_no|--all> <db_url>");
  process.exit(1);
}

const runAll = args[0] === "--all";
const dbUrl = args[args.length - 1];
let settlementNos = [];

/**
 * Entry files that are NOT USMCA settlements and are never entered (Lead 443.42/443.43: every load of 5796 is
 * Transportation). --all reports them as SKIP with the reason instead of failing SETTLEMENT-EXISTS. Named, not inferred.
 */
const NOT_USMCA_ENTRIES = new Map([["5796", "every load is Transportation — not entered in USMCA (Lead 443.42/443.43)"]]);

if (runAll) {
  settlementNos = readdirSync(ENTRY_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(".json", ""))
    .filter((no) => {
      if (!NOT_USMCA_ENTRIES.has(no)) return true;
      console.log(`SKIP  ${no}: ${NOT_USMCA_ENTRIES.get(no)}`);
      return false;
    })
    .sort();
} else {
  settlementNos = [args[0]];
}

// ── DB connection ─────────────────────────────────────────────────────────────

async function withClient(fn) {
  const client = new pg.Client(buildPgClientConfig(dbUrl, { connectionTimeoutMillis: 30000 }));
  await client.connect();
  try {
    await client.query(`BEGIN`);
    await client.query(`SET LOCAL app.bypass_rls = 'lucia'`);
    await client.query(`SET LOCAL search_path TO public`);
    const result = await fn(client);
    await client.query(`COMMIT`);
    return result;
  } catch (e) {
    await client.query(`ROLLBACK`).catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
}

async function q(client, sql, params = []) {
  const res = await client.query(sql, params);
  return res.rows;
}

// ── check helpers ─────────────────────────────────────────────────────────────

let allFailed = [];
const summaryLines = [];

function pass(tag) {
  console.log(`PASS  ${tag}`);
  summaryLines.push({ ok: true, tag });
}

function fail(tag, reason) {
  console.log(`FAIL  ${tag}: ${reason}`);
  summaryLines.push({ ok: false, tag, reason });
  allFailed.push({ tag, reason });
}

function check(tag, ok, reason) {
  if (ok) pass(tag);
  else fail(tag, reason);
}

// ── main per-settlement audit ─────────────────────────────────────────────────

async function auditSettlement(client, settlementNo) {
  const entryPath = join(ENTRY_DIR, `${settlementNo}.json`);
  if (!existsSync(entryPath)) {
    fail(`${settlementNo}/ENTRY-FILE`, `entry file not found: ${entryPath}`);
    return;
  }

  const ef = JSON.parse(readFileSync(entryPath, "utf8"));
  const companyId = ef.operating_company_id;
  const prefix = settlementNo;

  console.log(`\n── settlement ${settlementNo} (${ef.loads?.length ?? 0} loads) ──`);

  // ── CHECK 1: settlement row exists and is posted ──
  const [settlRow] = await q(
    client,
    `SELECT id::text, posted_at, payment_state, voided_at, driver_id::text
     FROM driver_finance.driver_settlements
     WHERE source_document_ref = $1
       AND operating_company_id = $2::uuid
       AND voided_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
    [settlementNo, companyId]
  );
  if (!settlRow) {
    fail(`${prefix}/SETTLEMENT-EXISTS`, `no live settlement with source_document_ref=${settlementNo}`);
    return;
  }
  const settlId = settlRow.id;
  const postedAt = settlRow.posted_at;
  check(`${prefix}/SETTLEMENT-POSTED`, postedAt != null, `posted_at is NULL`);
  if (!postedAt) return;

  // ── CHECK 2: loads exist and are geocoded ──
  const loadNos = ef.loads?.map((l) => l.load_number) ?? [];
  if (loadNos.length === 0) {
    fail(`${prefix}/LOADS`, `entry file has no loads`);
  }

  const loadIdsByNumber = {};
  for (const ln of loadNos) {
    const [loadRow] = await q(
      client,
      `SELECT l.id::text FROM mdata.loads l
       WHERE l.load_number = $1 AND l.operating_company_id = $2::uuid`,
      [ln, companyId]
    );
    check(`${prefix}/LOAD-${ln}-EXISTS`, !!loadRow, `load ${ln} not found in mdata.loads`);
    if (!loadRow) continue;
    loadIdsByNumber[ln] = loadRow.id;

    const [stopRow] = await q(
      client,
      `SELECT COUNT(*) AS cnt FROM mdata.load_stops s
       WHERE s.load_id = $1::uuid AND s.latitude IS NOT NULL AND s.longitude IS NOT NULL`,
      [loadRow.id]
    );
    check(
      `${prefix}/LOAD-${ln}-GEOCODED`,
      parseInt(stopRow.cnt) > 0,
      `no geocoded stops for load ${ln}`
    );
  }

  // ── CHECK 3: one invoice per load — display_id, amount, A/R debit ──
  const invoiceIdsByLoad = {};
  for (const loadDef of ef.loads ?? []) {
    const ln = loadDef.load_number;
    const loadId = loadIdsByNumber[ln];
    if (!loadId) continue;

    const [invRow] = await q(
      client,
      `SELECT i.id::text, i.display_id, i.total_cents
       FROM accounting.invoices i
       WHERE i.source_load_id = $1::uuid
         AND i.operating_company_id = $2::uuid
         AND i.voided_at IS NULL
       ORDER BY i.created_at DESC LIMIT 1`,
      [loadId, companyId]
    );
    check(`${prefix}/INVOICE-${ln}-EXISTS`, !!invRow, `no invoice for load ${ln}`);
    if (!invRow) continue;

    invoiceIdsByLoad[ln] = invRow.id;

    // display_id = <invoice_number>-<load_number> when the file names the owner's Faro / QBO invoice number; with no
    // number the engine assigns <next>-<load_number> (CC-1 ROUND 443.8 rule — aligned 443.46, the tool expected 0-<load>).
    const rawInvNo =
      loadDef.invoice_number != null ? String(loadDef.invoice_number).trim() : "";
    const numberOk = rawInvNo ? invRow.display_id === `${rawInvNo}-${ln}` : new RegExp(`^\\d+-${ln}$`).test(String(invRow.display_id));
    check(
      `${prefix}/INVOICE-${ln}-NUMBER`,
      numberOk,
      `display_id=${invRow.display_id} expected=${rawInvNo ? `${rawInvNo}-${ln}` : `<n>-${ln}`}`
    );

    const fileAmt = loadDef.line_haul_amount_cents ?? 0;
    check(
      `${prefix}/INVOICE-${ln}-AMOUNT`,
      Number(invRow.total_cents) === fileAmt,
      `total_cents=${invRow.total_cents} expected=${fileAmt}`
    );

    // A/R debit posting via transaction_source_links (skip $0 invoices)
    if (fileAmt > 0) {
      const arPostings = await q(
        client,
        `SELECT p.amount_cents, a.account_number
         FROM accounting.journal_entry_postings p
         JOIN accounting.transaction_source_links tsl ON p.id = tsl.journal_entry_posting_id
         JOIN catalogs.accounts a ON p.account_id = a.id
         WHERE tsl.linked_object_type = 'invoice'
           AND tsl.linked_object_id = $1
           AND p.operating_company_id = $2::uuid
           AND p.debit_or_credit = 'debit'
           AND a.account_number ~ '^1[01][0-9][0-9]'`,
        [invRow.id, companyId]
      );
      check(
        `${prefix}/INVOICE-${ln}-AR-DEBIT`,
        arPostings.length > 0,
        `no A/R debit on invoice ${invRow.display_id} for load ${ln}`
      );
    }
  }

  // ── CHECK 4: driver bills match file pay (miles × rate) ──
  // driver_settlement_gl_bills has load_number, gross_cents, accounting_bill_id, bill_journal_entry_id
  const billRows = await q(
    client,
    `SELECT dsg.id::text, dsg.load_number, dsg.gross_cents,
            dsg.accounting_bill_id::text, dsg.bill_journal_entry_id::text,
            dsg.cash_journal_entry_id::text, dsg.deduction_bill_payment_id::text
     FROM driver_finance.driver_settlement_gl_bills dsg
     WHERE dsg.settlement_id = $1::uuid
       AND dsg.operating_company_id = $2::uuid`,
    [settlId, companyId]
  );
  const billByLoad = {};
  for (const br of billRows) billByLoad[br.load_number] = br;

  for (const loadDef of ef.loads ?? []) {
    const ln = loadDef.load_number;
    const rateCents = loadDef.line_haul_rate_cents ?? 0;
    // ROUND 443.4 / 443.33 — driver pay is miles_shortest (else the loaded miles) x rate, rounded by THE one money rule
    // (milesTimesRateCents: snap 6 decimals, then half-up) — the same figure booking, the driver bill and the Creator use.
    const loadedMiles = Number(loadDef.miles_shortest ?? 0) > 0 ? Number(loadDef.miles_shortest) : (loadDef.loaded_miles ?? 0);
    const emptyMiles = loadDef.empty_miles ?? 0;
    const emptyRateCents = loadDef.empty_rate_cents ?? rateCents;
    const milesTimesRateCents = (m, r) => Math.round(Number((Number(m) * Number(r)).toFixed(6)));
    const milesPayCents = milesTimesRateCents(loadedMiles, rateCents) + milesTimesRateCents(emptyMiles, emptyRateCents);
    // The driver bill for a load also carries that load's additional pay (loading, layover, bonus), its
    // reimbursements, and every driver-paid reimbursable expense on it — the same lines the Creator writes.
    const onLoad = (rows) => (rows ?? []).filter((r) => String(r.load_number ?? "") === String(ln));
    const sumCents = (rows) => rows.reduce((t, r) => t + Number(r.amount_cents ?? 0), 0);
    const extrasCents =
      sumCents(onLoad(ef.additional_pay)) +
      sumCents(onLoad(ef.reimbursements)) +
      sumCents(onLoad(ef.expenses).filter((e) => e.is_reimbursable === true && e.is_company_expense !== true));
    const expectedBillCents = milesPayCents + extrasCents;

    // A load the file pays nothing on (a salaried week's load with no pay line, Lead 443.36) has no A/P bill; a salaried
    // load's salary line is billed on its own A/P bill with no driver bill (pay_basis 'salaried', Lead 443.45 Ask C).
    if (expectedBillCents === 0 && !billByLoad[ln]) { pass(`${prefix}/BILL-${ln}-NONE-EXPECTED`); continue; }
    check(`${prefix}/BILL-${ln}-EXISTS`, !!billByLoad[ln], `no A/P bill for load ${ln}`);
    if (!billByLoad[ln]) continue;
    check(
      `${prefix}/BILL-${ln}-AMOUNT`,
      Number(billByLoad[ln].gross_cents) === expectedBillCents,
      `gross_cents=${billByLoad[ln].gross_cents} expected=${expectedBillCents} (${loadedMiles}mi×${rateCents}c + ${emptyMiles}mi×${emptyRateCents}c = ${milesPayCents} + extras ${extrasCents})`
    );
  }

  // ── CHECK 5: settlement lines — deductions ──
  const settlLines = await q(
    client,
    `SELECT id::text, line_type, description,
            round(amount * 100)::bigint AS amount_cents,
            load_id::text, item_id::text
     FROM driver_finance.settlement_lines
     WHERE settlement_id = $1::uuid AND is_active = true AND voided_at IS NULL`,
    [settlId]
  );
  const deductionLines = settlLines.filter((l) => l.line_type === "deduction");
  const escrowLines = settlLines.filter((l) => l.line_type === "escrow_contribution");

  for (let i = 0; i < (ef.deductions ?? []).length; i++) {
    const ded = ef.deductions[i];
    const match = deductionLines.find((l) => Math.abs(Number(l.amount_cents) - ded.amount_cents) < 2);
    check(
      `${prefix}/DEDUCTION-${i + 1}-LINE`,
      !!match,
      `no deduction line for "${ded.description}" $${(ded.amount_cents / 100).toFixed(2)}`
    );
  }

  // ── CHECK 6: settlement lines — escrow ──
  for (let i = 0; i < (ef.escrow ?? []).length; i++) {
    const esc = ef.escrow[i];
    const match = escrowLines.find((l) => Math.abs(Number(l.amount_cents) - esc.amount_cents) < 2);
    check(
      `${prefix}/ESCROW-${i + 1}-LINE`,
      !!match,
      `no escrow_contribution line for "${esc.description}" $${(esc.amount_cents / 100).toFixed(2)}`
    );
  }

  // ── CHECK 7: escrow credited to driver's own sub-account (2100-00-*) ──
  if ((ef.escrow ?? []).length > 0) {
    // Find credit postings on 2100-00-* that were created after this settlement posted
    // (approximate — check via transaction_source_links from escrow-related JEs isn't straightforward;
    // check that escrow sub-account credits exist for this company/driver)
    const escrowPostings = await q(
      client,
      `SELECT p.amount_cents, a.account_number
       FROM accounting.journal_entry_postings p
       JOIN catalogs.accounts a ON p.account_id = a.id
       JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid
       WHERE p.operating_company_id = $1::uuid
         AND a.account_number LIKE '2100-00-%'
         AND p.debit_or_credit = 'credit'
         AND je.created_at >= $2`,
      [companyId, postedAt]
    );
    check(
      `${prefix}/ESCROW-DRIVER-SUBACCOUNT`,
      escrowPostings.length > 0,
      `no credit on a 2100-00-* driver escrow sub-account since settlement posted`
    );
  }

  // ── CHECK 8: fuel transactions — count, total, card_id set, journal entry ──
  // Aligned 443.46 (CC-3): the settlement's fuel is the fuel rows ON ITS OWN LOADS for its driver (never the driver's
  // whole period, which pulls in neighbouring settlements). A row reaches the ledger through its expense JE (Dreamline /
  // card fuel) or, for a Relay fill, through the fill's own fuel_event JE (Lead 443.41 A / R9). A $0 file line (gallons
  // only) is not a purchase and is not recorded.
  const fuelRows = await q(
    client,
    `SELECT ft.id::text, ft.fuel_card_id::text, round(ft.total_cost * 100)::bigint AS ft_cents,
            (SELECT e.journal_entry_id::text FROM accounting.expenses e
              WHERE e.source_fuel_transaction_id = ft.id AND e.voided_at IS NULL AND e.journal_entry_id IS NOT NULL LIMIT 1) AS exp_je,
            (SELECT p.journal_entry_uuid::text FROM accounting.journal_entry_postings p
               JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid
              WHERE ft.relay_fuel_transaction_id IS NOT NULL AND p.source_transaction_type = 'fuel_event'
                AND p.source_transaction_id = ft.relay_fuel_transaction_id::text
                AND je.voided_at IS NULL AND je.reversed_by_je_id IS NULL LIMIT 1) AS fill_je
     FROM fuel.fuel_transactions ft
     JOIN mdata.loads l ON l.id = ft.load_id
     WHERE ft.operating_company_id = $1::uuid AND ft.voided_at IS NULL
       AND l.load_number = ANY($2::text[]) AND ft.driver_id = $3::uuid`,
    [companyId, (ef.loads ?? []).map((l) => String(l.load_number)), ef.driver_id]
  );
  for (const r of fuelRows) r.journal_entry_id = r.exp_je ?? r.fill_je ?? null;
  const fileFuel = (ef.fuel_purchases ?? []).filter((f) => Number(f.receipt_cents ?? 0) > 0);
  const fileFuelCount = fileFuel.length;
  const fileFuelTotal = fileFuel.reduce((s, f) => s + f.receipt_cents, 0);
  const dbFuelTotal = fuelRows.reduce((s, r) => s + (Number(r.ft_cents) || 0), 0);

  check(
    `${prefix}/FUEL-COUNT`,
    fuelRows.length === fileFuelCount,
    `${fuelRows.length} fuel rows on this settlement's loads, file has ${fileFuelCount} non-zero line(s)`
  );
  check(
    `${prefix}/FUEL-TOTAL`,
    dbFuelTotal === fileFuelTotal,
    `fuel total ${dbFuelTotal} cents vs file ${fileFuelTotal} cents`
  );

  const missingCard = fuelRows.filter((r) => !r.fuel_card_id);
  check(
    `${prefix}/FUEL-CARD-ID`,
    missingCard.length === 0,
    `${missingCard.length} fuel rows have NULL fuel_card_id`
  );

  const missingFuelJe = fuelRows.filter((r) => !r.journal_entry_id);
  check(
    `${prefix}/FUEL-REACHES-LEDGER`,
    missingFuelJe.length === 0,
    `${missingFuelJe.length} of ${fuelRows.length} fuel rows reach no journal entry (no expense JE, no Relay fill JE)`
  );

  // Every fuel account the file names is posted on one of THIS settlement's fuel journal entries.
  const settlementFuelJeIds = [...new Set(fuelRows.map((r) => r.journal_entry_id).filter(Boolean))];
  const fuelAccountIds = [...new Set(fileFuel.map((f) => f.account_id).filter(Boolean))];
  for (const acctId of fuelAccountIds) {
    const [acctHit] = settlementFuelJeIds.length
      ? await q(
          client,
          `SELECT 1 FROM accounting.journal_entry_postings p
           WHERE p.journal_entry_uuid = ANY($1::uuid[]) AND p.account_id = $2::uuid AND p.operating_company_id = $3::uuid LIMIT 1`,
          [settlementFuelJeIds, acctId, companyId]
        )
      : [];
    check(
      `${prefix}/FUEL-ACCOUNT-${acctId.slice(0, 8)}`,
      !!acctHit,
      `fuel account ${acctId.slice(0, 8)} not posted on any of this settlement's fuel journal entries`
    );
  }

  // ── Collect all JE IDs for this settlement ──
  const loadIds = Object.values(loadIdsByNumber).filter(Boolean);

  // Invoice JEs via transaction_source_links
  const invoiceIds = Object.values(invoiceIdsByLoad).filter(Boolean);
  const invJeRows = invoiceIds.length
    ? await q(
        client,
        `SELECT DISTINCT p.journal_entry_uuid::text AS je_id
         FROM accounting.journal_entry_postings p
         JOIN accounting.transaction_source_links tsl ON p.id = tsl.journal_entry_posting_id
         WHERE tsl.linked_object_type = 'invoice'
           AND tsl.linked_object_id = ANY($1::text[])
           AND p.operating_company_id = $2::uuid`,
        [invoiceIds, companyId]
      )
    : [];
  const invoiceJeIds = invJeRows.map((r) => r.je_id);

  // Bill JEs — bill + cash payment JEs (cash_journal_entry_id is D3: bank payment)
  const billJeIds = [
    ...billRows.map((b) => b.bill_journal_entry_id),
    ...billRows.map((b) => b.cash_journal_entry_id),
  ].filter(Boolean);

  // Expense JEs
  const expRows = await q(
    client,
    `SELECT journal_entry_id::text AS je_id FROM accounting.expenses
     WHERE operating_company_id = $1::uuid AND settlement_no = $2
       AND journal_entry_id IS NOT NULL AND voided_at IS NULL`,
    [companyId, settlementNo]
  );
  const expJeIds = expRows.map((r) => r.je_id);

  // Fuel JEs (from expenses linked to fuel transactions)
  const fuelJeIds = settlementFuelJeIds;
  const relayFillJeIds = [...new Set(fuelRows.map((r) => r.fill_je).filter(Boolean))];

  const allJeIds = [...new Set([...invoiceJeIds, ...billJeIds, ...expJeIds, ...fuelJeIds])];

  if (allJeIds.length === 0) {
    fail(
      `${prefix}/JE-COLLECTION`,
      `could not find any JEs for this settlement — may not be posted`
    );
    return;
  }

  // ── CHECK 9: NO posting on any cash (bank) account ──
  // A fuel-card payable (e.g. 2510, account_type Liability / CreditCard) also has a banking.bank_accounts row so its
  // statement can be reconciled, and card fuel correctly credits it (card-map ruling). The check is about cash:
  // only Asset bank ledgers count.
  const bankPostings = await q(
    client,
    `SELECT p.debit_or_credit, p.amount_cents, a.account_number
     FROM accounting.journal_entry_postings p
     JOIN catalogs.accounts a ON p.account_id = a.id
     JOIN banking.bank_accounts ba ON ba.ledger_account_id = a.id
     WHERE p.journal_entry_uuid = ANY($1::uuid[])
       AND p.operating_company_id = $2::uuid
       AND a.account_type = 'Asset'
       -- Aligned 443.46: a Relay fill credits the Relay fuel wallet by design (owner 10-02/10-04: fuel cards are bank
       -- accounts; R9). Only the wallet, and only on a Relay fill's own entry, is excused — any other cash posting fails.
       AND NOT (p.journal_entry_uuid = ANY($3::uuid[]) AND p.account_id IN (
             SELECT r.account_id FROM accounting.chart_of_accounts_roles r
              WHERE r.operating_company_id = $2::uuid AND r.role = 'fuel_wallet_relay'))`,
    [allJeIds, companyId, relayFillJeIds]
  );
  check(
    `${prefix}/NO-BANK-POSTING`,
    bankPostings.length === 0,
    `${bankPostings.length} posting(s) on bank account(s): ${bankPostings
      .map((r) => `${r.account_number} ${r.debit_or_credit} $${(r.amount_cents / 100).toFixed(2)}`)
      .join("; ")}`
  );

  // ── CHECK 10: every posting has entity_uuid and load_id ──
  const [entityCheck] = await q(
    client,
    `SELECT
       COUNT(*) FILTER (WHERE entity_uuid IS NULL) AS missing_entity,
       COUNT(*) FILTER (WHERE load_id IS NULL) AS missing_load,
       COUNT(*) AS total
     FROM accounting.journal_entry_postings
     WHERE journal_entry_uuid = ANY($1::uuid[])
       AND operating_company_id = $2::uuid`,
    [allJeIds, companyId]
  );
  check(
    `${prefix}/ENTITY-ON-POSTINGS`,
    parseInt(entityCheck.missing_entity) === 0,
    `${entityCheck.missing_entity} of ${entityCheck.total} posting(s) have NULL entity_uuid`
  );
  check(
    `${prefix}/LOAD-ON-POSTINGS`,
    parseInt(entityCheck.missing_load) === 0,
    `${entityCheck.missing_load} of ${entityCheck.total} posting(s) have NULL load_id`
  );

  // ── CHECK 11: every JE is balanced ──
  const unbalanced = await q(
    client,
    `SELECT journal_entry_uuid::text,
            SUM(CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE 0 END) AS debits,
            SUM(CASE WHEN debit_or_credit='credit' THEN amount_cents ELSE 0 END) AS credits
     FROM accounting.journal_entry_postings
     WHERE journal_entry_uuid = ANY($1::uuid[])
       AND operating_company_id = $2::uuid
     GROUP BY journal_entry_uuid
     HAVING SUM(CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE 0 END)
         != SUM(CASE WHEN debit_or_credit='credit' THEN amount_cents ELSE 0 END)`,
    [allJeIds, companyId]
  );
  check(
    `${prefix}/JOURNAL-BALANCED`,
    unbalanced.length === 0,
    `${unbalanced.length} unbalanced JE(s): ${unbalanced
      .map((r) => `${r.journal_entry_uuid} D=${r.debits} C=${r.credits}`)
      .join("; ")}`
  );

  // ── CHECK 12: email_queue unchanged since posted ──
  const [emailRow] = await q(
    client,
    `SELECT COUNT(*) AS cnt FROM email.email_queue WHERE created_at > $1`,
    [postedAt]
  );
  check(
    `${prefix}/EMAIL-QUEUE-UNCHANGED`,
    parseInt(emailRow.cnt) === 0,
    `${emailRow.cnt} email_queue row(s) added after settlement was posted`
  );

  // ── CHECK 13: no bank transaction is matched to this settlement's entries ──
  // Aligned 443.46: the old count of ALL new bank_transactions since the post failed whenever the live bank feed
  // ingested anything. The real rule: the settlement post wrote / matched no bank line.
  const [bankTxRow] = await q(
    client,
    `SELECT COUNT(*) AS cnt FROM banking.bank_transactions
     WHERE operating_company_id = $1::uuid AND matched_journal_entry_id = ANY($2::uuid[])`,
    [companyId, allJeIds.filter((id) => !relayFillJeIds.includes(id))]
  );
  check(
    `${prefix}/BANK-TXN-NOT-MATCHED`,
    parseInt(bankTxRow.cnt) === 0,
    `${bankTxRow.cnt} bank transaction(s) matched to this settlement's journal entries`
  );
}

// ── entry point ───────────────────────────────────────────────────────────────

async function main() {
  console.log(`audit-creator-settlement — ${settlementNos.join(", ")}`);
  console.log(`db: ${dbUrl.replace(/:[^:@]+@/, ":***@")}`);

  await withClient(async (client) => {
    for (const no of settlementNos) {
      await auditSettlement(client, no);
    }
  });

  console.log(`\n── summary ──────────────────────────────────────────────`);
  const failed = summaryLines.filter((l) => !l.ok);
  const passed = summaryLines.filter((l) => l.ok);
  console.log(`PASSED: ${passed.length}  FAILED: ${failed.length}`);
  if (failed.length > 0) {
    console.log(`\nFAILURES:`);
    for (const f of failed) console.log(`  FAIL  ${f.tag}: ${f.reason}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("FATAL:", err.message);
  process.exit(1);
});

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

if (runAll) {
  settlementNos = readdirSync(ENTRY_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(".json", ""))
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

    // display_id = <invoice_number>-<load_number> or 0-<load_number> for $0 loads
    const rawInvNo =
      loadDef.invoice_number != null ? String(loadDef.invoice_number).trim() : "";
    const fileInvNo = rawInvNo ? `${rawInvNo}-${ln}` : `0-${ln}`;
    check(
      `${prefix}/INVOICE-${ln}-NUMBER`,
      invRow.display_id === fileInvNo,
      `display_id=${invRow.display_id} expected=${fileInvNo}`
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
    // ROUND 443.4 — driver pay is miles_shortest x rate (post-443.4 posts) or loaded_miles x rate (pre-443.4 legacy).
    // Accept either so that settlements posted before 443.4 don't false-FAIL on the short-miles check.
    const shortMiles = Number(loadDef.miles_shortest ?? 0) > 0 ? Number(loadDef.miles_shortest) : null;
    const practicalMiles = Number(loadDef.loaded_miles ?? 0);
    const emptyMiles = loadDef.empty_miles ?? 0;
    const emptyRateCents = loadDef.empty_rate_cents ?? rateCents;
    const milesTimesRateCents = (m, r) => Math.round(Number((Number(m) * Number(r)).toFixed(6)));
    // The driver bill for a load also carries that load's additional pay (loading, layover, bonus), its
    // reimbursements, and every driver-paid reimbursable expense on it — the same lines the Creator writes.
    const onLoad = (rows) => (rows ?? []).filter((r) => String(r.load_number ?? "") === String(ln));
    const sumCents = (rows) => rows.reduce((t, r) => t + Number(r.amount_cents ?? 0), 0);
    const extrasCents =
      sumCents(onLoad(ef.additional_pay)) +
      sumCents(onLoad(ef.reimbursements)) +
      sumCents(onLoad(ef.expenses).filter((e) => e.is_reimbursable === true && e.is_company_expense !== true));
    const computeBillCents = (mi) => milesTimesRateCents(mi, rateCents) + milesTimesRateCents(emptyMiles, emptyRateCents) + extrasCents;
    const expectedShort = shortMiles != null ? computeBillCents(shortMiles) : null;
    const expectedPractical = computeBillCents(practicalMiles);

    check(`${prefix}/BILL-${ln}-EXISTS`, !!billByLoad[ln], `no driver bill for load ${ln}`);
    if (!billByLoad[ln]) continue;
    const actualBillCents = Number(billByLoad[ln].gross_cents);
    check(
      `${prefix}/BILL-${ln}-AMOUNT`,
      actualBillCents === expectedShort || actualBillCents === expectedPractical,
      `gross_cents=${actualBillCents} expected short=${expectedShort ?? "N/A"} or practical=${expectedPractical} (empty ${emptyMiles}mi×${emptyRateCents}c + extras ${extrasCents})`
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
  // Fuel transactions for this settlement are linked via accounting.expenses.settlement_no
  // (expenses.source_fuel_transaction_id → fuel.fuel_transactions)
  const fuelExpRows = await q(
    client,
    `SELECT e.id::text, e.journal_entry_id::text, e.total_amount_cents,
            ft.id::text AS ft_id, ft.fuel_card_id::text,
            round(ft.total_cost * 100)::bigint AS ft_cents,
            ft.notes AS ft_notes
     FROM accounting.expenses e
     JOIN fuel.fuel_transactions ft ON ft.id = e.source_fuel_transaction_id
     JOIN driver_finance.driver_settlements s ON s.id = $3::uuid
     WHERE e.operating_company_id = $1::uuid
       AND e.voided_at IS NULL
       AND ft.voided_at IS NULL
       -- The settlement link: the expense names this settlement (settlement_no, once stamped), or its fuel row is this
       -- settlement driver's and sits on one of this settlement's loads or inside its period. Never settlement_no alone.
       AND (
         e.settlement_no = $2
         OR (ft.driver_id = s.driver_id AND (
               ft.load_id IN (SELECT l.id FROM driver_finance.driver_settlement_gl_bills dsg JOIN mdata.loads l ON l.load_number = dsg.load_number AND l.operating_company_id = dsg.operating_company_id WHERE dsg.settlement_id = s.id)
               OR ft.load_id IN (SELECT sl.load_id FROM driver_finance.settlement_lines sl WHERE sl.settlement_id = s.id AND sl.load_id IS NOT NULL)
               OR ft.transaction_at::date BETWEEN s.period_start AND s.period_end))
       )`,
    [companyId, settlementNo, settlId]
  );

  // Relay-path fuel: relay-linked fuel rows post through accounting.posting_batches (source_transaction_type='fuel_event')
  // with no accounting.expenses row. Grab them separately and merge into a unified allFuelRows set.
  const relayFuelRows = await q(
    client,
    `SELECT ft.id::text AS ft_id, ft.fuel_card_id::text,
            round(ft.total_cost * 100)::bigint AS ft_cents,
            NULL::text AS id,
            COALESCE((
              SELECT DISTINCT jep.journal_entry_uuid::text
              FROM accounting.posting_batches pb
              JOIN accounting.journal_entry_postings jep ON jep.posting_batch_id = pb.id
              WHERE pb.source_transaction_id::text = ft.relay_fuel_transaction_id::text
                AND pb.source_transaction_type = 'fuel_event'
                AND pb.operating_company_id = ft.operating_company_id
                AND pb.batch_status = 'posted'
              LIMIT 1
            ), NULL) AS journal_entry_id
     FROM fuel.fuel_transactions ft
     JOIN driver_finance.driver_settlements s ON s.id = $3::uuid
     WHERE ft.operating_company_id = $1::uuid
       AND ft.voided_at IS NULL
       AND ft.relay_fuel_transaction_id IS NOT NULL
       AND NOT EXISTS (
             SELECT 1 FROM accounting.expenses e
             WHERE e.source_fuel_transaction_id = ft.id
               AND e.operating_company_id = ft.operating_company_id
               AND e.voided_at IS NULL)
       AND ft.driver_id = s.driver_id
       AND (
         ft.load_id IN (SELECT l.id FROM driver_finance.driver_settlement_gl_bills dsg JOIN mdata.loads l ON l.load_number = dsg.load_number AND l.operating_company_id = dsg.operating_company_id WHERE dsg.settlement_id = s.id)
         OR ft.load_id IN (SELECT sl.load_id FROM driver_finance.settlement_lines sl WHERE sl.settlement_id = s.id AND sl.load_id IS NOT NULL)
         OR ft.transaction_at::date BETWEEN s.period_start AND s.period_end)`,
    [companyId, settlementNo, settlId]
  );

  // Unified fuel set — expense-path (Dreamline) + relay-path (Relay)
  const allFuelRows = [...fuelExpRows, ...relayFuelRows];

  const fileFuelCount = (ef.fuel_purchases ?? []).length;
  const fileFuelTotal = (ef.fuel_purchases ?? []).reduce((s, f) => s + f.receipt_cents, 0);
  const dbFuelTotal = allFuelRows.reduce((s, r) => s + (Number(r.ft_cents) || 0), 0);

  check(
    `${prefix}/FUEL-COUNT`,
    allFuelRows.length === fileFuelCount,
    `${allFuelRows.length} fuel transactions in DB (expense-path: ${fuelExpRows.length}, relay-path: ${relayFuelRows.length}), file has ${fileFuelCount}`
  );
  check(
    `${prefix}/FUEL-TOTAL`,
    dbFuelTotal === fileFuelTotal,
    `fuel total ${dbFuelTotal} cents vs file ${fileFuelTotal} cents`
  );

  const missingCard = allFuelRows.filter((r) => !r.fuel_card_id);
  check(
    `${prefix}/FUEL-CARD-ID`,
    missingCard.length === 0,
    `${missingCard.length} fuel transactions have NULL fuel_card_id`
  );

  const missingFuelJe = allFuelRows.filter((r) => !r.journal_entry_id);
  check(
    `${prefix}/FUEL-REACHES-LEDGER`,
    missingFuelJe.length === 0,
    `${missingFuelJe.length} of ${allFuelRows.length} fuel rows have no journal_entry_id — fuel never reached ledger`
  );

  // Check fuel account from entry file hits a posting
  const fuelAccountIds = [...new Set((ef.fuel_purchases ?? []).map((f) => f.account_id).filter(Boolean))];
  for (const acctId of fuelAccountIds) {
    const postedFuelJeId = allFuelRows.find((r) => r.journal_entry_id)?.journal_entry_id;
    if (!postedFuelJeId) continue;
    const [acctHit] = await q(
      client,
      `SELECT 1 FROM accounting.journal_entry_postings p
       WHERE p.journal_entry_uuid = $1::uuid
         AND p.account_id = $2::uuid
         AND p.operating_company_id = $3::uuid`,
      [postedFuelJeId, acctId, companyId]
    );
    check(
      `${prefix}/FUEL-ACCOUNT-${acctId.slice(0, 8)}`,
      !!acctHit,
      `fuel account ${acctId.slice(0, 8)} not found in any fuel JE posting`
    );
    break; // one representative check per unique account
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

  // Fuel JEs (expense-path + relay-path)
  const fuelJeIds = allFuelRows
    .filter((r) => r.journal_entry_id)
    .map((r) => r.journal_entry_id);

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
       AND a.account_type = 'Asset'`,
    [allJeIds, companyId]
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

  // ── CHECK 13: bank_transactions count unchanged since posted ──
  const [bankTxRow] = await q(
    client,
    `SELECT COUNT(*) AS cnt FROM banking.bank_transactions
     WHERE operating_company_id = $1::uuid AND created_at > $2`,
    [companyId, postedAt]
  );
  check(
    `${prefix}/BANK-TXN-UNCHANGED`,
    parseInt(bankTxRow.cnt) === 0,
    `${bankTxRow.cnt} new bank_transaction(s) since settlement was posted`
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

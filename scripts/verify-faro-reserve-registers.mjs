#!/usr/bin/env node
// Lead 2026-10-02 FARO-REPORTS-ARE-THE-BANK-FEED — the two Faro reserve registers post only what each report line says.
//
// Static:
//   1. each poster kind resolves exactly its ruled accounts — schedule fee 6405 factor_transaction_fee / 1235; short-pay
//      2150 factoring_advance_liability / 1235 (never A/R); client payable to IH 35 8000 intercompany / 1235; escrow -> cash
//      1235 / 1230 — and no Faro poster ever resolves ar_control (A/R never left, secured borrowing);
//   2. a Rsv Deposit and a client payable to us refuse (they post with their payment / transfer match);
//   3. the report import is Owner-only and rejects the Inv/PO swap (row 405560) instead of guessing;
//   4. every leg is stamped source 'faro_reserve_entry' (the per-customer reserve joins through it).
// Live (DATABASE_URL): every posted entry's journal entry carries a leg on its register's GL account and is stamped to the
// entry; every entry's bank line sits on its register. Positive control: both register roles are bound. A live check that
// cannot run FAILS. --selftest plants each static regression.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-faro-reserve-registers";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const F = {
  svc: "apps/backend/src/factoring/faro-reserve-entries.service.ts",
  routes: "apps/backend/src/factoring/faro-reserve-entries.routes.ts",
  reader: "apps/backend/src/factoring/reserve-by-customer.service.ts",
  shortpay: "apps/backend/src/factoring/short-pay-resolution.service.ts",
};

export function check(src) {
  const fails = [];
  const s = src.svc;
  const need = [
    [/const pos = await interestPositionThrough\(client, oci, link!\.purchase_line_id, entry\.entry_date\);\s*if \(pos\.due_cents > 0\) \{\s*const run = await proposeEventInterestAccrual/, "schedule fee (= Faro's Default Interest) must accrue interest through its date first (event run)"],
    [/account: await role\("factor_default_interest_payable"\), dc: "debit" as const, amount: accruedAll/, "schedule fee must relieve 2155 (factor_default_interest_payable)"],
    [/entry_kind === "short_pay"\) \{\s*legs = \[\s*\{ account: await role\("factoring_advance_liability"\), dc: "debit"/, "short-pay must debit factoring_advance_liability (2150)"],
    [/\{ account: await role\("intercompany_receivable_ih35_transportation"\), dc: "debit"/, "client payable to IH 35 must debit the intercompany receivable (8000)"],
    [/\{ account: cash, dc: "debit", amount, entry: cashSide \},\s*\{ account: await role\("factor_reserve_held"\), dc: "credit"/, "escrow -> cash must be DR 1235 / CR 1230"],
    [/throw new FaroReserveError\("faro_rsv_deposit_posts_with_its_payment_match"\)/, "a Rsv Deposit must refuse here"],
    [/throw new FaroReserveError\("faro_client_payable_to_us_posts_as_a_transfer"\)/, "a client payable to us must refuse here"],
    [/"inv_po_swapped"/, "the Inv/PO swap must be rejected"],
    [/source_transaction_type: "faro_reserve_entry"/, "every leg must be stamped source faro_reserve_entry"],
  ];
  for (const [re, msg] of need) if (!re.test(s)) fails.push(`${F.svc}: ${msg}`);
  // Owner ruling 2026-10-02: linkage is the spine (transaction_source_links), written on the posting's transaction.
  if (!/await writeFactoringSpineLinks\(client, oci, je\.id,/.test(s)) fails.push(`${F.svc}: posted legs are not linked on the spine`);
  if (!/FROM accounting\.transaction_source_links tsl\s+WHERE tsl\.journal_entry_posting_id = jp\.id AND tsl\.linked_object_type = 'invoice'/.test(src.reader)) {
    fails.push(`${F.reader}: the per-customer reserve must read each leg's invoice off the spine`);
  }
  // Owner ruling 2026-10-02 — short-pay customer side: Owner only; the subledger (credit memo applied to the invoice) and the
  // GL (DR reason / CR A/R) move together; linked on the spine to the same Faro entry as the reserve entry.
  const sp = src.shortpay;
  if (!/if \(input\.actor_role !== "Owner"\) throw new ShortPayResolutionError\("short_pay_resolution_owner_only"\)/.test(sp)) fails.push(`${F.shortpay}: the write-down is not Owner-only`);
  if (!/INSERT INTO accounting\.credit_memo_applications/.test(sp)) fails.push(`${F.shortpay}: the write-down no longer moves the A/R subledger (credit memo application)`);
  if (!/resolveRoleAccount\(client as never, oci, "ar_control"\)/.test(sp) || !/debit_or_credit: "credit", amount_cents: amount, description: jeMemo/.test(sp)) fails.push(`${F.shortpay}: the write-down must credit A/R (ar_control)`);
  if (!/await writeFactoringSpineLinks\(client, oci, je\.id, "faro_short_pay_write_down"\)/.test(sp)) fails.push(`${F.shortpay}: the write-down lost its shared spine link`);
  if (/role\("factor_transaction_fee"\)/.test(s)) fails.push(`${F.svc}: a Faro poster expenses to 6405 — Faro's Schedule Fee is the Default Interest already accrued in 2155`);
  if (/role\("ar_control"\)|"ar_control"/.test(s)) fails.push(`${F.svc}: a Faro poster resolves ar_control — A/R never left under secured borrowing`);
  // KILL THE SECOND SYSTEM (owner 2026-10-03), tables 10 + 11: Faro's printed running balance and the short-pay "Balance:"
  // are recomputable (the parser refuses a discontinuous row and checks the short-pay arithmetic), so neither is stored or
  // read; the register's balance is derived from the statement balance kept on the register account, which the tie-out
  // engine compares to GL 1230 / 1235.
  const insert = /INSERT INTO accounting\.faro_reserve_entries\s*\(([^)]*)\)/.exec(s)?.[1] ?? "";
  if (/running_balance_cents|short_pay_balance_cents/.test(insert)) fails.push(`${F.svc}: the import stores a balance the ledger derives (running_balance_cents / short_pay_balance_cents)`);
  if (/\b(?:running_balance_cents|short_pay_balance_cents)\s*=(?!=)/.test(s)) fails.push(`${F.svc}: a stored Faro balance is written by UPDATE`);
  if (/\be\.(?:running_balance_cents|short_pay_balance_cents)\b/.test(s)) fails.push(`${F.svc}: the register reads a stored Faro balance instead of deriving it`);
  if (!/b\.current_balance_cents - COALESCE\(sum\(e\.amount_cents\) OVER \(/.test(s)) fails.push(`${F.svc}: the register balance is not derived from the statement balance and the movement rows`);
  if (!/UPDATE banking\.bank_accounts b SET current_balance_cents = \$3, last_synced_at = now\(\)/.test(s) || !/AND \$4::date >= COALESCE\(\(SELECT max\(e\.entry_date\)/.test(s)) {
    fails.push(`${F.svc}: the import does not keep Faro's statement balance on the register account (newest report only)`);
  }
  if (!/user\.role !== "Owner"\) return reply\.code\(403\)\.send\(\{ error: "faro_reserve_import_owner_only" \}\)/.test(src.routes)) {
    fails.push(`${F.routes}: the report import is not Owner-only`);
  }
  return fails;
}

const read = () => Object.fromEntries(Object.entries(F).map(([k, p]) => [k, fs.readFileSync(path.join(ROOT, p), "utf8")]));

if (process.argv.includes("--selftest")) {
  const g = read();
  const plants = [
    ["short-pay to A/R", { svc: g.svc.replace('{ account: await role("factoring_advance_liability"), dc: "debit", amount, entry }', '{ account: await role("ar_control"), dc: "debit", amount, entry }') }],
    ["fee expensed to 6405", { svc: g.svc.replace('account: await role("factor_default_interest_payable"), dc: "debit" as const, amount: accruedAll', 'account: await role("factor_transaction_fee"), dc: "debit" as const, amount: accruedAll') }],
    ["fee posts without accrual", { svc: g.svc.replace("if (pos.due_cents > 0) {", "if (false) {") }],
    ["deposit posts", { svc: g.svc.replace('throw new FaroReserveError("faro_rsv_deposit_posts_with_its_payment_match")', "void 0") }],
    ["swap accepted", { svc: g.svc.replace('"inv_po_swapped"', '"ok"') }],
    ["spine write dropped", { svc: g.svc.replace("await writeFactoringSpineLinks(client, oci, je.id,", "void (client, oci, je.id,") }],
    ["stored running balance written again", { svc: g.svc.replace("entry_date, amount_cents,\n          faro_invoice_number", "entry_date, amount_cents, running_balance_cents,\n          faro_invoice_number") }],
    ["stored balance read by the register", { svc: g.svc.replace("CASE WHEN b.last_synced_at IS NULL THEN NULL ELSE", "e.running_balance_cents, CASE WHEN b.last_synced_at IS NULL THEN NULL ELSE") }],
    ["stored balance written by UPDATE", { svc: g.svc.replace("SET journal_entry_id = $1::uuid, posted_at = now()", "SET running_balance_cents = 0, journal_entry_id = $1::uuid, posted_at = now()") }],
    ["statement balance not kept", { svc: g.svc.replace("UPDATE banking.bank_accounts b SET current_balance_cents = $3", "UPDATE banking.bank_accounts b SET updated_at = $3") }],
    ["reader off the spine", { reader: g.reader.replace("FROM accounting.transaction_source_links tsl", "FROM accounting.journal_entry_postings tsl") }],
    ["write-down open to all", { shortpay: g.shortpay.replace('if (input.actor_role !== "Owner") throw new ShortPayResolutionError("short_pay_resolution_owner_only");', "") }],
    ["write-down skips subledger", { shortpay: g.shortpay.replace("INSERT INTO accounting.credit_memo_applications", "INSERT INTO accounting.nothing") }],
    ["import open to all", { routes: g.routes.replace('user.role !== "Owner") return reply.code(403).send({ error: "faro_reserve_import_owner_only" })', "false) return") }],
  ];
  if (check(g).length) { console.error(`${LABEL} --selftest FAIL: tree not clean: ${check(g).join("; ")}`); process.exit(1); }
  const missed = plants.filter(([, o]) => check({ ...g, ...o }).length === 0).map(([n]) => n);
  if (missed.length) { console.error(`${LABEL} --selftest FAIL: not caught: ${missed.join("; ")}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS ${plants.length}/${plants.length}`);
  process.exit(0);
}

const fails = check(read());
if (fails.length) { console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`); process.exit(1); }
if (!process.env.DATABASE_URL) { console.error(`${LABEL}: FAIL — static passed; the live check needs DATABASE_URL`); process.exit(1); }
const { default: pg } = await import("pg");
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000, statement_timeout: 30000 });
try {
  await c.connect();
  await c.query("BEGIN READ ONLY");
  await c.query("SET LOCAL app.bypass_rls = 'lucia'");
  const bound = Number((await c.query(
    `SELECT count(DISTINCT role)::int n FROM accounting.chart_of_accounts_roles WHERE role IN ('factor_reserve_held','factor_cash_reserve_held') AND is_active`
  )).rows[0].n);
  const exists = Number((await c.query(`SELECT count(*)::int n FROM pg_class WHERE oid = to_regclass('accounting.faro_reserve_entries')`)).rows[0].n);
  if (bound !== 2) { await c.query("ROLLBACK"); console.error(`${LABEL}: FAIL — positive control: ${bound}/2 reserve register roles bound`); process.exit(1); }
  if (!exists) {
    await c.query("ROLLBACK");
    console.error(`${LABEL}: FAIL — accounting.faro_reserve_entries does not exist (migration 202615250600 not applied)`);
    process.exit(1);
  }
  const bad = (await c.query(`
    SELECT e.id::text, e.entry_kind,
           NOT EXISTS (SELECT 1 FROM banking.bank_transactions t WHERE t.id = e.bank_transaction_id AND t.bank_account_id = e.bank_account_id) AS line_off_register,
           e.journal_entry_id IS NOT NULL AND e.entry_kind <> 'escrow_held' AND NOT EXISTS (
             SELECT 1 FROM accounting.journal_entry_postings p JOIN banking.bank_accounts b ON b.id = e.bank_account_id
              WHERE p.journal_entry_uuid = e.journal_entry_id AND p.account_id = b.ledger_account_id
                AND p.source_transaction_type = 'faro_reserve_entry' AND p.source_transaction_id::text = e.id::text) AS je_missing_register_leg
      FROM accounting.faro_reserve_entries e`)).rows.filter((r) => r.line_off_register || r.je_missing_register_leg);
  const unlinked = (await c.query(`
    SELECT p.id::text FROM accounting.faro_reserve_entries e
      JOIN accounting.factoring_purchase_lines l ON l.operating_company_id = e.operating_company_id AND l.faro_invoice_number = e.faro_invoice_number AND l.voided_at IS NULL
      JOIN accounting.journal_entry_postings p ON p.journal_entry_uuid = e.journal_entry_id
       AND p.source_transaction_type = 'faro_reserve_entry' AND p.source_transaction_id::text = e.id::text
     WHERE e.entry_kind <> 'escrow_held'
       AND NOT EXISTS (SELECT 1 FROM accounting.transaction_source_links t
                        WHERE t.journal_entry_posting_id = p.id AND t.linked_object_type = 'invoice' AND t.linked_object_id = l.invoice_id::text)`)).rows;
  if (unlinked.length) bad.push(...unlinked.map((r) => ({ id: r.id, entry_kind: "leg without invoice spine link" })));
  // Tables 10 + 11, live: nothing stores a Faro balance (ceiling 0; once the columns are dropped this is vacuous by
  // construction), and every register that holds entries has a statement balance for the tie-out to compare.
  const storedCols = (await c.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'accounting'
      AND table_name = 'faro_reserve_entries' AND column_name IN ('running_balance_cents', 'short_pay_balance_cents')`)).rows.map((r) => r.column_name);
  for (const col of storedCols) {
    const k = Number((await c.query(`SELECT count(*)::int n FROM accounting.faro_reserve_entries WHERE ${col} IS NOT NULL`)).rows[0].n);
    if (k) bad.push({ id: `${k} row(s)`, entry_kind: `store ${col} (second system, ceiling 0)` });
  }
  const noStatement = (await c.query(`SELECT DISTINCT e.bank_account_id::text AS id FROM accounting.faro_reserve_entries e
      JOIN banking.bank_accounts b ON b.id = e.bank_account_id WHERE b.last_synced_at IS NULL`)).rows;
  for (const r of noStatement) bad.push({ id: r.id, entry_kind: "register holds Faro entries but no statement balance" });
  const n = Number((await c.query(`SELECT count(*)::int n FROM accounting.faro_reserve_entries`)).rows[0].n);
  await c.query("ROLLBACK");
  if (bad.length) {
    console.error(`${LABEL}: LIVE FAIL — ${bad.length} entr(ies) off their register or posted without a stamped register leg: ${bad.slice(0, 5).map((r) => `${r.id} ${r.entry_kind}`).join(", ")}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — static clean; live: 0 stored Faro balances (${storedCols.length} legacy column(s) present), every register with entries has a statement balance; ${n} Faro entr(ies), all on their register and stamped; positive control 2/2 register roles bound`);
} catch (err) {
  console.error(`${LABEL}: FAIL — live check could not run: ${err.message}`);
  process.exit(1);
} finally {
  await c.end().catch(() => {});
}

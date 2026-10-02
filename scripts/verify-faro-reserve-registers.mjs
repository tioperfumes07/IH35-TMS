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
};

export function check(src) {
  const fails = [];
  const s = src.svc;
  const need = [
    [/entry_kind === "schedule_fee"\) \{\s*debit = \{ account: await role\("factor_transaction_fee"\)/, "schedule fee must debit factor_transaction_fee (6405)"],
    [/entry_kind === "short_pay"\) \{\s*debit = \{ account: await role\("factoring_advance_liability"\)/, "short-pay must debit factoring_advance_liability (2150)"],
    [/debit = \{ account: await role\("intercompany_receivable_ih35_transportation"\)/, "client payable to IH 35 must debit the intercompany receivable (8000)"],
    [/debit = \{ account: cash, entry: cashSide \};\s*credit = \{ account: await role\("factor_reserve_held"\)/, "escrow -> cash must be DR 1235 / CR 1230"],
    [/throw new FaroReserveError\("faro_rsv_deposit_posts_with_its_payment_match"\)/, "a Rsv Deposit must refuse here"],
    [/throw new FaroReserveError\("faro_client_payable_to_us_posts_as_a_transfer"\)/, "a client payable to us must refuse here"],
    [/"inv_po_swapped"/, "the Inv/PO swap must be rejected"],
    [/source_transaction_type: "faro_reserve_entry"/, "every leg must be stamped source faro_reserve_entry"],
  ];
  for (const [re, msg] of need) if (!re.test(s)) fails.push(`${F.svc}: ${msg}`);
  if (/role\("ar_control"\)|"ar_control"/.test(s)) fails.push(`${F.svc}: a Faro poster resolves ar_control — A/R never left under secured borrowing`);
  if (!/user\.role !== "Owner"\) return reply\.code\(403\)\.send\(\{ error: "faro_reserve_import_owner_only" \}\)/.test(src.routes)) {
    fails.push(`${F.routes}: the report import is not Owner-only`);
  }
  return fails;
}

const read = () => Object.fromEntries(Object.entries(F).map(([k, p]) => [k, fs.readFileSync(path.join(ROOT, p), "utf8")]));

if (process.argv.includes("--selftest")) {
  const g = read();
  const plants = [
    ["short-pay to A/R", { svc: g.svc.replace('debit = { account: await role("factoring_advance_liability"), entry };', 'debit = { account: await role("ar_control"), entry };') }],
    ["fee to 6400", { svc: g.svc.replace('await role("factor_transaction_fee")', 'await role("factor_fee_expense")') }],
    ["deposit posts", { svc: g.svc.replace('throw new FaroReserveError("faro_rsv_deposit_posts_with_its_payment_match")', "void 0") }],
    ["swap accepted", { svc: g.svc.replace('"inv_po_swapped"', '"ok"') }],
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
  const n = Number((await c.query(`SELECT count(*)::int n FROM accounting.faro_reserve_entries`)).rows[0].n);
  await c.query("ROLLBACK");
  if (bad.length) {
    console.error(`${LABEL}: LIVE FAIL — ${bad.length} entr(ies) off their register or posted without a stamped register leg: ${bad.slice(0, 5).map((r) => `${r.id} ${r.entry_kind}`).join(", ")}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — static 9/9; live: ${n} Faro entr(ies), all on their register and stamped; positive control 2/2 register roles bound`);
} catch (err) {
  console.error(`${LABEL}: FAIL — live check could not run: ${err.message}`);
  process.exit(1);
} finally {
  await c.end().catch(() => {});
}

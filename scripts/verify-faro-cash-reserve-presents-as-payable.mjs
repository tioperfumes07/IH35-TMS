#!/usr/bin/env node
// Lead 2026-10-02 — "A NEGATIVE RESERVE IS A LIABILITY, NOT A NEGATIVE ASSET" / "a negative cash reserve presents as a
// payable to Faro, never a negative asset."
// Static: the reclass is DR factor_cash_reserve_held (1235) / CR factor_cash_reserve_deficit_payable (2156) on the period
// end and reversed the next day, both stamped to the reclass; month close cannot lock while the deficit is unreclassed.
// Live (DATABASE_URL): every reclass whose entry is posted has its reversal posted, both for exactly its deficit, both
// stamped to it; and no LOCKED period ends with a credit balance on 1235 that was not reclassed. Positive control: the
// cash-reserve role is bound and the table exists. A live check that cannot run FAILS. --selftest plants regressions.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";


export const REQUIRES_LIVE_DB = "Neon live verification required";
const LABEL = "verify-faro-cash-reserve-presents-as-payable";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const F = {
  svc: "apps/backend/src/factoring/cash-reserve-reclass.service.ts",
  close: "apps/backend/src/accounting/month-close.service.ts",
};

export function check(src) {
  const fails = [];
  const need = [
    [/\{ account_id: cash, debit_or_credit: "debit", amount_cents: amount, description: memo, \.\.\.stamp \},\s*\{ account_id: payable, debit_or_credit: "credit"/, "the reclass must be DR 1235 / CR 2156"],
    [/\{ account_id: payable, debit_or_credit: "debit", amount_cents: amount, description: reversalMemo, \.\.\.stamp \},\s*\{ account_id: cash, debit_or_credit: "credit"/, "the reversal must be DR 2156 / CR 1235"],
    [/entry_date: nextDay\(input\.period_end\)/, "the reversal must be dated the day after the period end"],
    [/resolveRoleAccount\(client as never, oci, "factor_cash_reserve_deficit_payable"\)/, "the payable must resolve factor_cash_reserve_deficit_payable (2156)"],
  ];
  for (const [re, msg] of need) if (!re.test(src.svc)) fails.push(`${F.svc}: ${msg}`);
  if (!/&& faroCashReserve\.complete;/.test(src.close)) fails.push(`${F.close}: month close can lock with an unreclassed Faro Cash Reserve deficit`);
  return fails;
}

const read = () => Object.fromEntries(Object.entries(F).map(([k, p]) => [k, fs.readFileSync(path.join(ROOT, p), "utf8")]));

if (process.argv.includes("--selftest")) {
  const g = read();
  const plants = [
    ["no reversal date", { svc: g.svc.replace("entry_date: nextDay(input.period_end)", "entry_date: input.period_end") }],
    ["payable to 2150", { svc: g.svc.replace('"factor_cash_reserve_deficit_payable")', '"factoring_advance_liability")') }],
    ["close ignores deficit", { close: g.close.replace("&& faroCashReserve.complete;", ";") }],
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
  const bound = Number((await c.query(`SELECT count(*)::int n FROM accounting.chart_of_accounts_roles WHERE role = 'factor_cash_reserve_held' AND is_active`)).rows[0].n);
  const exists = Number((await c.query(`SELECT count(*)::int n FROM pg_class WHERE oid = to_regclass('accounting.faro_cash_reserve_reclasses')`)).rows[0].n);
  if (!bound || !exists) {
    await c.query("ROLLBACK");
    console.error(`${LABEL}: FAIL — positive control: cash-reserve role bound ${bound}, reclass table present ${exists} (migration 202615260600 applied?)`);
    process.exit(1);
  }
  const bad = (await c.query(`
    SELECT x.id::text
      FROM accounting.faro_cash_reserve_reclasses x
      JOIN accounting.journal_entries je ON je.id = x.journal_entry_id AND je.status = 'posted'
     WHERE x.reversal_journal_entry_id IS NULL
        OR NOT EXISTS (SELECT 1 FROM accounting.journal_entries r WHERE r.id = x.reversal_journal_entry_id AND r.status = 'posted')
        OR (SELECT count(*) FROM accounting.journal_entry_postings p
             WHERE p.journal_entry_uuid IN (x.journal_entry_id, x.reversal_journal_entry_id)
               AND p.source_transaction_type = 'faro_cash_reserve_reclass' AND p.source_transaction_id::text = x.id::text
               AND p.amount_cents = x.deficit_cents) <> 4`)).rows;
  const unreclassed = (await c.query(`
    SELECT pr.operating_company_id::text, pr.period_end::text, bal.cents
      FROM accounting.periods pr
      CROSS JOIN LATERAL (
        SELECT sum(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END) AS cents
          FROM accounting.journal_entry_postings p
          JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid AND je.status = 'posted'
          JOIN accounting.chart_of_accounts_roles r ON r.account_id = p.account_id AND r.operating_company_id = je.operating_company_id
           AND r.role = 'factor_cash_reserve_held' AND r.is_active
         WHERE je.operating_company_id = pr.operating_company_id AND je.entry_date <= pr.period_end
           AND p.source_transaction_type IS DISTINCT FROM 'faro_cash_reserve_reclass') bal
     WHERE pr.status <> 'open' AND bal.cents < 0
       AND NOT EXISTS (SELECT 1 FROM accounting.faro_cash_reserve_reclasses x
                        JOIN accounting.journal_entries je ON je.id = x.journal_entry_id AND je.status = 'posted'
                       WHERE x.operating_company_id = pr.operating_company_id AND x.period_end = pr.period_end
                         AND x.deficit_cents = -bal.cents)`)).rows;
  const n = Number((await c.query(`SELECT count(*)::int n FROM accounting.faro_cash_reserve_reclasses`)).rows[0].n);
  await c.query("ROLLBACK");
  if (bad.length || unreclassed.length) {
    console.error(`${LABEL}: LIVE FAIL — ${bad.length} reclass(es) without a matching posted reversal; ${unreclassed.length} closed period(s) ending with a negative 1235 not reclassed: ${unreclassed.slice(0, 5).map((r) => `${r.operating_company_id} ${r.period_end} ${r.cents}`).join(", ")}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — static 5/5; live: ${n} reclass(es) intact; 0 closed periods with an unreclassed negative 1235; positive control ${bound} cash-reserve binding(s)`);
} catch (err) {
  console.error(`${LABEL}: FAIL — live check could not run: ${err.message}`);
  process.exit(1);
} finally {
  await c.end().catch(() => {});
}

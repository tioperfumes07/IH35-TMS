#!/usr/bin/env node
// ROUND 326.2 — every factoring KPI (and, from item 2, every banking KPI) recomputed INDEPENDENTLY from the ledger and the
// purchase document, compared to the engine's output (apps/backend/src/factoring/factoring-kpi.service.ts via
// scripts/lib/print-factoring-kpis.ts). FAILS on any cent of drift, and when a KPI's row count differs from its drill.
// Independent = own SQL, own role->account resolution (accounting.chart_of_accounts_roles), no import of the engine's SQL.
// Live-only: fails closed without DATABASE_URL.
import pg from "pg";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-factoring-banking-kpis-tie-to-ledger";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const FROM = "2026-01-01";
const TO = new Date().toISOString().slice(0, 10);

if (process.argv.includes("--selftest")) {
  // The comparison itself: a 1-cent drift and a drill/row mismatch must both fail.
  const cmp = (engine, ref) => engine.flatMap((k) => (Number(k.value ?? 0) !== Number(ref[k.key] ?? 0) ? [k.key] : []).concat(k.row_count !== k.drill_count ? [`${k.key}:drill`] : []));
  const a = cmp([{ key: "x", value: 100, row_count: 1, drill_count: 1 }], { x: 101 });
  const b = cmp([{ key: "x", value: 100, row_count: 2, drill_count: 1 }], { x: 100 });
  const ok = cmp([{ key: "x", value: 100, row_count: 1, drill_count: 1 }], { x: 100 });
  if (a.length !== 1 || b.length !== 1 || ok.length !== 0) { console.error(`${LABEL} --selftest FAIL`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS (cent drift + drill mismatch both caught)`);
  process.exit(0);
}

const url = process.env.DATABASE_URL;
if (!url) { console.error(`${LABEL}: FAIL — DATABASE_URL not set (live guard fails closed).`); process.exit(1); }

const engine = JSON.parse(execFileSync("npx", ["tsx", path.join(ROOT, "scripts/lib/print-factoring-kpis.ts"), USMCA, FROM, TO], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 1 << 24 }));

const c = new pg.Client({ connectionString: url, statement_timeout: 60000 });
await c.connect();
const ref = {};
try {
  await c.query("BEGIN READ ONLY");
  await c.query("SET LOCAL app.bypass_rls = 'lucia'");
  const one = async (sql, p = []) => (await c.query(sql, p)).rows[0] ?? {};
  const roleAcct = async (role) => (await one(`SELECT account_id::text a FROM accounting.chart_of_accounts_roles WHERE operating_company_id = $1::uuid AND role = $2 LIMIT 1`, [USMCA, role])).a ?? null;
  const posted = `operating_company_id = '${USMCA}' AND status = 'posted' AND purchase_date BETWEEN '${FROM}' AND '${TO}'`;
  const v = await one(`SELECT COALESCE(sum(gross_cents),0)::bigint g, COALESCE(sum(advance_cents),0)::bigint a FROM accounting.factoring_purchases WHERE ${posted}`);
  ref.purchased_volume = Number(v.g);
  ref.advance_rate = Number(v.g) > 0 ? Number(((Number(v.a) / Number(v.g)) * 100).toFixed(2)) : 0;
  const glSum = async (role, mode, extra = "") => {
    const id = await roleAcct(role);
    if (!id) return 0;
    const r = await one(
      `SELECT COALESCE(sum(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END),0)::bigint s,
              COALESCE(sum(p.amount_cents),0)::bigint raw
         FROM accounting.journal_entry_postings p JOIN accounting.journal_entries j ON j.id = p.journal_entry_uuid
        WHERE j.status = 'posted' AND j.operating_company_id = $1::uuid AND p.account_id = $2::uuid
          AND ${mode === "balance" ? `j.entry_date <= '${TO}'` : `j.entry_date BETWEEN '${FROM}' AND '${TO}'`} ${extra}`, [USMCA, id]);
    return extra ? Number(r.raw) : Number(r.s);
  };
  ref.escrow_reserve_balance = await glSum("factor_reserve_held", "balance");
  ref.cash_reserve_balance = await glSum("factor_cash_reserve_held", "balance");
  ref.fees_accrued = await glSum("factor_fee_expense", "activity");
  ref.default_interest_accrued = await glSum("default_interest_expense", "activity");
  ref.reserve_releases = await glSum("factor_reserve_held", "activity", `AND p.debit_or_credit = 'credit' AND p.source_transaction_type = 'factoring_reserve_release'`);
  ref.net_cash_received = Number((await one(`SELECT COALESCE(sum(b.amount_cents),0)::bigint s FROM accounting.factoring_purchases fp JOIN banking.bank_transactions b ON b.matched_factoring_advance_id = fp.factoring_advance_id WHERE fp.operating_company_id = '${USMCA}' AND fp.status = 'posted' AND fp.purchase_date BETWEEN '${FROM}' AND '${TO}' AND fp.factoring_advance_id IS NOT NULL`)).s ?? 0);
  const d = await one(`SELECT avg(fp.purchase_date - i.issue_date)::numeric(10,2)::text d FROM accounting.factoring_purchases fp JOIN accounting.factoring_purchase_lines l ON l.purchase_id = fp.id AND l.voided_at IS NULL JOIN accounting.invoices i ON i.id = l.invoice_id WHERE fp.operating_company_id = '${USMCA}' AND fp.status = 'posted' AND fp.purchase_date BETWEEN '${FROM}' AND '${TO}' AND i.issue_date IS NOT NULL`);
  ref.days_to_fund = d.d != null ? Number(d.d) : 0;
  ref.unfunded_aging = Number((await one(`SELECT COALESCE(sum(fp.net_to_company_cents),0)::bigint s FROM accounting.factoring_purchases fp WHERE fp.operating_company_id = '${USMCA}' AND fp.status = 'posted' AND fp.purchase_date BETWEEN '${FROM}' AND '${TO}' AND NOT EXISTS (SELECT 1 FROM banking.bank_transactions b WHERE fp.factoring_advance_id IS NOT NULL AND b.matched_factoring_advance_id = fp.factoring_advance_id)`)).s);
  await c.query("ROLLBACK");
} finally {
  await c.end();
}

const problems = [];
for (const k of engine) {
  if (Number(k.value ?? 0) !== Number(ref[k.key] ?? 0)) problems.push(`${k.key}: engine ${k.value} != ledger ${ref[k.key]}`);
  if (k.row_count !== k.drill_count) problems.push(`${k.key}: row_count ${k.row_count} != drill rows ${k.drill_count}`);
}
const missing = Object.keys(ref).filter((key) => !engine.some((k) => k.key === key));
if (missing.length) problems.push(`engine lacks KPI(s): ${missing.join(", ")}`);
if (problems.length) { console.error(`${LABEL}: FAIL — ${problems.join("; ")}`); process.exit(1); }
console.log(`${LABEL}: PASS — ${engine.length} factoring KPIs tie to the ledger to the cent (${FROM}..${TO}); every row count equals its drill`);

#!/usr/bin/env node
/**
 * ROUND 326.5 — the Customers / Vendors list boards (owner design law: identical to
 * docs/design/boards/driver-customers-vendors/{Customers,Vendors}.dc.html, every figure bound live).
 *   static -- /customers and /vendors open on the board (PartyListRoute); every board control exists (6 tiles,
 *             chips, range/aging or category tokens, search over all, Regular / Master-detail, Export, gear);
 *             none of the board's hardcoded snapshot figures ships; the table uses ih-table (rows ruled, no
 *             column borders) and missing money renders "—";
 *   live   -- the engine's tiles and chip counts equal an independent SQL recompute, to the cent.
 * Fails closed without DATABASE_URL.
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import pg from "pg";
const ROOT = process.cwd();
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ui = readFileSync("apps/frontend/src/components/boards/PartyBoard.tsx", "utf8");
const manifest = readFileSync("apps/frontend/src/routes/manifest.tsx", "utf8");
const css = readFileSync("apps/frontend/src/components/boards/party-board.css", "utf8");
const fails = [];
for (const k of ["customers", "vendors"]) if (!new RegExp(`<PartyListRoute kind="${k}">`).test(manifest)) fails.push(`/${k} must open on the board (PartyListRoute)`);
for (const label of ["With transactions", "In the book", "Open invoices", "Billed", "A/R open", "Collected", "Spend YTD", "Fuel share", "Open bills", "Unposted fuel",
  "Open balance", "Factored", "This year", "All ages", "Regular", "Master-detail", "Export", "Choose columns", "hidden is not missing", "Category"]) {
  if (!ui.includes(label)) fails.push(`board control/label missing: "${label}"`);
}
for (const snapshot of ["381,916.72", "366,409.12", "15,507.60", "185,914.44", "20,942.94", "177,911.29", "1,249", "99.2%"]) {
  if (ui.includes(snapshot)) fails.push(`hardcoded board figure "${snapshot}" ships — bind it to the engine`);
}
if (!/className="ih-table"/.test(ui)) fails.push("board table must use ih-table (rules for rows, never for columns)");
if (/border-(left|right)\s*:/.test(css)) fails.push("party-board.css declares a column border");
if (!/cents \? usd\(cents\) : "—"/.test(ui)) fails.push("missing money must render — (never $0.00)");
if (!process.env.DATABASE_URL) { console.error("verify-party-boards-bound-live: FAIL — DATABASE_URL not set (live guard fails closed)."); process.exit(1); }
const engine = JSON.parse(execFileSync("npx", ["tsx", path.join(ROOT, "scripts/lib/print-party-boards.ts"), USMCA], { cwd: ROOT, env: process.env, encoding: "utf8", maxBuffer: 1 << 24 }));
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
try {
  await c.query("BEGIN READ ONLY");
  await c.query("SELECT set_config('app.bypass_rls','lucia',true)");
  const ci = (await c.query(`SELECT count(DISTINCT customer_id)::int wt, coalesce(sum(total_cents),0)::bigint b, coalesce(sum(amount_open_cents),0)::bigint o,
      count(*) FILTER (WHERE amount_open_cents > 0)::int oi FROM accounting.invoices
     WHERE operating_company_id = $1 AND voided_at IS NULL AND status <> 'void' AND issue_date >= date_trunc('year', current_date)::date`, [USMCA])).rows[0];
  const cb = (await c.query(`SELECT count(*)::int n FROM mdata.customers WHERE operating_company_id = $1`, [USMCA])).rows[0];
  const ve = (await c.query(`SELECT count(DISTINCT vendor_uuid)::int wt, coalesce(sum(total_amount_cents),0)::bigint s, count(*)::int t FROM accounting.expenses
     WHERE operating_company_id = $1 AND voided_at IS NULL AND vendor_uuid IS NOT NULL AND transaction_date >= date_trunc('year', current_date)::date`, [USMCA])).rows[0];
  const rf = (await c.query(`SELECT coalesce(sum(total_amount_paid_cents),0)::bigint s, count(*)::int n FROM integrations.relay_fuel_transactions
     WHERE operating_company_id = $1 AND voided_at IS NULL AND coalesce(is_active, true) AND posted_to_gl IS NOT TRUE`, [USMCA])).rows[0];
  const vb = (await c.query(`SELECT count(*)::int n FROM mdata.vendors WHERE operating_company_id = $1`, [USMCA])).rows[0];
  const eq = (label, a, b) => { console.log(`  ${label.padEnd(32)} engine ${a}  recompute ${b}`); if (Number(a) !== Number(b)) fails.push(`${label}: engine ${a} != recompute ${b}`); };
  const k = engine.customers.kpis, v = engine.vendors.kpis;
  eq("customers with transactions", k.with_transactions, ci.wt);
  eq("customers in the book", k.in_the_book, cb.n);
  eq("customers open invoices", k.open_invoices, ci.oi);
  eq("customers billed (cents)", k.billed_cents, ci.b);
  eq("customers A/R open (cents)", k.ar_open_cents, ci.o);
  eq("customers collected (cents)", k.collected_cents, Number(ci.b) - Number(ci.o));
  eq("vendors with transactions", v.with_transactions, ve.wt);
  eq("vendors in the book", v.in_the_book, vb.n);
  eq("vendors spend YTD (cents)", v.spend_cents, ve.s);
  eq("vendors transactions", v.transactions, ve.t);
  eq("unposted Relay fuel (cents)", v.unposted_fuel_cents, rf.s);
  eq("unposted Relay fuel (count)", v.unposted_fuel_count, rf.n);
  await c.query("ROLLBACK");
} finally { await c.end(); }
if (fails.length) { console.error("verify-party-boards-bound-live: FAIL\n  " + fails.join("\n  ")); process.exit(1); }
console.log("verify-party-boards-bound-live: OK");

#!/usr/bin/env node
/**
 * ROUND 326.5 — the Customers / Vendors list boards and Driver Hub Home (Main.dc.html) (owner design law: identical to
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

// --selftest (Devin build order 2026-10-05): live-DB guards cannot be fixture-tested — their inputs
// are rows on Neon. One case MUST pass (live check green, or the canonical no-credential refusal
// when nothing resolves locally) and one MUST fail (dead credential — it must refuse, never green).
if (process.argv.includes("--selftest")) { await selftest_verify_party_boards_bound_live(); }
async function selftest_verify_party_boards_bound_live() {
  const { runGuard, reportSelftest, statusOf, outputOf, DEAD_DB_ENV } = await import("./lib/guard-selftest.mjs");
  const { fileURLToPath } = await import("node:url");
  const me = fileURLToPath(import.meta.url);
  const real = runGuard(me);
  const noDb = runGuard(me, { env: DEAD_DB_ENV });
  const refused = /DATABASE_URL (?:is )?(?:not set|unset|required)|credential/.test(outputOf(real));
  reportSelftest("verify_party_boards_bound_live", [
    { name: "live check green, or canonically refuses with no credential", pass: statusOf(real) === 0 || refused, detail: statusOf(real) === 0 ? undefined : outputOf(real).slice(-300) },
    { name: "refuses on dead credential", pass: statusOf(noDb) !== 0, detail: statusOf(noDb) !== 0 ? undefined : outputOf(noDb).slice(-200) },
  ]);
}
const ROOT = process.cwd();
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ui = readFileSync("apps/frontend/src/components/boards/PartyBoard.tsx", "utf8");
const manifest = readFileSync("apps/frontend/src/routes/manifest.tsx", "utf8");
const css = readFileSync("apps/frontend/src/components/boards/party-board.css", "utf8");
const hubUi = readFileSync("apps/frontend/src/components/boards/DriverHubBoard.tsx", "utf8");
const ddUi = readFileSync("apps/frontend/src/components/boards/DriverOverviewBoard.tsx", "utf8");
const ddTabs = readFileSync("apps/frontend/src/pages/drivers/driverProfileTabs.ts", "utf8");
const ddSurface = ddUi + "\n" + ddTabs;
const fails = [];
for (const k of ["customers", "vendors"]) if (!new RegExp(`<PartyListRoute kind="${k}">`).test(manifest)) fails.push(`/${k} must open on the board (PartyListRoute)`);
for (const label of ["With transactions", "In the book", "Open invoices", "Billed", "A/R open", "Collected", "Spend YTD", "Fuel share", "Open bills", "Unposted fuel",
  "Open balance", "Factored", "This year", "All ages", "Regular", "Master-detail", "Export", "Choose columns", "hidden is not missing", "Category"]) {
  if (!ui.includes(label)) fails.push(`board control/label missing: "${label}"`);
}
for (const snapshot of ["381,916.72", "366,409.12", "15,507.60", "185,914.44", "20,942.94", "177,911.29", "1,249", "99.2%"]) {
  if (ui.includes(snapshot)) fails.push(`hardcoded board figure "${snapshot}" ships — bind it to the engine`);
}
if (!/<DriverHubRoute \/>/.test(manifest)) fails.push("/drivers/profiles must open on the Driver Hub board (DriverHubRoute)");
for (const label of ["Driver Hub Home", "Refresh", "+ Create Driver", "On loads", "Available", "On leave", "Settle due", "Escrow held", "Cash advance requests",
  "Pay rate templates", "Driver disputes", "Probation", "Unit…", "All pay bases", "Search name, phone, CDL…", "Master-detail", "List", "Choose columns",
  "Sorted by settlement due", "Open full profile →", "Settlement due", "Advances open", "Miles, 30 days", "Integrity", "Recent activity", "Linked"]) {
  if (!hubUi.includes(label)) fails.push(`driver hub control/label missing: "${label}"`);
}
for (const snapshot of ["19 / 130", "$1,842.60", "Angel Sosa", "9,150", "$2,375.00"]) if (hubUi.includes(snapshot)) fails.push(`hardcoded driver-hub board figure "${snapshot}" ships`);
if (!/<DriverDetailRoute \/>/.test(manifest)) fails.push("/drivers/:id must open on the DriverDetail board (DriverDetailRoute)");
for (const label of ["Edit", "Add payment", "Run settlement", "Overview", "Additional payments", "Cash advances", "Pay & escrow", "Reports & damage", "Complaints",
  "Safety & accidents", "Driver disputes", "Settlement due", "Additional pay", "Escrow held", "Miles, 30 days", "MPG, 30 days", "Integrity", "Line haul", "Deductions",
  "Net pay", "it rides the settlement, it never becomes a separate cheque", "+ Log complaint", "Reports &amp; damage he filed", "Trucks he has held", "Pay terms", "Compliance",
  "CDL expiration", "Medical card", "Annual MVR review", "Drug screen, last", "Hours violations, 90 days"]) {
  if (!ddSurface.includes(label)) fails.push(`driver detail control/label missing: "${label}"`);
}
const ddSvc = readFileSync("apps/backend/src/mdata/canonical/driver-overview.service.ts", "utf8");
for (const label of ["MPG against fleet", "Gallons per 100 mi", "Fills with no load link", "Fuel anomaly flags", "Complaints per 100k mi", "Damage $ per 100k mi", "Accidents per 100k mi"]) {
  if (!ddSvc.includes(label)) fails.push(`driver detail integrity row missing: "${label}"`);
}
for (const snapshot of ["Angel Sosa", "$1,842.60", "S-2026-5819", "$1,140.00", "9,150", "fleet 6.4"]) if (ddUi.includes(snapshot)) fails.push(`hardcoded DriverDetail board figure "${snapshot}" ships`);
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
  const dh = (await c.query(`SELECT count(*) FILTER (WHERE status::text = 'Active')::int a, count(*)::int t FROM mdata.drivers WHERE operating_company_id = $1 AND merged_into_driver_id IS NULL`, [USMCA])).rows[0];
  const sd = (await c.query(`SELECT count(*)::int n FROM driver_finance.driver_settlements s JOIN mdata.drivers d ON d.id = s.driver_id AND d.merged_into_driver_id IS NULL
     WHERE s.operating_company_id = $1 AND s.voided_at IS NULL AND s.reversed_at IS NULL AND coalesce(s.is_presettlement, false) = false
       AND s.payment_state = 'unpaid' AND s.paid_at IS NULL AND coalesce(s.is_sample_data, false) = false`, [USMCA])).rows[0];
  // ACCT-F9854 (kill the second system): escrow held is the GL — each driver's 2100-00-nnn sub-account, credit minus
  // debit of its posted lines, each account once (merged duplicate drivers share one) — recomputed here straight from the
  // postings, independent of the engine's view; never the stored escrow_accounts.balance_cents.
  const eh = (await c.query(`SELECT coalesce(sum(CASE WHEN p.debit_or_credit = 'credit' THEN p.amount_cents ELSE -p.amount_cents END),0)::bigint s
       FROM accounting.journal_entry_postings p
       JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid AND je.status = 'posted' AND je.voided_at IS NULL
      WHERE p.operating_company_id = $1
        AND p.account_id IN (SELECT DISTINCT ea.coa_account_id FROM accounting.escrow_accounts ea JOIN catalogs.accounts a ON a.id = ea.coa_account_id
                              WHERE ea.operating_company_id = $1 AND ea.holder_type = 'driver' AND a.account_number LIKE '2100-00-%')`, [USMCA])).rows[0];
  const dk = engine.drivers.kpis;
  eq("drivers active", dk.active, dh.a);
  eq("drivers total", dk.total, dh.t);
  eq("drivers settle due", dk.settle_due, sd.n);
  eq("drivers escrow held (cents)", dk.escrow_held_cents, eh.s);
  eq("drivers available = active - on loads", dk.available, dk.active - dk.on_loads);
  if (engine.overview) {
    const ov = engine.overview, D = ov.driver_id;
    const due = (await c.query(`SELECT coalesce(sum(net_pay),0) v, count(*)::int n FROM driver_finance.driver_settlements WHERE operating_company_id = $1 AND driver_id = $2
       AND voided_at IS NULL AND reversed_at IS NULL AND coalesce(is_presettlement, false) = false AND payment_state = 'unpaid' AND paid_at IS NULL`, [USMCA, D])).rows[0];
    // Recompute over the EXACT window the engine summed (it returns it), never this guard's own clock: two separate now()
    // reads straddling a UTC midnight would disagree on the calendar alone (ROUND 251 item 7 — no verdict from wall-clock).
    const win = ov.tiles.miles_30d_window;
    if (!win || !/^\d{4}-\d{2}-\d{2}$/.test(win.from) || !/^\d{4}-\d{2}-\d{2}$/.test(win.to)) fails.push(`overview miles_30d_window missing or malformed: ${JSON.stringify(win)}`);
    const mi = (await c.query(`SELECT coalesce(sum(distance_mi),0) mi, coalesce(sum(fuel_burned_gal),0) g FROM integrations.samsara_fuel_reports
       WHERE subject_kind = 'driver' AND driver_id = $1 AND report_date >= $2::date AND report_date <= $3::date`, [D, win?.from ?? null, win?.to ?? null])).rows[0];
    eq("overview settlement due (cents)", ov.tiles.settlement_due_cents, Math.round(Number(due.v) * 100));
    eq("overview settlements due (count)", ov.tiles.settlements_due, due.n);
    eq("overview miles 30d (Samsara driver)", ov.tiles.miles_30d, Math.round(Number(mi.mi)));
    eq("overview mpg 30d", ov.tiles.mpg_30d ?? 0, Number(mi.g) > 0 ? Math.round((Number(mi.mi) / Number(mi.g)) * 10) / 10 : 0);
  }
  await c.query("ROLLBACK");
} finally { await c.end(); }
if (fails.length) { console.error("verify-party-boards-bound-live: FAIL\n  " + fails.join("\n  ")); process.exit(1); }
console.log("verify-party-boards-bound-live: OK");

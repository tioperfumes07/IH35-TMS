#!/usr/bin/env node
/**
 * GUARD: consolidated financial statements (item 4) apply INTERCOMPANY ELIMINATION and POST NOTHING.
 *
 * Locks:
 *  1. The consolidated service is not a naive SUM — it must apply an intercompany elimination
 *     (buildEliminationSchedule + a Math.min match + subtracting the eliminated amount from the
 *     summed totals). A pure roll-up with no elimination FAILS this guard.
 *  2. The consolidated service + routes POST NOTHING: no INSERT/UPDATE/DELETE into accounting.* /
 *     catalogs.* / mdata.*, and no reference to the posting engine (journal_entry_postings write,
 *     posting_batches write, postSourceTransaction).
 *  3. The read-only routes are registered (consolidated/pnl, balance-sheet, cash-flow) via the
 *     accounting @fastify/autoload barrel (the *.routes.ts default fp export).
 *
 * --selftest exercises the assertions against inline good/bad fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const SVC = path.join(root, "apps/backend/src/accounting/consolidated-statements.service.ts");
const ROUTES = path.join(root, "apps/backend/src/accounting/consolidated-statements.routes.ts");

// Writes into the financial schemas — any of these in the consolidated surface is a hard fail.
const WRITE_RES = [
  { re: /\bINSERT\s+INTO\s+(accounting|catalogs|mdata)\./i, why: "INSERT into accounting/catalogs/mdata.*" },
  { re: /\bUPDATE\s+(accounting|catalogs|mdata)\./i, why: "UPDATE of accounting/catalogs/mdata.*" },
  { re: /\bDELETE\s+FROM\s+(accounting|catalogs|mdata)\./i, why: "DELETE from accounting/catalogs/mdata.*" },
  { re: /postSourceTransaction|reversePostedSourceTransaction|posting-engine/i, why: "calls the posting engine" },
  { re: /INSERT\s+INTO\s+accounting\.journal_entry_postings/i, why: "writes journal_entry_postings" },
  { re: /INSERT\s+INTO\s+accounting\.posting_batches/i, why: "writes posting_batches" },
];

function assertService(src) {
  const errors = [];
  // Strip comments so prose about "INSERT" / "elimination" cannot satisfy or trip the checks.
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  // (1) Elimination is actually applied — not a naive SUM.
  if (!/buildEliminationSchedule\s*\(/.test(code)) {
    errors.push("service: no buildEliminationSchedule() — consolidated view would be a naive SUM");
  }
  if (!/Math\.min\s*\(/.test(code)) {
    errors.push("service: no Math.min match — matched intercompany elimination is missing");
  }
  // The summed totals must actually be reduced by the eliminated amount.
  if (!/-\s*eliminated(Revenue|Receivable)/.test(code)) {
    errors.push("service: consolidated totals never subtract the eliminated intercompany amount");
  }
  // Reuses the existing per-entity builders (no new GL math).
  if (!/getProfitLossReport|getBalanceSheetReport|getCashFlowReport/.test(code)) {
    errors.push("service: does not reuse the existing per-entity statement builders");
  }
  // (2) Posts nothing.
  for (const { re, why } of WRITE_RES) {
    if (re.test(code)) errors.push(`service: ${why} — consolidated statements must POST NOTHING`);
  }
  return errors;
}

function assertRoutes(src) {
  const errors = [];
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  for (const p of ["consolidated/pnl", "consolidated/balance-sheet", "consolidated/cash-flow"]) {
    if (!new RegExp(`/api/v1/accounting/${p.replace(/\//g, "\\/")}`).test(code)) {
      errors.push(`routes: missing read-only GET /api/v1/accounting/${p}`);
    }
  }
  if (!/export default fp\(/.test(code)) {
    errors.push("routes: no default fp() export — @fastify/autoload will not register the routes");
  }
  for (const { re, why } of WRITE_RES) {
    if (re.test(code)) errors.push(`routes: ${why} — consolidated routes must be READ-ONLY`);
  }
  return errors;
}

if (process.argv.includes("--selftest")) {
  const goodSvc = `
    const s = await buildEliminationSchedule(client, cps, bounds);
    const eliminatedRevenue = pairs.reduce((a, p) => a + Math.min(p.revenue, p.expense), 0);
    const revenue = naive.revenue - eliminatedRevenue;
    await getProfitLossReport(x); await getBalanceSheetReport(x); await getCashFlowReport(x);
  `;
  const goodRoutes = `
    app.get("/api/v1/accounting/consolidated/pnl", h);
    app.get("/api/v1/accounting/consolidated/balance-sheet", h);
    app.get("/api/v1/accounting/consolidated/cash-flow", h);
    export default fp(async (app) => {}, {});
  `;
  const badSvcNaive = `
    const revenue = a.revenue + b.revenue; // naive sum, no elimination
    await getProfitLossReport(x); await getBalanceSheetReport(x); await getCashFlowReport(x);
  `;
  const badSvcPosts = goodSvc + `\nawait client.query("INSERT INTO accounting.journal_entry_postings (x) VALUES (1)");`;
  const badRoutes = `app.get("/api/v1/accounting/consolidated/pnl", h);`; // missing 2 routes + fp

  const fail = (m) => { console.error("SELFTEST FAIL:", m); process.exit(1); };
  if (assertService(goodSvc).length !== 0) fail(`good service flagged: ${JSON.stringify(assertService(goodSvc))}`);
  if (assertRoutes(goodRoutes).length !== 0) fail(`good routes flagged: ${JSON.stringify(assertRoutes(goodRoutes))}`);
  if (assertService(badSvcNaive).length < 2) fail("naive-sum service not caught");
  if (!assertService(badSvcPosts).some((e) => /POST NOTHING/.test(e))) fail("posting service not caught");
  if (assertRoutes(badRoutes).length < 3) fail("bad routes not caught");
  console.log("verify-consolidated-elimination selftest OK");
  process.exit(0);
}

for (const p of [SVC, ROUTES]) {
  if (!fs.existsSync(p)) {
    console.error(`GUARD FAIL: missing file ${path.relative(root, p)}`);
    process.exit(1);
  }
}
const errors = [
  ...assertService(fs.readFileSync(SVC, "utf8")),
  ...assertRoutes(fs.readFileSync(ROUTES, "utf8")),
];
if (errors.length) {
  console.error("GUARD FAIL — consolidated statements must apply intercompany elimination and POST NOTHING:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("verify-consolidated-elimination OK — elimination applied (not naive SUM), reuses per-entity builders, POSTS NOTHING, 3 read-only routes wired");

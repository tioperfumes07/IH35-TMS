#!/usr/bin/env node
/**
 * verify-cash-forecast-firewall.mjs  (Block F — permanent guard)
 * The manual cash-forecast module must stay firewalled from accounting/finance/reports:
 *  (a) forecast.* tables have NO foreign key into another schema (snapshots only);
 *  (b) forecast code does NOT import accounting/finance/reports posting/statement modules;
 *  (c) forecast code does NO GL/journal posting;
 *  (d) accounting/finance/reports code does NOT import forecast code or query the forecast schema.
 * Read-only catalog FETCHES (HTTP) from forecast pickers are allowed — this targets
 * imports, FKs, posting, and reverse reads, not picker reads.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const errors = [];
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const exists = (p) => fs.existsSync(path.join(ROOT, p));

function walk(dir) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  for (const name of fs.readdirSync(abs)) {
    const rel = path.join(dir, name);
    const st = fs.statSync(path.join(ROOT, rel));
    if (st.isDirectory()) out.push(...walk(rel));
    else if (/\.(ts|tsx)$/.test(name)) out.push(rel);
  }
  return out;
}

// (a) No cross-schema FK in the forecast migration(s).
const migs = fs.existsSync(path.join(ROOT, "db/migrations"))
  ? fs.readdirSync(path.join(ROOT, "db/migrations")).filter((f) => /cash_forecast/.test(f) && f.endsWith(".sql"))
  : [];
for (const m of migs) {
  const sql = read(path.join("db/migrations", m));
  const fkOut = sql.match(/REFERENCES\s+(accounting|mdata|banking|catalogs|finance|org|driver_finance)\./i);
  if (fkOut) errors.push(`(a) ${m}: forecast table has a cross-schema FK (${fkOut[0]}) — must be a no-FK snapshot.`);
}

// Forecast module file sets.
const forecastBackend = walk("apps/backend/src/forecast");
const forecastFrontend = [
  "apps/frontend/src/api/forecast.ts",
  "apps/frontend/src/pages/cash-flow/tabs/ManualDailyProjectionsTab.tsx",
].filter(exists);
const forecastFiles = [...forecastBackend, ...forecastFrontend];

// (b)+(c) forecast code must not import posting/statement modules or post to the GL.
const FORBIDDEN_IMPORT = /from\s+["'][^"']*\/(accounting|finance|reports)\//;
const FORBIDDEN_POSTING = /(posting-engine|postJournal|post_journal|INSERT\s+INTO\s+accounting\.|journal_entries|gl_)/i;
for (const f of forecastFiles) {
  const src = read(f);
  for (const line of src.split("\n")) {
    if (FORBIDDEN_IMPORT.test(line))
      errors.push(`(b) ${f}: forecast code imports an accounting/finance/reports module — firewall violation: ${line.trim()}`);
  }
  if (FORBIDDEN_POSTING.test(src))
    errors.push(`(c) ${f}: forecast code references GL/journal posting — forecast must never post.`);
}

// (d) accounting/finance/reports code must not import forecast or query the forecast schema.
const reverseDirs = ["apps/backend/src/accounting", "apps/backend/src/finance", "apps/backend/src/reports"];
for (const dir of reverseDirs) {
  for (const f of walk(dir)) {
    const src = read(f);
    if (/from\s+["'][^"']*\/forecast\//.test(src) || /\bforecast\.(cash_entries|opening_balance)\b/.test(src))
      errors.push(`(d) ${f}: accounting/finance/reports must not import or query the forecast module/schema.`);
  }
}

if (errors.length > 0) {
  console.error("verify-cash-forecast-firewall FAIL:");
  for (const e of errors) console.error(`  • ${e}`);
  process.exit(1);
}
console.log("verify-cash-forecast-firewall OK — forecast module is firewalled (no FK / no posting-import / no reverse read).");

#!/usr/bin/env node
/**
 * Static guard for FH-1 Fixed Assets data model (Tier 3, behind FIXED_ASSET_AUTOPOST_ENABLED OFF).
 * Locks: migration 202606151600 creates the fixed_assets schema with the 4 register tables,
 * GRANTs to ih35_app, RLS (ENABLE+FORCE) on all four, and registers the auto-post flag default OFF.
 * No posting logic ships in this step. Pure file-content; no DB.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MIGRATION = "db/migrations/202606151600_fh1_fixed_assets_data_model.sql";

let failed = 0;
const fail = (m) => { console.error(`verify-fh1-fixed-assets: ${m}`); failed = 1; };
const p = path.join(ROOT, MIGRATION);
if (!fs.existsSync(p)) { fail(`migration missing: ${MIGRATION}`); process.exit(1); }
const m = fs.readFileSync(p, "utf8");

if (!/CREATE SCHEMA IF NOT EXISTS fixed_assets/i.test(m)) fail("must create schema fixed_assets.");
for (const t of ["asset_classes", "assets", "depreciation_schedules", "disposals"]) {
  if (!new RegExp(`CREATE TABLE IF NOT EXISTS fixed_assets\\.${t}\\b`, "i").test(m))
    fail(`must create table fixed_assets.${t}.`);
}
if (!/GRANT USAGE ON SCHEMA fixed_assets TO ih35_app/i.test(m)) fail("new schema must GRANT USAGE to ih35_app (CLAUDE.md §15).");
if (!/GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA fixed_assets TO ih35_app/i.test(m)) fail("must GRANT table privileges to ih35_app.");
if ((m.match(/ENABLE ROW LEVEL SECURITY/gi) || []).length < 1 || !/FORCE ROW LEVEL SECURITY/i.test(m)) fail("must ENABLE+FORCE RLS on the fixed_assets tables.");
if (!/'FIXED_ASSET_AUTOPOST_ENABLED'[\s\S]*false/i.test(m)) fail("must register FIXED_ASSET_AUTOPOST_ENABLED default OFF.");
// no posting logic in this step
if (/INSERT INTO accounting\.journal_entr|postSourceTransaction|createJournalEntry/i.test(m)) fail("FH-1 data-model step must contain NO posting logic (depreciation JEs are a later gated step).");

if (failed) process.exit(1);
console.log("verify-fh1-fixed-assets: OK — fixed_assets schema + 4 tables + grants + RLS + flag(OFF), no posting.");

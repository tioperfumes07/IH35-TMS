#!/usr/bin/env node
/**
 * GUARD — ROUND 443.9 PURGE REMNANTS (owner 2026-10-10: "there should be nothing from before that is why we deleted
 * and purged" · "delete anything related to the purge. Not any banking transactions.").
 *
 * MEASURED 2026-10-10 (prod, bypass_rls, USMCA) after the AUTH-400 purge: feed_intakes 2 + feed_intake_checks 24
 * (subject invoices gone), lane_profitability_cache 2,891 + deadhead_cache 22 (USMCA has 0 loads),
 * driver_notifications 273 (payload.load_id gone), docs.file_links 382 (to purged loads / settlements), docs.files 12
 * (generated dispatch artifacts of purged loads). Root cause: the purge generator censused 9 schemas (reports, pwa,
 * safety never seen), never classified the feed-gate tables, and feed_intake_checks' WORM trigger had no listed-row arm.
 *
 * STATIC
 *   1. usmca-purge-classification.json ORPHANS lists every table above with a "parent is gone" predicate; no banking
 *   2. the executor deletes only through accounting._purge_rows_cascade with rows listed for an AUTH, snapshots ids
 *      before deleting, and fails closed if journal entries / postings / bank transactions / expenses change
 *   3. migration 202615450900 gives feed_intake_checks the DELETE-only, listed-row arm (UPDATE still refused)
 * LIVE (DATABASE_URL required — an unread count is not a pass)
 *   4. every ORPHANS predicate counts 0 for USMCA
 * Run: node scripts/verify-no-orphan-of-purged-documents.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-no-orphan-of-purged-documents";
const REQUIRED = [
  "driver_finance.feed_intakes", "driver_finance.feed_intake_checks", "reports.lane_profitability_cache",
  "reports.deadhead_cache", "safety.fuel_gps_matches", "pwa.driver_notifications", "fuel.tank_events",
  "docs.files", "docs.file_links", "mdata.load_stops",
];
const F = {
  cls: "scripts/purge/usmca-purge-classification.json",
  exec: "scripts/purge/purge-orphans-of-purged-documents.mts",
  mig: "db/migrations/202615450900_feed_intake_checks_admit_listed_purge.sql",
};

export function staticProblems(src) {
  const p = [];
  let orphans = {};
  try { orphans = JSON.parse(src.cls).ORPHANS ?? {}; } catch { p.push("classification is not valid JSON"); }
  for (const t of REQUIRED) {
    const w = orphans[t]?.where ?? "";
    if (!w) p.push(`${t} has no orphan predicate in ORPHANS`);
    else if (!/NOT EXISTS/.test(w)) p.push(`${t} predicate must select rows whose parent does NOT exist`);
  }
  if (Object.keys(orphans).some((t) => t.startsWith("banking."))) p.push("banking is never an orphan target");
  if (!/accounting\._purge_rows_cascade\(/.test(src.exec) || !/INSERT INTO _system\.purge_authorized_rows/.test(src.exec)) p.push("executor must list rows for an AUTH and delete through accounting._purge_rows_cascade");
  if (/\bDELETE FROM\b/i.test(src.exec)) p.push("executor must not DELETE directly");
  if (!/banking changed/.test(src.exec) || !/bank_transactions/.test(src.exec)) p.push("executor must fail closed when banking counts change");
  if (!/Snapshot every table's orphans first/.test(src.exec)) p.push("executor must snapshot orphan ids before deleting");
  if (!/TG_OP = 'DELETE' AND v_auth ~ '\^AUTH-\[0-9\]\+\$'/.test(src.mig) || !/RAISE EXCEPTION 'feed_intake_checks is append-only/.test(src.mig)) p.push("feed_intake_checks arm must be DELETE-only and keep refusing everything else");
  return p;
}

export function liveProblems(counts) {
  return Object.entries(counts).filter(([, n]) => n > 0).map(([t, n]) => `live: ${t} has ${n} row(s) whose parent document no longer exists`);
}

function selftest() {
  const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
  const good = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, read(rel)]));
  const bad = [];
  if (staticProblems(good).length) bad.push(`real tree flagged: ${staticProblems(good).join("; ")}`);
  const cls = JSON.parse(good.cls);
  const drop = structuredClone(cls); delete drop.ORPHANS["reports.lane_profitability_cache"];
  if (!staticProblems({ ...good, cls: JSON.stringify(drop) }).some((x) => /lane_profitability_cache/.test(x))) bad.push("a dropped table passed");
  const bank = structuredClone(cls); bank.ORPHANS["banking.bank_transactions"] = { where: "NOT EXISTS (SELECT 1)" };
  if (!staticProblems({ ...good, cls: JSON.stringify(bank) }).some((x) => /banking/.test(x))) bad.push("a banking target passed");
  if (!staticProblems({ ...good, exec: good.exec + "\nawait c.query(`DELETE FROM reports.deadhead_cache`);" }).some((x) => /DELETE directly/.test(x))) bad.push("an ad-hoc DELETE passed");
  if (!staticProblems({ ...good, mig: good.mig.replace("TG_OP = 'DELETE' AND ", "") }).some((x) => /DELETE-only/.test(x))) bad.push("an arm that admits UPDATE passed");
  if (liveProblems({ "docs.files": 3 }).length !== 1 || liveProblems({ "docs.files": 0 }).length !== 0) bad.push("live count logic wrong");
  if (bad.length) { console.error(`${LABEL} SELFTEST FAILED:\n  - ${bad.join("\n  - ")}`); process.exit(1); }
  console.log(`${LABEL} SELFTEST OK — 6/6 (real tree passes; dropped table, banking target, ad-hoc DELETE, UPDATE-admitting arm caught; live counts honoured)`);
  process.exit(0);
}
if (process.argv.includes("--selftest")) selftest();

const src = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, fs.readFileSync(path.join(ROOT, rel), "utf8")]));
const problems = staticProblems(src);
let note = "";
if (!process.env.DATABASE_URL) problems.push("live: DATABASE_URL not set — orphans were not counted, and an unread count is not a pass");
else {
  const cls = JSON.parse(src.cls);
  const { default: pg } = await import("pg");
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    await c.query("BEGIN READ ONLY");
    await c.query("SELECT set_config('app.bypass_rls','lucia',true)");
    const counts = {};
    for (const [t, def] of Object.entries(cls.ORPHANS)) {
      if (t.startsWith("_")) continue;
      counts[t] = Number((await c.query(`SELECT count(*) n FROM ${t} t WHERE ${def.where}`, [cls._company_id])).rows[0].n);
    }
    await c.query("ROLLBACK");
    problems.push(...liveProblems(counts));
    note = Object.entries(counts).map(([t, n]) => `${t} ${n}`).join(", ");
  } finally { await c.end(); }
}
if (problems.length) { console.error(`${LABEL} FAIL\n  - ${problems.join("\n  - ")}`); process.exit(1); }
console.log(`${LABEL} OK — no USMCA row points at a purged load / invoice / settlement / driver bill / fuel transaction; live: ${note}`);

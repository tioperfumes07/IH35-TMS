#!/usr/bin/env node
// ROUND 390 (a)/(b)/(c) — NO ORPHANED GL (Lead acceptance test, 2026-10-04).
//
// Measured live: 60 of the 61 double-reversal originals (AUTH-397-UNWIND) had NO expense record — the document was
// removed and its journal entries LEFT, holding $2,976.63 on A/P 2000 / 9000; the void engine then re-reversed them.
//
// static (default, read-only, no database):
//   1. migration 202615410100 installs accounting.refuse_document_delete_leaving_gl as a SECURITY DEFINER function
//      with a pinned search_path, attached as a DEFERRABLE INITIALLY DEFERRED constraint trigger, refusing with
//      IH35_DOCUMENT_DELETE_LEAVES_GL — and its table -> types map equals scripts/lib/orphan-gl.mjs DOC_SOURCE;
//   2. the purge engine takes DOC_SOURCE from the lib, refuses its plan through orphanPlanProblems, and proves no
//      posting names a removed document after its deletes (ORPHAN PROOF) in the same transaction.
// --selftest: plants orphans against the pure plan check (no data is written anywhere) and plants defects into the
//   migration / engine source; every plant must be caught and the real files must pass.
// --live (read-only, FAIL-CLOSED): the trigger is installed on every document table, and no USMCA posting line names
//   a document that no longer exists. Until AUTH-397-UNWIND lands, --live reports the 60 orphaned documents.
import { readFileSync } from "node:fs";
import { DOC_SOURCE, orphanPlanProblems, orphanCountSql } from "./lib/orphan-gl.mjs";

const LABEL = "verify-no-orphaned-gl";
const ROOT = new URL("../", import.meta.url);
const MIGRATION = "db/migrations/202615410100_refuse_document_delete_leaving_gl.sql";
const ENGINE = "scripts/ops/2026-10-02-cc1-r326-complete-delete.ts";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const read = (rel) => readFileSync(new URL(rel, ROOT), "utf8");

export function migrationProblems(sql) {
  const p = [];
  if (!/CREATE OR REPLACE FUNCTION accounting\.refuse_document_delete_leaving_gl\(\)/.test(sql)) p.push("function accounting.refuse_document_delete_leaving_gl() missing");
  if (!/^SECURITY DEFINER$/m.test(sql)) p.push("function must be SECURITY DEFINER (RLS would hide another company's lines and the check would pass by not looking)");
  if (!/SET search_path = pg_catalog, pg_temp/.test(sql)) p.push("SECURITY DEFINER function must pin search_path");
  if (!/CREATE CONSTRAINT TRIGGER trg_refuse_document_delete_leaving_gl AFTER DELETE ON %s '\s*'DEFERRABLE INITIALLY DEFERRED/.test(sql)) p.push("trigger must be a CONSTRAINT TRIGGER AFTER DELETE ... DEFERRABLE INITIALLY DEFERRED (judged at COMMIT, any delete order)");
  if (!/IH35_DOCUMENT_DELETE_LEAVES_GL/.test(sql)) p.push("refusal code IH35_DOCUMENT_DELETE_LEAVES_GL missing");
  if (!/p\.source_transaction_id = OLD\.id::text/.test(sql) || !/p\.source_transaction_type = ANY \(TG_ARGV::text\[\]\)/.test(sql)) p.push("check must match source_transaction_type = ANY(TG_ARGV) AND source_transaction_id = OLD.id");
  const map = {};
  for (const m of sql.matchAll(/\('([a-z_]+\.[a-z_]+)',\s*ARRAY\[([^\]]*)\]\)/g)) map[m[1]] = [...m[2].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
  const want = JSON.stringify(Object.keys(DOC_SOURCE).sort().map((k) => [k, DOC_SOURCE[k]]));
  const got = JSON.stringify(Object.keys(map).sort().map((k) => [k, map[k]]));
  if (want !== got) p.push(`migration table -> types map differs from scripts/lib/orphan-gl.mjs DOC_SOURCE (lib ${want} vs migration ${got})`);
  return p;
}

export function engineProblems(src) {
  const p = [];
  if (!/import \{ DOC_SOURCE as ORPHAN_DOC_SOURCE, orphanPlanProblems \} from "\.\.\/lib\/orphan-gl\.mjs"/.test(src)) p.push("engine must import DOC_SOURCE + orphanPlanProblems from scripts/lib/orphan-gl.mjs");
  if (!/const DOC_SOURCE: Record<string, string\[\]> = ORPHAN_DOC_SOURCE;/.test(src)) p.push("engine must take DOC_SOURCE from the lib (one map, not two)");
  if (!/for \(const b of orphanPlanProblems\(/.test(src)) p.push("engine plan must run orphanPlanProblems and push its BLOCKERs");
  if (!/ORPHAN PROOF FAILED/.test(src) || !/const orphansLeft = await orphanPostingsFor\(client, plan\);/.test(src)) p.push("engine must prove, after its deletes and before COMMIT, that no posting names a removed document");
  return p;
}

function selftest() {
  const fails = [];
  const line = (id, doc, extra = {}) => ({ id, source_transaction_type: "expense", source_transaction_id: doc, reversed_by_line_id: null, reversal_of_line_id: null, ...extra });
  const voidedPair = [line("L1", "E1", { reversed_by_line_id: "L2" }), line("L2", "E1", { reversal_of_line_id: "L1" })];
  // Plant 1: the document is removed, its (voided) lines are not -> orphaned GL.
  if (!orphanPlanProblems({ "accounting.expenses": ["E1"] }, voidedPair, new Set()).some((x) => /NOT in the plan/.test(x))) fails.push("plant 'document without its lines' not caught");
  // Plant 2: the document still has a LIVE line -> reverse first.
  if (!orphanPlanProblems({ "accounting.expenses": ["E1"] }, [line("L1", "E1")], new Set(["L1"])).some((x) => /LIVE posting/.test(x))) fails.push("plant 'document with live GL' not caught");
  // Plant 3: one of two lines left behind.
  if (!orphanPlanProblems({ "accounting.expenses": ["E1"] }, voidedPair, new Set(["L1"])).some((x) => /1 posting line\(s\) naming it are NOT in the plan/.test(x))) fails.push("plant 'half the pair left' not caught");
  // Clean: voided document removed with both lines -> no problem; a line naming a document NOT removed -> no problem.
  const clean = orphanPlanProblems({ "accounting.expenses": ["E1"] }, [...voidedPair, line("L9", "E9")], new Set(["L1", "L2"]));
  if (clean.length) fails.push(`clean plan flagged: ${clean.join("; ")}`);
  // Source plants.
  const mig = read(MIGRATION);
  const eng = read(ENGINE);
  if (migrationProblems(mig).length) fails.push(`real migration flagged: ${migrationProblems(mig).join("; ")}`);
  if (engineProblems(eng).length) fails.push(`real engine flagged: ${engineProblems(eng).join("; ")}`);
  const migPlants = [
    ["not deferred", mig.replace(/'DEFERRABLE INITIALLY DEFERRED /, "'")],
    ["not security definer", mig.replace(/^SECURITY DEFINER$/m, "")],
    ["table dropped from map", mig.replace("('accounting.bills',                  ARRAY['bill']),", "")],
  ];
  for (const [n, src] of migPlants) if (!migrationProblems(src).length) fails.push(`migration plant '${n}' not caught`);
  const engPlants = [
    ["no plan check", eng.replace("for (const b of orphanPlanProblems(", "for (const b of [] as string[] || (")],
    ["no after-delete proof", eng.replace("ORPHAN PROOF FAILED", "ORPHAN CHECK")],
  ];
  for (const [n, src] of engPlants) if (!engineProblems(src).length) fails.push(`engine plant '${n}' not caught`);
  if (fails.length) {
    console.error(`${LABEL} --selftest FAIL — ${fails.join(" | ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (3/3 orphan plants caught, clean plan clean, ${migPlants.length + engPlants.length}/${migPlants.length + engPlants.length} source plants caught)`);
}

async function live() {
  const { requireLiveDbOrExit } = await import("./lib/require-live-db.mjs");
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    const trg = (await client.query(
      `SELECT c.oid::regclass::text AS t FROM pg_trigger tg JOIN pg_class c ON c.oid = tg.tgrelid
        WHERE tg.tgname = 'trg_refuse_document_delete_leaving_gl' AND tg.tgdeferrable AND tg.tginitdeferred`)).rows.map((r) => r.t);
    const missing = Object.keys(DOC_SOURCE).filter((t) => !trg.includes(t));
    const rows = (await client.query(orphanCountSql(), [USMCA])).rows.filter((r) => r.lines > 0);
    await client.query("ROLLBACK");
    const problems = [];
    if (missing.length) problems.push(`deferred trigger trg_refuse_document_delete_leaving_gl missing on: ${missing.join(", ")}`);
    for (const r of rows) problems.push(`${r.doc_table}: ${r.lines} posting line(s) in ${r.entries} entr(ies) (${r.live_lines} live; ${r.nonzero_accounts} account(s) not netting to zero across those whole entries) name ${r.docs} document(s) that no longer exist`);
    if (problems.length) {
      console.error(`${LABEL}: LIVE FAIL — ${problems.join("; ")}`);
      process.exit(1);
    }
    console.log(`${LABEL}: LIVE PASS — trigger on all ${Object.keys(DOC_SOURCE).length} document tables; no USMCA posting names a removed document`);
  } finally {
    client.release();
    await pool.end();
  }
}

selftest();
if (process.argv.includes("--selftest")) process.exit(0);
const problems = [...migrationProblems(read(MIGRATION)), ...engineProblems(read(ENGINE))];
if (problems.length) {
  console.error(`${LABEL}: FAIL — ${problems.join("; ")}`);
  process.exit(1);
}
console.log(`${LABEL}: static PASS — deferred no-orphan trigger + engine plan check + after-delete proof`);
if (process.argv.includes("--live")) await live();

#!/usr/bin/env node
/**
 * Thin INV wrappers for C25–C31. Disk wiring is NOT a PASS of the invariant.
 * Default (no --selftest, no --live): FAIL CLOSED — cannot certify GL from a file read.
 * --selftest: plant-remove INV echo from a copy of verify-gl-invariants.sql; must detect.
 * --live: requires DATABASE_URL. Since 2026-08-30 this is genuinely wired — packet 9
 *   ("RECOMMENDATION — THE PERMANENT SOLUTION") + packet 8 ("GO-HIGHBAR") built the keystone
 *   (scripts/proof-engine/sql-runner.mjs) that these wrappers were deliberately left FAIL-CLOSED
 *   FOREVER pending ("a wrapper around an unconnected runner is a wrapper around nothing" —
 *   packet 8). CC-1 proved the runner connected and cross-verified its output against the
 *   owner's own hand-checked numbers (2026-08-30, ACCT-F10123) before this file was allowed to
 *   stop being a permanent stub. `--live` now REPLAYS the real proof via econ-proofs.mjs +
 *   sql-runner.mjs — the SAME mechanism, not a second parallel implementation — and reports its
 *   actual result. It still never fabricates PASS: no DATABASE_URL, no columnId, or the replay
 *   itself failing all FAIL CLOSED exactly as before.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const INV_SQL = path.join(ROOT, "scripts/verify-gl-invariants.sql");

export function extractNeedles(sql, needles) {
  const missing = needles.filter((n) => !sql.includes(n));
  return missing;
}

export async function runInvWrapper(opts) {
  const { label, needles, columnId, argv = process.argv } = opts;
  const selftest = argv.includes("--selftest");
  const live = argv.includes("--live");

  if (!fs.existsSync(INV_SQL)) {
    console.error(`${label} FAIL CLOSED missing ${INV_SQL}`);
    process.exit(1);
  }
  const sql = fs.readFileSync(INV_SQL, "utf8");

  if (selftest) {
    const planted = sql.replace(needles[0], "PLANTED_REMOVED");
    const miss = extractNeedles(planted, needles);
    if (!miss.length) {
      console.error(`${label} --selftest FAIL — planted removal of ${needles[0]} was NOT detected`);
      process.exit(1);
    }
    const cleanMiss = extractNeedles(sql, needles);
    if (cleanMiss.length) {
      console.error(`${label} --selftest FAIL — clean SQL missing ${cleanMiss.join(",")}`);
      process.exit(1);
    }
    console.log(`${label} --selftest PASS`);
    process.exit(0);
  }

  const missing = extractNeedles(sql, needles);
  if (missing.length) {
    console.error(`${label} FAIL CLOSED SQL missing ${missing.join(",")}`);
    process.exit(1);
  }

  if (live) {
    if (!process.env.DATABASE_URL) {
      console.error(`${label} FAIL CLOSED --live requires DATABASE_URL`);
      process.exit(1);
    }
    if (!columnId) {
      console.error(`${label} FAIL CLOSED --live requires a columnId bound to econ-proofs.mjs`);
      process.exit(1);
    }
    const { ECON_PROOFS } = await import("../proof-engine/econ-proofs.mjs");
    const { makeSqlRunner } = await import("../proof-engine/sql-runner.mjs");
    const entry = ECON_PROOFS[columnId];
    if (!entry) {
      console.error(`${label} FAIL CLOSED: no economic proof bound for column "${columnId}"`);
      process.exit(1);
    }
    const runSql = makeSqlRunner({ repoRoot: ROOT, connectionString: process.env.DATABASE_URL });
    const proofs = entry.second_half ? [entry.proof, entry.second_half] : [entry.proof];
    const results = [];
    for (const p of proofs) results.push(await runSql(p));
    const bad = results.filter((r) => !r.ok);
    if (bad.length) {
      console.error(`${label} FAIL (live): ${bad.length}/${results.length} proof(s) failed`);
      for (const r of results) console.error(`  ok=${r.ok} observed=${JSON.stringify(r.observed)} err=${r.err ?? ""}`);
      process.exit(1);
    }
    console.log(`${label} PASS (live): ${results.length}/${results.length} proof(s) replayed against real prod`);
    for (const r of results) console.log(`  observed=${JSON.stringify(r.observed)}`);
    process.exit(0);
  }

  console.error(
    `${label} FAIL CLOSED: wiring of ${needles.join(" + ")} is present in verify-gl-invariants.sql but this check cannot PASS without a Neon INV run. Use --selftest for the plant. Economics is not satisfiable by a screen or a sentence.`,
  );
  process.exit(1);
}

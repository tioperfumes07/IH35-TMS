#!/usr/bin/env node
/**
 * Thin INV wrappers for C25–C31. Disk wiring is NOT a PASS of the invariant.
 * Default (no --selftest, no --live): FAIL CLOSED — cannot certify GL from a file read.
 * --selftest: plant-remove INV echo from a copy of verify-gl-invariants.sql; must detect.
 * --live: requires DATABASE_URL; still FAIL CLOSED until psql exec is allowlisted (no silent PASS).
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

export function runInvWrapper(opts) {
  const { label, needles, argv = process.argv } = opts;
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
    console.error(
      `${label} FAIL CLOSED: live psql exec is not wired in this wrapper — will not print PASS from disk or env presence`,
    );
    process.exit(1);
  }

  console.error(
    `${label} FAIL CLOSED: wiring of ${needles.join(" + ")} is present in verify-gl-invariants.sql but this check cannot PASS without a Neon INV run. Use --selftest for the plant. Economics is not satisfiable by a screen or a sentence.`,
  );
  process.exit(1);
}

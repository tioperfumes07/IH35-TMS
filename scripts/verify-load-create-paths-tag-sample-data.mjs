#!/usr/bin/env node
/**
 * FAIL-T1 — EVERY load-create path must write `mdata.loads.is_sample_data`.
 *
 * There are TWO writers, and they mint different-looking load numbers, which is exactly why one of them
 * went unnoticed for six loads:
 *
 *   A  dispatch/book-load.service.ts        numbers via load-id-reservation.service.ts:74 -> "L-<ymd>-<seq>"
 *      (the Book wizard)                    has written is_sample_data since FAIL-D6.
 *   B  mdata/loads.routes.ts                numbers via nextLoadNumber -> "L<COMPANY_TOKEN>-<ymd>-<seq>"
 *      (POST /api/v1/mdata/loads)           OMITTED the column entirely, so every row took the false default.
 *
 * Prod 2026-08-08: LUSMCAFREIGHT-20260808-0001..0004 and two older rows were 0-for-6 tagged AT INSERT
 * (-0001 only reads true because it was hand-patched at 20:05:14), while the "L-" path was 11-of-11.
 * Same opco, no prefix column in the DB — the split was purely in code.
 *
 * This is not a labelling nit. An untagged load is indistinguishable from a real one, and a single
 * Delivered step on it fires revenue recognition into REAL income.
 *
 * The guard also enforces LOCKSTEP arity on the route's INSERT, because the failure mode when someone adds
 * a column without a placeholder is a runtime 500, not a compile error.
 *
 *   node scripts/verify-load-create-paths-tag-sample-data.mjs
 *   node scripts/verify-load-create-paths-tag-sample-data.mjs --selftest
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELFTEST = process.argv.includes("--selftest");
const LABEL = "verify-load-create-paths-tag-sample-data";
const ROUTE = "apps/backend/src/mdata/loads.routes.ts";
const WIZARD = "apps/backend/src/dispatch/book-load.service.ts";

/** Pull the `INSERT INTO mdata.loads ( ... ) VALUES ( ... )` column list + placeholder list. */
function readInsert(src) {
  const m = /INSERT INTO mdata\.loads\s*\(([\s\S]*?)\)\s*VALUES\s*\(([\s\S]*?)\)/i.exec(src);
  if (!m) return null;
  const columns = m[1]
    .split(",")
    .map((c) => c.replace(/--[^\n]*/g, "").trim())
    .filter(Boolean);
  const placeholders = [...m[2].matchAll(/\$(\d+)/g)].map((p) => Number(p[1]));
  return { columns, placeholders };
}

function assert(files) {
  const problems = [];
  const route = files[ROUTE] ?? "";
  const wizard = files[WIZARD] ?? "";

  // Path B — the one that regressed.
  const ins = readInsert(route);
  if (!ins) {
    problems.push(`${ROUTE}: could not locate the INSERT INTO mdata.loads (...) VALUES (...) — anchor drifted`);
  } else {
    if (!ins.columns.includes("is_sample_data")) {
      problems.push(
        `${ROUTE}: INSERT INTO mdata.loads must include is_sample_data (FAIL-T1). Without it every load ` +
          `created through POST /api/v1/mdata/loads takes the false default and is indistinguishable from ` +
          `a real load — one Delivered step then fires revrec into REAL income.`,
      );
    }
    const distinct = new Set(ins.placeholders).size;
    if (distinct !== ins.columns.length) {
      problems.push(
        `${ROUTE}: lockstep broken — ${ins.columns.length} columns vs ${distinct} distinct placeholders. ` +
          `Column list, placeholder list and the values array must grow together (this fails at RUNTIME, not compile).`,
      );
    }
  }

  // The route must be able to RECEIVE the flag, or the column is written but never true.
  if (!/is_sample_data:\s*z\./.test(route)) {
    problems.push(`${ROUTE}: createLoadBodySchema must accept is_sample_data, or the column can never be set true`);
  }

  // Path A — must not regress the other way.
  if (!/is_sample_data/.test(wizard)) {
    problems.push(`${WIZARD}: the Book wizard create path must keep writing is_sample_data (FAIL-D6)`);
  }

  return problems;
}

const files = Object.fromEntries([ROUTE, WIZARD].map((rel) => [rel, readFileSync(path.join(ROOT, rel), "utf8")]));

if (SELFTEST) {
  const checks = [];

  // 1. Plant the original FAIL-T1: drop the column (and its placeholder, so arity stays consistent).
  const untagged = {
    ...files,
    [ROUTE]: files[ROUTE].replace("dispatcher_user_id, notes, is_sample_data", "dispatcher_user_id, notes").replace(
      "$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13",
      "$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12",
    ),
  };
  checks.push(["untagged INSERT", assert(untagged).some((p) => /must include is_sample_data/.test(p))]);

  // 2. Plant a lockstep break: column added, placeholder not.
  const arity = {
    ...files,
    [ROUTE]: files[ROUTE].replace("$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13", "$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12"),
  };
  checks.push(["lockstep arity", assert(arity).some((p) => /lockstep broken/.test(p))]);

  // 3. Plant a regression on path A.
  const wizardBroken = { ...files, [WIZARD]: files[WIZARD].replace(/is_sample_data/g, "unrelated_field") };
  checks.push(["wizard regression", assert(wizardBroken).some((p) => /FAIL-D6/.test(p))]);

  const failed = checks.filter(([, caught]) => !caught).map(([n]) => n);
  if (failed.length) {
    console.error(`${LABEL} SELFTEST FAIL — not caught: ${failed.join(", ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — ${checks.length}/${checks.length} planted regressions caught`);
  process.exit(0);
}

const problems = assert(files);
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log(`${LABEL}: OK — both load-create paths write is_sample_data; route INSERT is lockstep`);
process.exit(0);

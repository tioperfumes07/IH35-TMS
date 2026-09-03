#!/usr/bin/env node
/**
 * ACCT-F19367 REGRESSION GUARD — settlement + cash-advance-request display-id generators must
 * keep their pg_advisory_xact_lock race protection (fixed live 2026-09-01, PR #19374, migration
 * 202613340001). Before that fix, driver_finance.next_settlement_display_id() was a bare
 * `SELECT MAX(...)+1` with zero race protection, unlike every sibling display-id series
 * (accounting/display-id.ts's withDisplayLock pattern) — two concurrent settlement closes in the
 * same (operating_company_id, year) window could collide (a real unique index on display_id
 * turned that into a 500, not a silent duplicate, but still failed the "no collision on
 * concurrent same-window creates" bar every other series meets).
 *
 * Guard asserts, statically (no DB connection required):
 *  1) the MOST RECENT `CREATE OR REPLACE FUNCTION driver_finance.next_settlement_display_id`
 *     definition across db/migrations/*.sql (Postgres applies them in order, so the last one wins
 *     — same "most recent definition is truth" principle as schema-parity) contains
 *     pg_advisory_xact_lock BEFORE its MAX(...)+1 read.
 *  2) apps/backend/src/driver-finance/cash-advance-requests.service.ts still carries the sibling
 *     pg_advisory_xact_lock call ahead of its own display-id read.
 *
 * --selftest strips the lock from each in a scratch copy and expects both to redden.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = path.join(ROOT, "db/migrations");
const CASH_ADVANCE_FILE = "apps/backend/src/driver-finance/cash-advance-requests.service.ts";
const LABEL = "verify-settlement-display-id-advisory-lock";
const FUNC_NAME = "driver_finance.next_settlement_display_id";

/** Strip `--` SQL line comments — a comment mentioning "MAX()+1" or the lock call must never
 * satisfy either check; only real code counts. */
function stripSqlComments(sql) {
  return sql
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("--");
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join("\n");
}

/** Strip `//` TS line comments for the same reason. */
function stripTsLineComments(ts) {
  return ts
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("//");
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join("\n");
}

/** Extract every CREATE OR REPLACE FUNCTION <FUNC_NAME> ... $$...$$/$function$...$function$ body, in file order. */
function extractFunctionBodies(sql, funcName) {
  const bodies = [];
  const escaped = funcName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headerRe = new RegExp(`CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+${escaped}\\s*\\(`, "gi");
  let m;
  while ((m = headerRe.exec(sql))) {
    const startIdx = m.index;
    // Find the dollar-quote tag opening the body (e.g. $function$ or $$) after the header.
    const tagMatch = /\$[A-Za-z_]*\$/.exec(sql.slice(startIdx));
    if (!tagMatch) continue;
    const tag = tagMatch[0];
    const tagOpenIdx = startIdx + tagMatch.index + tag.length;
    const tagCloseIdx = sql.indexOf(tag, tagOpenIdx);
    if (tagCloseIdx === -1) continue;
    bodies.push(sql.slice(tagOpenIdx, tagCloseIdx));
  }
  return bodies;
}

/** @param {string} migrationsDir @param {string} cashAdvanceFile */
export function check(migrationsDir = MIGRATIONS_DIR, cashAdvanceFile = path.join(ROOT, CASH_ADVANCE_FILE)) {
  const errors = [];

  const files = fs.existsSync(migrationsDir)
    ? fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()
    : [];
  let lastBody = null;
  let lastFile = null;
  for (const f of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, f), "utf8");
    const bodies = extractFunctionBodies(sql, FUNC_NAME);
    if (bodies.length) {
      lastBody = bodies[bodies.length - 1];
      lastFile = f;
    }
  }

  if (!lastBody) {
    errors.push(`No CREATE OR REPLACE FUNCTION ${FUNC_NAME} found in ${migrationsDir} — cannot verify race protection.`);
  } else {
    const bodyCode = stripSqlComments(lastBody);
    if (!/pg_advisory_xact_lock\s*\(/.test(bodyCode)) {
      errors.push(
        `${lastFile}: the most recent ${FUNC_NAME} definition has no pg_advisory_xact_lock call — ` +
          `regression of ACCT-F19367 (PR #19374). Two concurrent settlement closes in the same ` +
          `(operating_company_id, year) window can collide again.`
      );
    } else {
      // The lock must precede the MAX(...) read, not follow it (a lock after the read protects nothing).
      // Comments stripped first so a mention of "MAX()+1" in prose can't fake the ordering check.
      const lockIdx = bodyCode.search(/pg_advisory_xact_lock\s*\(/);
      const maxIdx = bodyCode.search(/MAX\s*\(/i);
      if (maxIdx !== -1 && lockIdx > maxIdx) {
        errors.push(`${lastFile}: pg_advisory_xact_lock appears AFTER the MAX(...) read — locks after the race window closes protect nothing.`);
      }
    }
  }

  const cashAdvanceSrc = fs.existsSync(cashAdvanceFile)
    ? stripTsLineComments(fs.readFileSync(cashAdvanceFile, "utf8"))
    : "";
  if (!fs.existsSync(cashAdvanceFile)) {
    errors.push(`${cashAdvanceFile} not found — cannot verify the sibling cash-advance-request display-id lock.`);
  } else if (!/pg_advisory_xact_lock\s*\(/.test(cashAdvanceSrc)) {
    errors.push(
      `${CASH_ADVANCE_FILE}: no pg_advisory_xact_lock call — regression of ACCT-F19367's cash-advance-request half (PR #19374).`
    );
  }

  return errors;
}

function selftest() {
  const tmp = fs.mkdtempSync(path.join(ROOT, "tmp-settlement-lock-"));
  // process.exit() inside the try would skip the finally's cleanup and leak the tmp dir — collect
  // a failure message instead and exit once, after cleanup, from outside the try.
  let failMsg = null;
  try {
    // Scenario 1: migrations dir with the lock stripped from the last definition.
    const migDir = path.join(tmp, "migrations");
    fs.mkdirSync(migDir, { recursive: true });
    const realFiles = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
    let lastFuncFile = null;
    for (const f of realFiles) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8");
      if (extractFunctionBodies(sql, FUNC_NAME).length) lastFuncFile = f;
    }
    if (!lastFuncFile) throw new Error("selftest setup: no real migration defines the function — cannot plant a defect");
    for (const f of realFiles) {
      let sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8");
      if (f === lastFuncFile) {
        sql = sql.replace(/PERFORM\s+pg_advisory_xact_lock\([^)]*\);?/, "-- lock removed by selftest");
      }
      fs.writeFileSync(path.join(migDir, f), sql);
    }
    const cashAdvanceOk = path.join(tmp, "cash-advance-ok.ts");
    fs.copyFileSync(path.join(ROOT, CASH_ADVANCE_FILE), cashAdvanceOk);

    const errs1 = check(migDir, cashAdvanceOk);
    if (!errs1.some((e) => /pg_advisory_xact_lock/.test(e))) {
      failMsg = `${LABEL} selftest FAIL — stripped SQL lock did not redden`;
    }

    // Scenario 2: cash-advance-requests.service.ts with the lock call stripped.
    const migDirClean = path.join(tmp, "migrations-clean");
    fs.mkdirSync(migDirClean, { recursive: true });
    for (const f of realFiles) fs.copyFileSync(path.join(MIGRATIONS_DIR, f), path.join(migDirClean, f));
    const cashAdvanceStripped = path.join(tmp, "cash-advance-stripped.ts");
    const src = fs.readFileSync(path.join(ROOT, CASH_ADVANCE_FILE), "utf8").replace(
      /await client\.query\(`SELECT pg_advisory_xact_lock\(hashtext\(\$1\)\)`,[\s\S]*?\]\);/,
      "// lock removed by selftest"
    );
    fs.writeFileSync(cashAdvanceStripped, src);

    const errs2 = check(migDirClean, cashAdvanceStripped);
    if (!failMsg && !errs2.some((e) => e.includes("cash-advance-request"))) {
      failMsg = `${LABEL} selftest FAIL — stripped TS lock did not redden`;
    }

    if (!failMsg) console.log(`${LABEL} selftest PASS — both stripped locks correctly reddened`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  if (failMsg) {
    console.error(failMsg);
    process.exit(1);
  }
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = check();
if (errors.length) {
  console.error(`${LABEL} FAIL:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — settlement + cash-advance-request display-id generators still race-protected`);

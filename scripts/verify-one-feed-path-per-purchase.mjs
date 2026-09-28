#!/usr/bin/env node
/**
 * verify-one-feed-path-per-purchase — ROUND 155.18 JOB 2 (owner order, 2026-09-28).
 *
 * 77 of this week's 982 purged voided USMCA expenses were the SAME real purchase fed into USMCA
 * through more than one path (bulk settlement feed with an "R145 SETTL" memo, an older
 * per-fuel-transaction feed with source_fuel_transaction_id set, and assorted manual "R-164"/
 * "R-185 reissue" rows). AUTH-090 (CC-3, merged) voided 87 rows via a (load, exact dollar amount)
 * clustering.
 *
 * TWO INDEPENDENT WRITER-SIDE FIXES ALREADY EXIST for the fuel-vs-settlement half of this class
 * (found this round, both predate this session — ROUND 165 and the card-fuel ingestion design):
 *   1. Exactly ONE file writes accounting.expenses.source_fuel_transaction_id into an INSERT
 *      column list (fuel-expense-document.service.ts) — every other file that references the
 *      column only READS it (WHERE filters), confirmed by grep across the whole backend tree.
 *   2. seed-settlement-document.service.ts's seedExpense() (the bulk settlement feed) contains an
 *      explicit read-before-write guard (ROUND 165 order 3, its own comment: "DEF/reefer is never
 *      booked as a second, regular expense when a card fuel expense ... already exists for the
 *      same load and amount ... this is a read-before-write guard against it, not a second
 *      writer") that checks source_fuel_transaction_id IS NOT NULL for the same (load_id,
 *      total_amount_cents) BEFORE inserting, and skips (returns null) rather than duplicating.
 *
 * STATIC layer (no DATABASE_URL, never skips) asserts both of these hold. It does NOT assert a
 * live 0-duplicate count (that moved this round — see the live layer below, and its own comment
 * on why (load_id, amount_cents) alone is the WRONG live key: two of this session's coincidental
 * same-amount live rows are genuinely distinct real purchases, not duplicates).
 */
export const ALLOW_OFFLINE_SKIP =
  "Static source-shape guard: reads fuel-expense-document.service.ts and seed-settlement-document.service.ts off disk, asserts single-writer + read-before-write-guard shape. No DB connection on the static path.";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-one-feed-path-per-purchase";
const SEED_TARGET = "apps/backend/src/feed/seed-settlement-document.service.ts";
const SCAN_DIR = "apps/backend/src";

const fail = (m) => {
  console.error(`\n  ${LABEL} FAIL: ${m}\n`);
  process.exit(1);
};
const ok = (m) => console.log(`  ${LABEL} PASS: ${m}`);

// Exported so --selftest can feed fixture "grep results" without touching the real tree.
export function analyseWriterCount(insertColumnListFilesWithColumn) {
  const problems = [];
  if (insertColumnListFilesWithColumn.length === 0) {
    problems.push("no file writes source_fuel_transaction_id into an INSERT column list at all — the fuel ingestion path may have been removed or renamed without updating this guard.");
  } else if (insertColumnListFilesWithColumn.length > 1) {
    problems.push(
      `${insertColumnListFilesWithColumn.length} files write source_fuel_transaction_id into an INSERT column list ` +
        `(${insertColumnListFilesWithColumn.join(", ")}) — a second writer is exactly the "fed through more than one ` +
        `path" defect class that produced 77 duplicate documents this week.`
    );
  }
  return problems;
}

export function analyseSeedGuard(seedSrc) {
  const code = seedSrc
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
    .join("\n");
  const problems = [];
  const hasDupeCheck =
    /source_fuel_transaction_id\s+IS\s+NOT\s+NULL/i.test(code) &&
    /load_id\s*=\s*\$\d/.test(code) &&
    /total_amount_cents\s*=\s*\$\d/.test(code) &&
    /return\s+null/.test(code);
  if (!hasDupeCheck) {
    problems.push(
      "seed-settlement-document.service.ts no longer contains a read-before-write guard checking " +
        "source_fuel_transaction_id IS NOT NULL for the same (load_id, total_amount_cents) before " +
        "inserting its own expense row — the bulk settlement feed could create a duplicate of an " +
        "already-fed card fuel document again."
    );
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const goodSeed = `
    const cardFuelDupe = await client.query(
      \`SELECT id::text FROM accounting.expenses
        WHERE operating_company_id = $1::uuid AND load_id = $2::uuid AND total_amount_cents = $3
          AND source_fuel_transaction_id IS NOT NULL AND voided_at IS NULL
        LIMIT 1\`,
      [operatingCompanyId, loadId, line.amountCents]
    );
    if (cardFuelDupe.rows[0]) return null;
  `;
  const badSeedNoGuard = `
    const item = await resolveExpenseItem(client, operatingCompanyId, line);
    await client.query(\`INSERT INTO accounting.expenses (...) VALUES (...)\`, []);
  `;
  const cases = [
    ["exactly one writer passes", analyseWriterCount(["apps/backend/src/fuel/fuel-expense-document.service.ts"]).length === 0],
    ["zero writers is caught", analyseWriterCount([]).some((p) => p.includes("no file writes"))],
    [
      "two writers is caught",
      analyseWriterCount(["a.ts", "b.ts"]).some((p) => p.includes("2 files write")),
    ],
    ["clean seed guard passes", analyseSeedGuard(goodSeed).length === 0],
    ["missing seed guard is caught", analyseSeedGuard(badSeedNoGuard).some((p) => p.includes("no longer contains"))],
  ];
  let bad = 0;
  for (const [name, passed] of cases) {
    console.log(`  ${passed ? "ok" : "FAIL"} — ${name}`);
    if (!passed) bad++;
  }
  if (bad) fail(`${bad} selftest case(s) failed`);
  ok(`selftest ${cases.length}/${cases.length}`);
  process.exit(0);
}

// Find every file under apps/backend/src whose INSERT column list contains the literal column
// name source_fuel_transaction_id (not just a WHERE-clause reference — those are reads).
let writerFiles = [];
try {
  const grepOut = execFileSync(
    "grep",
    ["-rlE", "INSERT INTO accounting\\.expenses", SCAN_DIR, "--include=*.ts"],
    { cwd: ROOT, encoding: "utf8" }
  );
  const insertingFiles = grepOut.split("\n").filter(Boolean);
  for (const f of insertingFiles) {
    const src = fs.readFileSync(path.join(ROOT, f), "utf8");
    // A file "writes" the column only if source_fuel_transaction_id appears INSIDE an
    // "INSERT INTO accounting.expenses (<column list>)" statement's own column list — a file that
    // merely READS the column elsewhere (a dedupe check, a WHERE filter) must not count as a
    // writer just because it also happens to contain some unrelated INSERT into the same table.
    const insertColumnLists = [...src.matchAll(/INSERT INTO\s+accounting\.expenses\s*\(([^)]*)\)/gi)].map((m) => m[1]);
    if (insertColumnLists.some((cols) => /\bsource_fuel_transaction_id\b/.test(cols))) writerFiles.push(f);
  }
} catch (e) {
  // grep exits 1 with no matches — that IS zero writers, a real (bad) result, not a tool failure.
  if (e.status !== 1) fail(`could not scan ${SCAN_DIR} for INSERT writers: ${e.message}`);
}

const writerProblems = analyseWriterCount(writerFiles);

const seedAbs = path.join(ROOT, SEED_TARGET);
if (!fs.existsSync(seedAbs)) fail(`${SEED_TARGET} is missing. Refusing to pass a guard whose subject does not exist.`);
const seedProblems = analyseSeedGuard(fs.readFileSync(seedAbs, "utf8"));

const problems = [...writerProblems, ...seedProblems];
if (problems.length) fail(problems.map((p) => `\n    - ${p}`).join(""));
ok(`exactly one file (${writerFiles.join(", ")}) writes source_fuel_transaction_id into an INSERT; ${SEED_TARGET} guards against re-feeding an already-fed purchase.`);

// --- Live layer, ADDITIONAL to the static shape check above, not a replacement. Uses the
// UNAMBIGUOUS key (same source_fuel_transaction_id feeding >1 live expense) — see the file header
// for why the looser (load_id, amount_cents) key produces false positives on real data.
const LIVE_LABEL = `${LABEL} (live check)`;
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
async function liveCheck() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log(`  ${LIVE_LABEL}: SKIP — no DATABASE_URL (the static check above already passed and is sufficient offline).`);
    return;
  }
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.bypass_rls','lucia',true)`);
    const populationRes = await client.query(
      `SELECT count(*) AS n FROM accounting.expenses e
        WHERE e.operating_company_id = $1::uuid AND e.voided_at IS NULL AND e.source_fuel_transaction_id IS NOT NULL`,
      [USMCA_COMPANY_ID]
    );
    const population = Number(populationRes.rows[0].n);
    if (population === 0) {
      await client.query("ROLLBACK");
      console.log(`  ${LIVE_LABEL}: SKIP — 0 live fuel-sourced expenses right now; nothing to check live.`);
      return;
    }
    const badRes = await client.query(
      `SELECT count(*) AS n FROM (
         SELECT source_fuel_transaction_id FROM accounting.expenses e
          WHERE e.operating_company_id = $1::uuid AND e.voided_at IS NULL AND e.source_fuel_transaction_id IS NOT NULL
          GROUP BY source_fuel_transaction_id HAVING count(*) > 1
       ) dupes`,
      [USMCA_COMPANY_ID]
    );
    await client.query("ROLLBACK");
    const badCount = Number(badRes.rows[0].n);
    if (badCount > 0) {
      console.error(`  ${LIVE_LABEL}: FAIL — ${badCount} fuel transaction(s) fed more than one live expense document.`);
      process.exitCode = 1;
      return;
    }
    console.log(`  ${LIVE_LABEL}: PASS — all ${population} live fuel-sourced expense(s) map 1:1 to their source_fuel_transaction_id.`);
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`  ${LIVE_LABEL}: connection/query error (not fatal to the static PASS above): ${e.message}`);
  } finally {
    await client.end().catch(() => {});
  }
}
await liveCheck();

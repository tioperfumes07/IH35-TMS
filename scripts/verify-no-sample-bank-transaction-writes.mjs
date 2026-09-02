#!/usr/bin/env node
// GO-19-02 (docs/lockdown/GO-19-BUILD-QUEUE.md slice 02) — "No new row may be written with
// is_sample_data true against USMCA. Fail the build if a seed script targets this company."
// Wired via scripts/verify-steps/10225-verify-no-sample-bank-transaction-writes.mjs (claimed number,
// two-PR protocol) — package.json wiring alone is forbidden (DEFINITION-OF-DONE.md §4).
//
// Static check: no application source may INSERT into banking.bank_transactions with a literal
// is_sample_data value of true (the DB trigger banking.forbid_sample_bank_transaction_insert(),
// migration 202613370001, is the live enforcement backstop — this catches the mistake at review
// time instead of at a 500 in prod). The one legitimate literal-true reference is the migration's
// own backfill UPDATE (not an INSERT), which this scan does not touch.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const require = createRequire(import.meta.url);
const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");
const { Client } = pg;

const ROOT = process.cwd();
const LABEL = "verify:no-sample-bank-transaction-writes";
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";

function fail(message) {
  console.error(`${LABEL} — FAILED\n- ${message}`);
  process.exit(1);
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
    } else if (/\.(ts|mjs|js)$/.test(entry.name) && !entry.name.includes(".test.") && !full.includes("__tests__")) {
      files.push(full);
    }
  }
  return files;
}

// root: directory to scan (apps/backend/src + scripts under it, or a synthetic tree for --selftest).
// selfPath: absolute path of this guard script itself, excluded from the scan (its own docstrings
// mention both trigger phrases).
function scanOffenders(root, selfPath) {
  const offenders = [];
  if (!fs.existsSync(root)) return offenders;
  for (const file of walk(root)) {
    if (selfPath && path.resolve(file) === selfPath) continue;
    const text = fs.readFileSync(file, "utf8");
    if (!text.includes("banking.bank_transactions")) continue;
    // Migration files are exempt — the backfill UPDATE and the guard trigger itself both
    // legitimately reference is_sample_data=true.
    if (file.includes(`${path.sep}db${path.sep}migrations${path.sep}`)) continue;
    // Scope the check to just the ONE INSERT-into-banking.bank_transactions statement (up to its
    // own closing backtick/semicolon, or a generous 600-char cap) — a file can legitimately mention
    // is_sample_data=true elsewhere (mdata.vendors, accounting.bills both already carry the same
    // column, e.g. apps/backend/src/insurance/policy-create-atomic.service.ts) without that being a
    // violation of THIS statement.
    const insertRe = /INSERT\s+INTO\s+banking\.bank_transactions[\s\S]{0,600}?(?=`|;|$)/gi;
    for (const match of text.matchAll(insertRe)) {
      const block = match[0];
      if (/is_sample_data['"`]?\s*[:=]\s*true\b/i.test(block) || /is_sample_data\s*\)[\s\S]{0,300}?\btrue\b/i.test(block)) {
        offenders.push(path.relative(root, file));
        break;
      }
    }
  }
  return offenders;
}

function scanRepo() {
  const SELF = path.resolve(new URL(import.meta.url).pathname);
  const offenders = [];
  for (const dir of [path.join(ROOT, "apps", "backend", "src"), path.join(ROOT, "scripts")]) {
    offenders.push(...scanOffenders(dir, SELF));
  }
  return offenders;
}

// --selftest: mutate a REAL source file (a copy) into the violating shape the guard exists to
// catch, in a scratch directory, and prove scanOffenders() flags it — then prove the REAL
// (corrected) shape of the same file, unmutated, is NOT flagged (false-positive check).
function selftest() {
  const realFile = path.join(ROOT, "apps", "backend", "src", "banking", "pending-categorization.ts");
  if (!fs.existsSync(realFile)) {
    console.error(`${LABEL} --selftest FAIL — fixture source apps/backend/src/banking/pending-categorization.ts not found`);
    process.exit(1);
  }
  const realText = fs.readFileSync(realFile, "utf8");

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "sample-bank-tx-selftest-"));
  try {
    // Case 1 (must FAIL / be flagged): a mutated copy with a live INSERT setting is_sample_data
    // literally true — exactly the pattern the guard exists to catch.
    const violating = `${realText}\n\nexport async function seedBadFixture(client) {\n  await client.query("INSERT INTO banking.bank_transactions (operating_company_id, is_sample_data) VALUES ($1, true)");\n}\n`;
    fs.mkdirSync(path.join(scratch, "violating"), { recursive: true });
    fs.writeFileSync(path.join(scratch, "violating", "pending-categorization.ts"), violating);
    const violatingResult = scanOffenders(path.join(scratch, "violating"), null);
    if (violatingResult.length === 0) {
      console.error(`${LABEL} --selftest FAIL — mutation (live INSERT + is_sample_data=true) was NOT detected.`);
      process.exit(1);
    }

    // Case 2 (must PASS / not be flagged): the real, unmutated, already-corrected source — proves
    // the guard does not false-positive on the file it just flagged a mutation of.
    fs.mkdirSync(path.join(scratch, "corrected"), { recursive: true });
    fs.writeFileSync(path.join(scratch, "corrected", "pending-categorization.ts"), realText);
    const correctedResult = scanOffenders(path.join(scratch, "corrected"), null);
    if (correctedResult.length !== 0) {
      console.error(`${LABEL} --selftest FAIL — real corrected source was flagged as a false positive: ${correctedResult.join(", ")}`);
      process.exit(1);
    }
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }

  console.log(`${LABEL} --selftest PASS — 1 mutation detected, 1 corrected-shape false-positive check passed.`);
}

async function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  const offenders = scanRepo();
  if (offenders.length > 0) {
    fail(
      `application code may not INSERT banking.bank_transactions with a literal is_sample_data=true — offenders: ${offenders.join(", ")}`
    );
  }

  const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString || process.env.ENABLE_LIVE_DB_SAMPLE_BANK_TX_GUARD !== "true") {
    const missing = !connectionString ? "DATABASE_URL is unset" : "ENABLE_LIVE_DB_SAMPLE_BANK_TX_GUARD is not 'true'";
    console.log(
      `${LABEL} — static checks PASSED (0 offenders) · SKIPPED-DB-CHECK (${missing}); the live USMCA sample-write scan did NOT run`
    );
    return;
  }

  // The exact voided_reason values on the 34 known GO-11/USMCA-seat-purge fixture rows — the ONLY
  // rows is_sample_data=true is allowed to be true on (db/migrations/202613370001's own backfill
  // predicate). Any is_sample_data=true row with a DIFFERENT voided_reason means a live write slipped
  // past the INSERT trigger (banking.forbid_sample_bank_transaction_insert) via a direct UPDATE.
  const KNOWN_FIXTURE_VOIDED_REASONS = [
    "owner_void_all_usmca_test_2026-08-11",
    "OWNER-USMCA-SEAT-JUNK-PURGE-2026-09-01: remove seat test/demo/sample contamination; keep Plaid bank feed",
  ];

  const client = new Client(buildPgClientConfig(connectionString));
  await client.connect();
  try {
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    const res = await client.query(
      `
        SELECT id::text AS id, voided_reason
        FROM banking.bank_transactions
        WHERE operating_company_id = $1::uuid
          AND is_sample_data = true
          AND (voided_reason IS NULL OR voided_reason <> ALL($2::text[]))
      `,
      [USMCA_COMPANY_ID, KNOWN_FIXTURE_VOIDED_REASONS]
    );
    if (res.rows.length > 0) {
      fail(
        `found ${res.rows.length} USMCA banking.bank_transactions row(s) with is_sample_data=true outside the 34 known GO-11 fixtures — ids: ${res.rows.map((r) => r.id).join(", ")}`
      );
    }
    console.log(`${LABEL} — static + live checks PASSED (0 offenders, USMCA is_sample_data=true rows all match the 34 known fixtures)`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  fail(err?.stack || String(err));
});

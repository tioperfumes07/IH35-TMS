#!/usr/bin/env node
/**
 * BANK-FARO-01 — Faro Factoring - USMCA digital bank seed must exist in migrations,
 * with its OWN GL (not 1090, not 1230 reserve, not Relay 1295, not FREIGHT).
 *
 * Run: node scripts/verify-faro-usmca-digital-bank-account.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIG = "db/migrations/202613301500_faro_factoring_wallet_usmca.sql";
const STEP = "scripts/verify-steps/1442-verify-bank-account-cashbind.mjs";

function assertSeed(sql, label) {
  const failures = [];
  if (!sql.includes("Faro Factoring - USMCA")) failures.push(`${label}: missing display name Faro Factoring - USMCA`);
  if (!sql.includes("'1296'")) failures.push(`${label}: missing entity-scoped account_number 1296`);
  if (!sql.includes("faro_factoring_wallet")) failures.push(`${label}: missing system_purpose faro_factoring_wallet`);
  if (!/is_dip\s*\)[\s\S]{0,250}false/.test(sql)) {
    failures.push(`${label}: INSERT must set is_dip false`);
  }
  if (sql.includes("cash_clearing")) failures.push(`${label}: must not rebind cash_clearing`);
  if (!sql.includes("1090") || !sql.includes("RAISE EXCEPTION")) {
    failures.push(`${label}: must refuse 1090/1230/1295/FREIGHT ledger collision`);
  }
  if (!sql.includes("banking.bank_accounts")) failures.push(`${label}: must register banking.bank_accounts`);
  if (!sql.includes("depository")) failures.push(`${label}: must be depository (Relay shape)`);
  return failures;
}

function runSelftest() {
  const good = fs.readFileSync(path.join(ROOT, MIG), "utf8");
  const goodFails = assertSeed(good, "real");
  if (goodFails.length) {
    console.error("selftest: real migration failed its own pins:\n" + goodFails.join("\n"));
    process.exit(1);
  }
  const bad = good
    .replaceAll("Faro Factoring - USMCA", "USMCA FREIGHT")
    .replaceAll("'1296'", "'1090'")
    .replaceAll("faro_factoring_wallet", "undeposited_funds");
  const badFails = assertSeed(bad, "planted");
  if (badFails.length === 0) {
    console.error("selftest: planted 1090/FREIGHT seed must FAIL");
    process.exit(1);
  }
  console.log("verify-faro-usmca-digital-bank-account --selftest PASS");
}

function run() {
  const sql = fs.readFileSync(path.join(ROOT, MIG), "utf8");
  const failures = assertSeed(sql, MIG);
  const step = fs.readFileSync(path.join(ROOT, STEP), "utf8");
  if (!step.includes("verify-faro-usmca-digital-bank-account.mjs")) {
    failures.push(`${STEP}: must run this guard`);
  }
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
  console.log("verify-faro-usmca-digital-bank-account PASS");
}

if (process.argv.includes("--selftest")) runSelftest();
else run();

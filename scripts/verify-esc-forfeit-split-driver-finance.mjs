#!/usr/bin/env node
/**
 * ESC-FORFEIT-SPLIT — forfeit must move driver_finance.escrow_balances + escrow_ledger
 * in the SAME transaction as accounting.escrow_postings (separate from #3542 sign fix).
 *
 * Root cause: escrow-forfeit.service.ts wrote accounting.escrow_postings (+ liabilities) but
 * wrote escrow_balances / escrow_ledger ZERO times → driver-facing balance froze (overstated).
 *
 * KILL THE SECOND SYSTEM tables 2-5 (202615380100): escrow_balances keeps no amount and escrow_ledger no running
 * balance — the forfeit's balance change IS the GL forfeiture. The split this guard exists for now means: the forfeit
 * writes accounting.escrow_postings AND appends its driver_finance.escrow_ledger 'forfeit' row (the driver-facing
 * history) on the same path, against the identity row from ensureEscrowBalanceRow — and never writes a stored amount.
 *
 * Optional throwaway (IH35_ESC_FORFEIT_SPLIT_DSN=local only): both stores net the same forfeited cents.
 *
 *   node scripts/verify-esc-forfeit-split-driver-finance.mjs
 *   node scripts/verify-esc-forfeit-split-driver-finance.mjs --selftest
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-esc-forfeit-split-driver-finance";
const SERVICE = "apps/backend/src/driver-finance/escrow-forfeit.service.ts";

function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}
function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

export function assertSplit(root = ROOT) {
  const problems = [];
  const svc = stripComments(read(root, SERVICE));

  if (!/recordEscrowPostingOnly\s*\(/.test(svc) && !/INSERT\s+INTO\s+accounting\.escrow_postings/.test(svc)) {
    problems.push(`${SERVICE}: must write accounting.escrow_postings (recordEscrowPostingOnly or INSERT)`);
  }
  if (!/ensureEscrowBalanceRow\s*\(/.test(svc)) {
    problems.push(`${SERVICE}: must resolve the escrow_balances identity row via ensureEscrowBalanceRow (the ledger FK)`);
  }
  if (/current_balance_cents|total_held_cents|total_released_cents|running_balance_cents/.test(svc)) {
    problems.push(`${SERVICE}: writes a stored escrow amount — those columns died with 202615380100; the balance is the GL`);
  }
  if (!/INSERT\s+INTO\s+driver_finance\.escrow_ledger/.test(svc)) {
    problems.push(`${SERVICE}: must INSERT driver_finance.escrow_ledger`);
  }
  if (!/['"]forfeit['"]/.test(svc)) {
    problems.push(`${SERVICE}: escrow_ledger must use transaction_type='forfeit'`);
  }
  // same-transaction ordering: the accounting write precedes the ledger row in source
  const acctIdx = svc.search(/recordEscrowPostingOnly\s*\(|INSERT\s+INTO\s+accounting\.escrow_postings/);
  const dfIdx = svc.search(/INSERT\s+INTO\s+driver_finance\.escrow_ledger/);
  if (acctIdx < 0 || dfIdx < 0 || dfIdx < acctIdx) {
    problems.push(`${SERVICE}: the driver_finance.escrow_ledger row must follow the accounting.escrow_postings write on the same path`);
  }

  return problems;
}

function runThrowaway() {
  const dsn = process.env.IH35_ESC_FORFEIT_SPLIT_DSN || "";
  if (!dsn) return null;
  if (/neon\.tech|amazonaws\.com|render\.com/i.test(dsn) || process.env.ALLOW_PROD_MIGRATE === "1") {
    throw new Error("refusing DSN that looks like prod — local throwaway only");
  }
  const sql = `
BEGIN;
SELECT set_config('app.bypass_rls','lucia',true);
DO $proof$
DECLARE
  v_opco uuid;
  v_driver uuid;
  v_coa uuid;
  v_escrow uuid;
  v_df uuid;
  v_user uuid;
  v_for bigint := 20000;
  v_postings int;
  v_ledger int;
BEGIN
  SELECT id INTO v_opco FROM org.companies WHERE code = 'TRANSP' LIMIT 1;
  IF v_opco IS NULL THEN RAISE EXCEPTION 'no TRANSP'; END IF;
  PERFORM set_config('app.operating_company_id', v_opco::text, true);
  SELECT id INTO v_coa FROM catalogs.accounts WHERE is_postable IS TRUE LIMIT 1;
  SELECT id INTO v_user FROM identity.users WHERE deactivated_at IS NULL LIMIT 1;
  IF v_user IS NULL THEN
    INSERT INTO identity.users (email, role, preferred_language)
    VALUES ('esc-forfeit-split@example.invalid', 'Owner', 'en') RETURNING id INTO v_user;
  END IF;
  IF v_coa IS NULL OR v_user IS NULL THEN RAISE EXCEPTION 'missing fixture'; END IF;

  INSERT INTO mdata.drivers (first_name, last_name, phone, operating_company_id, status)
  VALUES ('Split', 'Proof', '+1555' || lpad((floor(random()*1e7))::int::text, 7, '0'), v_opco, 'Active')
  RETURNING id INTO v_driver;

  INSERT INTO accounting.escrow_accounts (
    operating_company_id, holder_id, holder_type, purpose, coa_account_id, status
  ) VALUES (v_opco, v_driver, 'driver', 'driver_bond', v_coa, 'active')
  RETURNING id INTO v_escrow;

  -- identity row only (KILL THE SECOND SYSTEM tables 2-5: no stored amounts)
  INSERT INTO driver_finance.escrow_balances (operating_company_id, driver_id, last_updated_at)
  VALUES (v_opco, v_driver, now())
  RETURNING id INTO v_df;

  -- Mirror service: the accounting side is the escrow_postings forfeiture row (the balance itself is the 2100-00-nnn GL;
  -- accounting.escrow_accounts.balance_cents died with KILL THE SECOND SYSTEM table 1, migration 202615380000).
  INSERT INTO accounting.escrow_postings (
    operating_company_id, escrow_account_id, posting_type, amount_cents, source_type,
    note, posted_by_user_id
  ) VALUES (v_opco, v_escrow, 'forfeiture', v_for, 'forfeit', 'split-proof', v_user);

  INSERT INTO driver_finance.escrow_ledger
    (operating_company_id, driver_id, escrow_balance_id, transaction_type, amount_cents, description)
  VALUES (v_opco, v_driver, v_df, 'forfeit', -v_for, 'split-proof');

  SELECT count(*) INTO v_postings FROM accounting.escrow_postings
   WHERE escrow_account_id = v_escrow AND posting_type = 'forfeiture' AND amount_cents = v_for;
  SELECT count(*) INTO v_ledger FROM driver_finance.escrow_ledger
   WHERE escrow_balance_id = v_df AND transaction_type = 'forfeit' AND amount_cents = -v_for;

  IF v_postings <> 1 THEN
    RAISE EXCEPTION 'accounting side: expected 1 forfeiture escrow_postings row of %, found %', v_for, v_postings;
  END IF;
  IF v_ledger <> 1 THEN
    RAISE EXCEPTION 'driver_finance side: expected 1 forfeit escrow_ledger row of -%, found %', v_for, v_ledger;
  END IF;

  RAISE NOTICE 'SPLIT_PROOF_OK both_recorded=% ledger_rows=%', v_for, v_ledger;
END
$proof$;
ROLLBACK;
`;
  const r = spawnSync("psql", [dsn, "-v", "ON_ERROR_STOP=1", "-c", sql], { encoding: "utf8", env: process.env });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  const out = (r.stderr || "") + (r.stdout || "");
  if (!/SPLIT_PROOF_OK/.test(out)) throw new Error("missing SPLIT_PROOF_OK");
  return "SPLIT_PROOF_OK";
}

if (process.argv.includes("--selftest")) {
  const failures = [];
  const good = assertSplit();
  if (good.length) failures.push(`live: ${good.join("; ")}`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "esc-forfeit-split-"));
  try {
    const dest = path.join(tmp, SERVICE);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    let s = stripComments(read(ROOT, SERVICE)).replace(/INSERT\s+INTO\s+driver_finance\.escrow_ledger/g, "SELECT 1 FROM driver_finance.escrow_ledger /*noinsert*/");
    fs.writeFileSync(dest, s);
    if (!assertSplit(tmp).some((p) => /must INSERT driver_finance\.escrow_ledger/.test(p))) {
      failures.push("removed ledger INSERT not caught");
    }
    fs.writeFileSync(dest, stripComments(read(ROOT, SERVICE)) + "\nconst x = `UPDATE driver_finance.escrow_balances SET current_balance_cents = 0`;\n");
    if (!assertSplit(tmp).some((p) => /stored escrow amount/.test(p))) {
      failures.push("a re-added stored-amount write not caught");
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  if (failures.length) {
    console.error(`${LABEL} --selftest FAILED\n${failures.join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK`);
  process.exit(0);
}

const problems = assertSplit();
if (problems.length) {
  console.error(`${LABEL} FAILED\n${problems.join("\n")}`);
  process.exit(1);
}
if (process.env.IH35_ESC_FORFEIT_SPLIT_DSN) {
  try {
    console.log(`${LABEL} OK — static + ${runThrowaway()}`);
  } catch (e) {
    console.error(`${LABEL} THROWAYAWAY FAILED: ${e.message}`);
    process.exit(1);
  }
} else {
  console.log(`${LABEL} OK — static (set IH35_ESC_FORFEIT_SPLIT_DSN for throwaway reconcile proof)`);
}

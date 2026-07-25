#!/usr/bin/env node
/**
 * ESC-FORFEIT-SPLIT — forfeit must move driver_finance.escrow_balances + escrow_ledger
 * in the SAME transaction as accounting.escrow_postings (separate from #3542 sign fix).
 *
 * Root cause: escrow-forfeit.service.ts wrote accounting.escrow_postings (+ liabilities) but
 * wrote escrow_balances / escrow_ledger ZERO times → driver-facing balance froze (overstated).
 *
 * Static: service UPDATEs escrow_balances (−), INSERTs escrow_ledger transaction_type='forfeit',
 * fails loud if driver_finance cannot move, and still records accounting via recordEscrowPostingOnly.
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
  if (!/UPDATE\s+driver_finance\.escrow_balances/.test(svc)) {
    problems.push(`${SERVICE}: must UPDATE driver_finance.escrow_balances on forfeit`);
  }
  if (!/current_balance_cents\s*=\s*current_balance_cents\s*-/.test(svc)) {
    problems.push(`${SERVICE}: escrow_balances.current_balance_cents must decrement`);
  }
  if (!/INSERT\s+INTO\s+driver_finance\.escrow_ledger/.test(svc)) {
    problems.push(`${SERVICE}: must INSERT driver_finance.escrow_ledger`);
  }
  if (!/['"]forfeit['"]/.test(svc)) {
    problems.push(`${SERVICE}: escrow_ledger must use transaction_type='forfeit'`);
  }
  if (!/E_ESCROW_BALANCES_MISSING|split-brain/.test(svc)) {
    problems.push(`${SERVICE}: must fail loud when driver_finance cannot move (no accounting-only forfeit)`);
  }
  // Keep #3542 sign concerns out of this guard's ownership — but require same-txn ordering:
  // accounting write appears before escrow_balances UPDATE in source.
  const acctIdx = svc.search(/recordEscrowPostingOnly\s*\(|INSERT\s+INTO\s+accounting\.escrow_postings/);
  const dfIdx = svc.search(/UPDATE\s+driver_finance\.escrow_balances/);
  if (acctIdx < 0 || dfIdx < 0 || dfIdx < acctIdx) {
    problems.push(`${SERVICE}: driver_finance.escrow_balances UPDATE must follow accounting.escrow_postings write in the same tx path`);
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
  v_seed bigint := 50000;
  v_acct_before bigint;
  v_acct_after bigint;
  v_df_before bigint;
  v_df_after bigint;
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
    operating_company_id, holder_id, holder_type, purpose, coa_account_id, balance_cents, status
  ) VALUES (v_opco, v_driver, 'driver', 'driver_bond', v_coa, v_seed, 'active')
  RETURNING id INTO v_escrow;

  INSERT INTO driver_finance.escrow_balances (
    operating_company_id, driver_id, total_held_cents, total_released_cents, current_balance_cents
  ) VALUES (v_opco, v_driver, v_seed, 0, v_seed)
  RETURNING id INTO v_df;

  SELECT balance_cents INTO v_acct_before FROM accounting.escrow_accounts WHERE id = v_escrow;
  SELECT current_balance_cents INTO v_df_before FROM driver_finance.escrow_balances WHERE id = v_df;

  -- Mirror service: accounting posting (forfeiture if CHECK allows, else skip trigger path and direct UPDATE)
  BEGIN
    INSERT INTO accounting.escrow_postings (
      operating_company_id, escrow_account_id, posting_type, amount_cents, source_type,
      note, posted_by_user_id
    ) VALUES (v_opco, v_escrow, 'forfeiture', v_for, 'forfeit', 'split-proof', v_user);
  EXCEPTION WHEN check_violation THEN
    -- #3542 not applied on this DB yet — apply signed delta manually to prove dual-store reconcile
    UPDATE accounting.escrow_accounts
       SET balance_cents = balance_cents - v_for, updated_at = now()
     WHERE id = v_escrow;
  END;

  UPDATE driver_finance.escrow_balances
     SET current_balance_cents = current_balance_cents - v_for, last_updated_at = now()
   WHERE id = v_df AND current_balance_cents >= v_for;
  IF NOT FOUND THEN RAISE EXCEPTION 'df UPDATE failed'; END IF;
  INSERT INTO driver_finance.escrow_ledger
    (operating_company_id, driver_id, escrow_balance_id, transaction_type, amount_cents, running_balance_cents, description)
  VALUES (v_opco, v_driver, v_df, 'forfeit', v_for, v_df_before - v_for, 'split-proof');

  SELECT balance_cents INTO v_acct_after FROM accounting.escrow_accounts WHERE id = v_escrow;
  SELECT current_balance_cents INTO v_df_after FROM driver_finance.escrow_balances WHERE id = v_df;

  IF v_acct_before - v_acct_after <> v_for THEN
    RAISE EXCEPTION 'accounting delta % <> forfeited %', v_acct_before - v_acct_after, v_for;
  END IF;
  IF v_df_before - v_df_after <> v_for THEN
    RAISE EXCEPTION 'driver_finance delta % <> forfeited %', v_df_before - v_df_after, v_for;
  END IF;
  IF v_acct_after <> v_df_after THEN
    RAISE EXCEPTION 'stores diverge after forfeit: acct=% df=%', v_acct_after, v_df_after;
  END IF;

  RAISE NOTICE 'SPLIT_PROOF_OK both_net=% final=%', v_for, v_acct_after;
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
    let s = stripComments(read(ROOT, SERVICE)).replace(/UPDATE\s+driver_finance\.escrow_balances/g, "SELECT 1 FROM driver_finance.escrow_balances /*noupdate*/");
    fs.writeFileSync(dest, s);
    if (!assertSplit(tmp).some((p) => /must UPDATE driver_finance\.escrow_balances/.test(p))) {
      failures.push("removed UPDATE not caught");
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

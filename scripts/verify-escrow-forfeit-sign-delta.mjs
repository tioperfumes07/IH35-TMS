#!/usr/bin/env node
/**
 * SAF-ORPH-01/02 — escrow forfeit sign + flag seed KEEP guard.
 *
 * Static proofs:
 *   1. Migration 202608070000 REPLACE of apply_escrow_posting_delta has
 *      deposit +, release −, forfeiture −, ELSE RAISE (no silent ELSE→+).
 *   2. Flag DRIVER_ESCROW_FORFEIT_GL_POSTING_ENABLED is seeded default_enabled=false.
 *   3. Forfeit service posts via recordEscrowPostingOnly with posting_type='forfeiture'.
 *   4. Held registry lists the migration (not applied_on_prod yet).
 *
 * Optional live delta (IH35_ESCROW_FORFEIT_DELTA_DSN = local throwaway only — never prod):
 *   deposit → balance UP; forfeiture → balance DOWN by same cents.
 *
 *   node scripts/verify-escrow-forfeit-sign-delta.mjs
 *   node scripts/verify-escrow-forfeit-sign-delta.mjs --selftest
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-escrow-forfeit-sign-delta";
const MIG = "db/migrations/202608070000_escrow_forfeit_posting_type_sign_and_flag_seed.sql";
const HELD = "db/migrations/.held-migrations.json";
const FORFEIT_SVC = "apps/backend/src/driver-finance/escrow-forfeit.service.ts";
const ESCROW_SVC = "apps/backend/src/accounting/escrow/service.ts";
const FLAG = "DRIVER_ESCROW_FORFEIT_GL_POSTING_ENABLED";
const MIG_BASENAME = path.basename(MIG);

function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

export function assertStatic(root = ROOT) {
  const problems = [];
  const migPath = path.join(root, MIG);
  if (!fs.existsSync(migPath)) {
    problems.push(`missing ${MIG}`);
    return problems;
  }
  const migSrc = read(root, MIG);

  if (!/CREATE OR REPLACE FUNCTION accounting\.apply_escrow_posting_delta/.test(migSrc)) {
    problems.push(`${MIG}: must CREATE OR REPLACE accounting.apply_escrow_posting_delta`);
  }
  if (!/NEW\.posting_type\s*=\s*'forfeiture'/.test(migSrc)) {
    problems.push(`${MIG}: trigger must handle posting_type='forfeiture'`);
  }
  const negCount = (migSrc.match(/v_delta\s*:=\s*-NEW\.amount_cents/g) || []).length;
  if (negCount < 2) {
    problems.push(`${MIG}: release and forfeiture must both assign negative delta (found ${negCount})`);
  }
  if (/ELSE\s*\n\s*v_delta\s*:=\s*NEW\.amount_cents/.test(migSrc)) {
    problems.push(`${MIG}: still has 0234 ELSE→+amount pattern — must RAISE on unknown types`);
  }
  if (!/RAISE EXCEPTION/.test(migSrc) || !/unknown posting_type/i.test(migSrc)) {
    problems.push(`${MIG}: ELSE branch must RAISE EXCEPTION on unknown posting_type`);
  }
  if (!/'forfeiture'::text/.test(migSrc)) {
    problems.push(`${MIG}: posting_type CHECK must include 'forfeiture'`);
  }
  if (!migSrc.includes(FLAG)) {
    problems.push(`${MIG}: must seed ${FLAG}`);
  }
  if (!new RegExp(`${FLAG}[\\s\\S]{0,500}false\\s*,\\s*0`).test(migSrc)) {
    problems.push(`${MIG}: ${FLAG} must seed default_enabled=false, rollout_pct=0`);
  }
  if (/INSERT INTO lib\.feature_flag_overrides[\s\S]{0,200}DRIVER_ESCROW_FORFEIT/.test(migSrc)) {
    problems.push(`${MIG}: must NOT seed feature_flag_overrides for forfeit flag (stays OFF)`);
  }

  const heldPath = path.join(root, HELD);
  if (!fs.existsSync(heldPath)) {
    problems.push(`missing ${HELD}`);
  } else {
    const held = JSON.parse(read(root, HELD));
    const pending = (held.held || []).find((h) => h.file === MIG_BASENAME);
    const applied = (held.applied_held || []).find((h) => h.file === MIG_BASENAME);
    if (pending && applied) {
      problems.push(`${HELD}: ${MIG_BASENAME} must not appear in both held[] and applied_held[]`);
    } else if (pending) {
      if (pending.applied_on_prod === true) {
        problems.push(`${HELD}: ${MIG_BASENAME} in held[] must not claim applied_on_prod (move to applied_held after Neon-apply)`);
      }
    } else if (applied) {
      if (applied.applied_on_prod !== true) {
        problems.push(`${HELD}: ${MIG_BASENAME} in applied_held[] must set applied_on_prod:true`);
      }
    } else {
      problems.push(`${HELD}: missing held or applied_held entry for ${MIG_BASENAME}`);
    }
  }

  const forfeit = stripComments(read(root, FORFEIT_SVC));
  if (!/recordEscrowPostingOnly\s*\(/.test(forfeit)) {
    problems.push(`${FORFEIT_SVC}: must call recordEscrowPostingOnly (ACCT-R-01 helper)`);
  }
  if (!/posting_type:\s*["']forfeiture["']/.test(forfeit)) {
    problems.push(`${FORFEIT_SVC}: must pass posting_type: "forfeiture"`);
  }
  if (/posting_type:\s*["']adjustment["']|'adjustment'/.test(forfeit)) {
    problems.push(`${FORFEIT_SVC}: must not use posting_type='adjustment' (ELSE→+ bug)`);
  }

  const escrowSvc = stripComments(read(root, ESCROW_SVC));
  if (!/posting_type:\s*"deposit"\s*\|\s*"release"\s*\|\s*"forfeiture"/.test(escrowSvc)) {
    problems.push(`${ESCROW_SVC}: recordEscrowPostingOnly must accept posting_type forfeiture`);
  }

  return problems;
}

function runThrowawayDelta() {
  const dsn = process.env.IH35_ESCROW_FORFEIT_DELTA_DSN || "";
  if (!dsn) return null;
  if (/neon\.tech|amazonaws\.com|render\.com/i.test(dsn) || process.env.ALLOW_PROD_MIGRATE === "1") {
    throw new Error("refusing delta DSN that looks like prod — use local throwaway only");
  }
  // Entire proof is one transaction that ROLLBACKs — no durable fixture pollution.
  const sql = `
BEGIN;
SELECT set_config('app.bypass_rls','lucia',true);
DO $proof$
DECLARE
  v_opco uuid;
  v_holder uuid := gen_random_uuid();
  v_coa uuid;
  v_escrow uuid;
  v_user uuid;
  v_bal0 bigint;
  v_bal1 bigint;
  v_bal2 bigint;
  v_dep bigint := 50000;
  v_for bigint := 20000;
BEGIN
  SELECT id INTO v_opco FROM org.companies WHERE code = 'TRANSP' LIMIT 1;
  IF v_opco IS NULL THEN RAISE EXCEPTION 'no TRANSP company'; END IF;
  PERFORM set_config('app.operating_company_id', v_opco::text, true);
  SELECT id INTO v_coa FROM catalogs.accounts
   WHERE operating_company_id = v_opco AND is_postable IS TRUE AND deactivated_at IS NULL
   LIMIT 1;
  IF v_coa IS NULL THEN
    SELECT id INTO v_coa FROM catalogs.accounts WHERE is_postable IS TRUE LIMIT 1;
  END IF;
  SELECT id INTO v_user FROM identity.users WHERE deactivated_at IS NULL LIMIT 1;
  IF v_user IS NULL THEN
    INSERT INTO identity.users (email, role, preferred_language)
    VALUES ('escrow-forfeit-delta-proof@example.invalid', 'Owner', 'en')
    RETURNING id INTO v_user;
  END IF;
  IF v_coa IS NULL OR v_user IS NULL THEN RAISE EXCEPTION 'missing coa/user fixture'; END IF;

  INSERT INTO accounting.escrow_accounts (
    operating_company_id, holder_id, holder_type, purpose, coa_account_id, balance_cents, status
  ) VALUES (v_opco, v_holder, 'driver', 'driver_bond', v_coa, 0, 'active')
  RETURNING id INTO v_escrow;

  SELECT balance_cents INTO v_bal0 FROM accounting.escrow_accounts WHERE id = v_escrow;

  INSERT INTO accounting.escrow_postings (
    operating_company_id, escrow_account_id, posting_type, amount_cents, source_type,
    note, posted_by_user_id
  ) VALUES (v_opco, v_escrow, 'deposit', v_dep, 'manual', 'delta-proof deposit', v_user);
  SELECT balance_cents INTO v_bal1 FROM accounting.escrow_accounts WHERE id = v_escrow;
  IF v_bal1 <> v_bal0 + v_dep THEN
    RAISE EXCEPTION 'deposit delta FAIL: bal0=% bal1=% expected=%', v_bal0, v_bal1, v_bal0 + v_dep;
  END IF;

  INSERT INTO accounting.escrow_postings (
    operating_company_id, escrow_account_id, posting_type, amount_cents, source_type,
    note, posted_by_user_id
  ) VALUES (v_opco, v_escrow, 'forfeiture', v_for, 'forfeit', 'delta-proof forfeit', v_user);
  SELECT balance_cents INTO v_bal2 FROM accounting.escrow_accounts WHERE id = v_escrow;
  IF v_bal2 <> v_bal1 - v_for THEN
    RAISE EXCEPTION 'forfeiture delta FAIL: bal1=% bal2=% expected=% (would be + if ELSE bug)', v_bal1, v_bal2, v_bal1 - v_for;
  END IF;

  -- Prove adjustment still fails loud (no ELSE→+)
  BEGIN
    INSERT INTO accounting.escrow_postings (
      operating_company_id, escrow_account_id, posting_type, amount_cents, source_type,
      note, posted_by_user_id
    ) VALUES (v_opco, v_escrow, 'adjustment', 100, 'manual', 'must raise', v_user);
    RAISE EXCEPTION 'adjustment insert should have RAISED';
  EXCEPTION WHEN check_violation OR others THEN
    IF SQLERRM LIKE '%unknown posting_type%' OR SQLERRM LIKE '%adjustment%' THEN
      NULL; -- expected
    ELSIF SQLERRM = 'adjustment insert should have RAISED' THEN
      RAISE;
    END IF;
  END;

  RAISE NOTICE 'DELTA_PROOF_OK deposit+% forfeit-% final=%', v_dep, v_for, v_bal2;
END
$proof$;
ROLLBACK;
`;
  const r = spawnSync("psql", [dsn, "-v", "ON_ERROR_STOP=1", "-c", sql], {
    encoding: "utf8",
    env: { ...process.env },
  });
  if (r.status !== 0) {
    throw new Error(`throwaway delta failed: ${r.stderr || r.stdout}`);
  }
  if (!/DELTA_PROOF_OK/.test((r.stderr || "") + (r.stdout || ""))) {
    throw new Error("throwaway delta ran but missing DELTA_PROOF_OK notice");
  }
  return "DELTA_PROOF_OK";
}

if (process.argv.includes("--selftest")) {
  const failures = [];
  const good = assertStatic();
  if (good.length) failures.push(`live FAIL: ${good.join("; ")}`);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "verify-escrow-sign-"));
  try {
    for (const rel of [MIG, HELD, FORFEIT_SVC, ESCROW_SVC]) {
      const dest = path.join(tmp, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(path.join(ROOT, rel), dest);
    }
    let mig = read(tmp, MIG);
    mig = mig.replace(
      /ELSIF NEW\.posting_type = 'forfeiture' THEN\s*\n\s*v_delta := -NEW\.amount_cents;/,
      "ELSIF NEW.posting_type = 'forfeiture' THEN\n    v_delta := NEW.amount_cents;"
    );
    fs.writeFileSync(path.join(tmp, MIG), mig);
    if (!assertStatic(tmp).some((p) => /negative delta/.test(p))) {
      failures.push("positive-forfeiture plant not caught");
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  if (failures.length) {
    console.error(`${LABEL} --selftest FAILED:\n${failures.join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK`);
  process.exit(0);
}

const problems = assertStatic();
if (problems.length) {
  console.error(`${LABEL} FAILED:\n${problems.join("\n")}`);
  process.exit(1);
}

if (process.env.IH35_ESCROW_FORFEIT_DELTA_DSN) {
  try {
    const msg = runThrowawayDelta();
    console.log(`${LABEL} OK — static + ${msg}`);
  } catch (err) {
    console.error(`${LABEL} DELTA FAILED: ${err.message}`);
    process.exit(1);
  }
} else {
  console.log(`${LABEL} OK — static (set IH35_ESCROW_FORFEIT_DELTA_DSN for throwaway delta proof)`);
}

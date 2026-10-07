#!/usr/bin/env node
/**
 * ROUND-290.3 — owner ruling, 2026-09-30, verbatim: "Escrow is the driver's money held in trust -
 * a liability to a NAMED driver. Never cash, never expense. Correct shape: Dr 2170 Driver Net-Pay
 * Clearing / Cr 2100-00-NNN <DRIVER NAME> - Driver Escrow." Guard requirement, same ruling: "fix
 * the engine, then correct the 7 by document, never by JE."
 *
 * ROOT CAUSE this responds to: apps/backend/src/accounting/escrow/service.ts's
 * postEscrowTransactionOnClient() resolved ONE counter-account role ("cash_clearing") for every
 * escrow holder type. For USMCA that role resolves to 1090 Undeposited Funds -- correct for a
 * factor/vendor holder where real cash is withheld, but wrong for a driver holder, where the
 * settlement that funded the escrow already parked the driver's pay in 2170 Driver Net-Pay
 * Clearing. Every driver-holder deposit/release therefore corrupted 1090 with a transaction that
 * moved no cash. Live-measured before the fix: 16 escrow_account-sourced JEs, all driver-holder
 * releases, all crediting 1090.
 *
 * TWO CHECKS:
 *   STATIC  postEscrowTransactionOnClient() in escrow/service.ts branches its counter-account
 *           role on escrowAccount.holder_type === "driver" -> "driver_payroll_clearing", never a
 *           single unconditional "cash_clearing" call covering every holder type.
 *   LIVE    no live (unvoided) escrow_account-sourced journal entry posts a driver-holder escrow
 *           counter-leg to the cash_clearing-resolved account (1090 for USMCA). The 16 pre-fix
 *           rows are known debt (owner: fix the engine, correct the 7-plus by document, never a
 *           blanket JE) -- accepted as a shrinking ceiling, not a pass. A NEW violation after the
 *           fix still fails.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";


export const REQUIRES_LIVE_DB = "Neon live verification required";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-escrow-counter-leg-is-clearing";
const TARGET = path.join(ROOT, "apps/backend/src/accounting/escrow/service.ts");
const SELFTEST = process.argv.includes("--selftest");

/** @param {string} src file contents @returns {string[]} violations, or [] */
export function checkWriterSource(src) {
  if (!/export async function postEscrowTransactionOnClient/.test(src)) {
    return ["postEscrowTransactionOnClient() not found -- guard target moved or was renamed"];
  }
  const problems = [];
  if (!/holder_type\s*===\s*["']driver["']/.test(src)) {
    problems.push(
      "postEscrowTransactionOnClient() never branches on escrowAccount.holder_type === 'driver' -- the driver counter-leg is not distinguished from vendor/factor/other"
    );
  }
  if (!/driver_payroll_clearing/.test(src)) {
    problems.push(
      "postEscrowTransactionOnClient() never resolves the 'driver_payroll_clearing' role -- a driver-holder posting has no path to 2170"
    );
  }
  return problems;
}

function selftest() {
  const bad = `
export async function postEscrowTransactionOnClient(client, input, actor) {
  const cashAccountId = await resolveRoleAccount(client, input.operating_company_id, "cash_clearing");
}
  `;
  const good = `
export async function postEscrowTransactionOnClient(client, input, actor) {
  const isDriverHolder = escrowAccount.holder_type === "driver";
  const cashAccountId = await resolveRoleAccount(client, input.operating_company_id, isDriverHolder ? "driver_payroll_clearing" : "cash_clearing");
}
  `;
  if (checkWriterSource(bad).length !== 2) throw new Error(`${LABEL} selftest: unconditional cash_clearing writer not caught`);
  if (checkWriterSource(good).length !== 0) throw new Error(`${LABEL} selftest: compliant writer flagged`);
  console.log(`${LABEL}: SELFTEST PASS`);
}

if (SELFTEST) {
  selftest();
  process.exit(0);
}

const src = fs.readFileSync(TARGET, "utf8");
const staticFailures = checkWriterSource(src).map((p) => `${path.relative(ROOT, TARGET)}: ${p}`);

if (staticFailures.length) {
  console.error(`${LABEL}: FAILED (static) —`);
  for (const f of staticFailures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`${LABEL}: static OK — postEscrowTransactionOnClient() routes driver-holder escrow postings to driver_payroll_clearing (2170), not cash_clearing`);

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error(`${LABEL}: FAIL — DATABASE_URL not set. A live money guard that cannot connect is a FAIL, never a pass.`);
  process.exit(1);
}

// DB-F01: transaction-local bypass only (SET LOCAL inside an explicit BEGIN), never the
// session-scoped `set_config(..., false)` form — see verify-no-session-scoped-rls-bypass.mjs.
// Over Neon's transaction-pooled -pooler endpoint a session-scoped GUC can silently land on a
// different backend than the one that runs the SELECT, and FORCE-RLS tables return zero rows.
const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
try {
  await client.query("BEGIN");
  await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
  const res = await client.query(`
    SELECT count(DISTINCT je.id)::int AS bad_documents, count(*)::int AS bad_lines
    FROM accounting.journal_entries je
    JOIN accounting.journal_entry_postings p ON p.journal_entry_uuid = je.id
    JOIN catalogs.accounts ca ON ca.id = p.account_id
    JOIN accounting.escrow_accounts ea ON ea.id::text = p.source_transaction_id::text
    WHERE je.voided_at IS NULL
      -- A reversed document and its reversal net to zero: that pair IS the by-document correction (reverse + repost)
      -- this guard orders, not live debt (AUTH-213 reversed nine 09-24 releases, 2026-10-04).
      AND je.reversed_by_je_id IS NULL
      AND je.reverses_je_id IS NULL
      AND p.source_transaction_type = 'escrow_account'
      AND ea.holder_type = 'driver'
      AND ca.account_subtype = 'Undeposited Funds'
  `);
  await client.query("COMMIT");
  const badDocuments = Number(res.rows[0]?.bad_documents ?? 0);
  const badLines = Number(res.rows[0]?.bad_lines ?? 0);

  const baselinePath = path.join(ROOT, "scripts", "verify-driver-escrow-counter-leg-is-clearing.baseline.json");
  const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  if (badDocuments > baseline.bad_documents_ceiling) {
    console.error(
      `${LABEL}: LIVE FAIL — ${badDocuments} live driver-holder escrow document(s) / ${badLines} line(s) still post their counter-leg to an Undeposited-Funds-subtype account (ceiling ${baseline.bad_documents_ceiling} documents). A NEW bad posting was written after the fix.`
    );
    process.exit(1);
  }
  if (badDocuments > 0) {
    console.log(
      `${LABEL}: LIVE PASS (known pre-fix debt, not growing) — ${badDocuments} document(s) / ${badLines} line(s), within the ${baseline.established} baseline ceiling. ROUND 290.3 orders these corrected BY DOCUMENT (reverse + repost), never by a blanket JE.`
    );
  } else {
    console.log(`${LABEL}: LIVE OK — 0 driver-holder escrow documents post to an Undeposited-Funds-subtype account`);
  }
} finally {
  await client.end();
}

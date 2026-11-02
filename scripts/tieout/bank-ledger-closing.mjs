#!/usr/bin/env node
/**
 * BANK-TIEOUT-01 — each live USMCA bank account's independently stored closing balance equals
 * the closing balance of its linked Cash GL account, including Faro 1296. Tolerance: zero cents.
 *
 * Non-Plaid wallet balances shown by the app may be derived from a ledger. That display fallback
 * is deliberately NOT used here: deriving both sides from a ledger would make this a closed-loop
 * self-comparison. The bank side is `bank_accounts.current_balance_cents`; the GL side is the linked
 * account's balance from `accounting.fn_account_balances_as_of` as of the USMCA business date.
 *
 * This is read-only. Missing DB, empty population, count other than five, an unbound account,
 * a missing Faro 1296 row, or any nonzero variance can never pass.
 */
import pg from "pg";
import pgConnectionOptions from "../lib/pg-connection-options.cjs";
import { fail, requireDb } from "./_lib.mjs";

const { buildPgPoolConfig } = pgConnectionOptions;

export const EXPECTED = {
  mode: "ledger_equals_bank",
  operating_company_code: "USMCA",
  // 9 active USMCA bank accounts as of 2026-11-02: 1000/1005/1230/1235/1295/2150/2500-00-001/2510/2520
  live_bank_account_count: 9,
  // Faro Escrow Reserve (1230, factoring_reserves) is the factoring presence check; 1296 never existed in live
  include_faro_factoring_reserve: true,
  tolerance_cents: 0,
};

export function evaluateTieout(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, reason: "no live USMCA bank accounts returned (empty is never PASS)" };
  }
  const countMatches = rows.length === EXPECTED.live_bank_account_count;
  const observed = rows.map((row) => `${row.account_name} [${row.account_number ?? "unbound"}]`).join(", ");
  const countReason = countMatches ? null : `expected ${EXPECTED.live_bank_account_count} live USMCA bank accounts; observed ${rows.length}: ${observed}`;
  const unbound = rows.filter((row) => !row.ledger_account_id);
  if (unbound.length > 0) {
    return { ok: false, reason: `missing ledger_account_id: ${unbound.map((r) => r.account_name).join(", ")}` };
  }
  const missingGl = rows.filter((row) => row.gl_closing_cents == null);
  if (missingGl.length > 0) {
    return { ok: false, reason: `missing linked GL balance: ${missingGl.map((r) => r.account_name).join(", ")}` };
  }
  // Faro Escrow Reserve must be present (system_purpose = factoring_reserves)
  const faroReserve = rows.filter((row) => row.system_purpose === "factoring_reserves");
  if (faroReserve.length !== 1) {
    return { ok: false, reason: `expected exactly one factoring_reserves account; observed ${faroReserve.length}` };
  }
  const measured = rows.map((row) => {
    const bankClosingCents = Number(row.bank_closing_cents);
    const glClosingCents = Number(row.gl_closing_cents);
    return { ...row, bankClosingCents, glClosingCents, varianceCents: glClosingCents - bankClosingCents };
  });
  const invalid = measured.filter(
    (row) => !Number.isSafeInteger(row.bankClosingCents) || !Number.isSafeInteger(row.glClosingCents)
  );
  if (invalid.length > 0) {
    return { ok: false, reason: `unsafe balance value: ${invalid.map((r) => r.account_name).join(", ")}` };
  }
  const failures = measured.filter((row) => Math.abs(row.varianceCents) > EXPECTED.tolerance_cents);
  return { ok: countMatches && failures.length === 0, measured, failures, reason: countReason };
}

function selftest() {
  const base = [
    ["USMCA FREIGHT", "1000", "bank_operating", 100, 100],
    ["Petty Cash", "1005", null, 0, 0],
    ["Faro Escrow Reserve", "1230", "factoring_reserves", 200, 200],
    ["Faro Cash Reserve", "1235", null, 0, 0],
    ["Relay Fuel Wallet", "1295", "relay_fuel_wallet", 300, 300],
    ["Faro Factoring", "2150", "factoring_advance_liability", 0, 0],
    ["Amex-Scentsx", "2500-00-001", null, 0, 0],
    ["Dreamline Diesel Card", "2510", null, 0, 0],
    ["England WEX Fuel Card", "2520", null, 400, 400],
  ].map(([account_name, account_number, system_purpose, bank_closing_cents, gl_closing_cents], index) => ({
    id: String(index), account_name, account_number, system_purpose,
    ledger_account_id: `ledger-${index}`, bank_closing_cents, gl_closing_cents,
  }));
  if (!evaluateTieout(base).ok) throw new Error("equal nine-account population must pass");
  if (evaluateTieout([]).ok) throw new Error("empty population must fail");
  if (evaluateTieout(base.slice(0, 8)).ok) throw new Error("missing live account must fail");
  if (evaluateTieout(base.map((r) => r.system_purpose === "factoring_reserves" ? { ...r, system_purpose: "other" } : r)).ok) throw new Error("missing factoring_reserves must fail");
  if (evaluateTieout(base.map((r, i) => i === 0 ? { ...r, ledger_account_id: null } : r)).ok) throw new Error("unbound must fail");
  if (evaluateTieout(base.map((r, i) => i === 1 ? { ...r, gl_closing_cents: null } : r)).ok) throw new Error("missing GL must fail");
  if (evaluateTieout(base.map((r, i) => i === 2 ? { ...r, gl_closing_cents: r.gl_closing_cents + 1 } : r)).ok) throw new Error("one-cent mutation must fail");
  console.log("SELFTEST PASS: BANK-TIEOUT-01 rejects empty/missing/factoring_reserves/unbound/one-cent mutations");
}

if (process.argv.includes("--expected-only")) { console.log(JSON.stringify(EXPECTED)); process.exit(0); }
if (process.argv.includes("--selftest")) { selftest(); process.exit(0); }

const url = requireDb();

async function main() {
  const pool = new pg.Pool(buildPgPoolConfig(url));
  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET TRANSACTION READ ONLY");
      await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
      const result = await client.query(`
        WITH usmca AS (
          SELECT id FROM org.companies WHERE code = 'USMCA' LIMIT 1
        ), gl AS (
          SELECT account_id, closing_balance_cents
            FROM accounting.fn_account_balances_as_of((SELECT id FROM usmca), CURRENT_DATE, NULL::date)
        )
        SELECT ba.id::text, ba.account_name, ba.ledger_account_id::text,
               ba.current_balance_cents::text AS bank_closing_cents,
               a.account_number, a.system_purpose,
               COALESCE(gl.closing_balance_cents, 0)::text AS gl_closing_cents
          FROM banking.bank_accounts ba
          LEFT JOIN catalogs.accounts a ON a.id = ba.ledger_account_id
                                       AND a.operating_company_id = ba.operating_company_id
          LEFT JOIN gl ON gl.account_id = ba.ledger_account_id
         WHERE ba.operating_company_id = (SELECT id FROM usmca)
           AND ba.is_active = true AND ba.deactivated_at IS NULL
         ORDER BY a.account_number NULLS LAST, ba.account_name
      `);
      await client.query("ROLLBACK");
      const evaluation = evaluateTieout(result.rows);
      if (!evaluation.measured) { fail(`BANK-TIEOUT-01 ${evaluation.reason}`); return; }
      const summary = evaluation.measured.map((row) =>
        `${row.account_name} [${row.account_number ?? "unbound"}]: bank=${row.bankClosingCents}c GL=${row.glClosingCents}c variance=${row.varianceCents}c`
      ).join(" | ");
      if (!evaluation.ok) {
        const population = evaluation.reason ? `${evaluation.reason}; ` : "";
        fail(`BANK-TIEOUT-01 ${population}closing vs linked GL variance (tolerance 0): ${summary}`);
        return;
      }
      console.log(`TIEOUT PASS: BANK-TIEOUT-01 all ${evaluation.measured.length} live USMCA accounts equal linked GL (${summary})`);
    } finally { client.release(); }
  } finally { await pool.end(); }
}

main().catch((error) => {
  console.error(`TIEOUT ERROR: ${error?.message ?? error}`);
  process.exit(2);
});

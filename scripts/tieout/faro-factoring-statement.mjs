#!/usr/bin/env node
/**
 * FACT-TIEOUT-01 — Faro Capital statement 2026-08-10..2026-08-28 vs TMS.
 * Empty / missing DB is never PASS (sql-runner R2). Tolerance 0.
 *
 * Observed values are computed live, not typed:
 *   face_cents          SUM(total_cents) of all 33 CSV-sourced USMCA invoices
 *                        (regardless of current status — face is what Faro purchased
 *                        against, not what's currently active on the books).
 *   ar_cents             SUM(total_cents) of the SAME 33 invoices, ACTIVE (non-void) only —
 *                        this is the real current A/R, and is expected to differ from
 *                        face_cents while any invoice (e.g. 016) is void pending recreation.
 *   reserve_cents/fee_cents/cash_cents
 *                        SUM(reserve_amount_cents / factor_fee_cents / advance_amount_cents)
 *                        from accounting.factoring_advances joined to those 33 invoices via
 *                        invoices.factoring_advance_id, excluding voided advances. Zero
 *                        factoring advances exist until CC-1 submits them — this is expected
 *                        to read $0 until that happens, not a fabricated shortfall.
 *   wire_cents           derived, not a stored column: invoice_total_cents - reserve_amount_cents
 *                        - factor_fee_cents - advance_amount_cents, summed over the same
 *                        active advances (FACT-RESERVE-01 confirmed advance_amount_cents is
 *                        the actual cash funded, i.e. already net of wire).
 *   factoring_reserve_gl_cents
 *                        live balance of catalogs.accounts '1230 Factoring Reserves'
 *                        (Asset: debit - credit). NOTE: escrow_cents and cash_reserve_cents
 *                        are NOT separately queryable from the GL — 1230 carries one combined
 *                        balance. Compared against escrow_cents + cash_reserve_cents combined,
 *                        not fabricated as two separate GL sub-balances.
 *   factoring_advance_gl_cents
 *                        live balance of '2150 Factoring Advance' (Liability: credit - debit).
 *   nfe_cents            factoring_advance_gl_cents - factoring_reserve_gl_cents, compared to
 *                        the packet's own stated identity (2150 - 1230 = Faro statement NFE).
 */
import { fail, requireDb, unverified } from "./_lib.mjs";
import pgConnectionOptions from "../lib/pg-connection-options.cjs";
const { buildPgPoolConfig } = pgConnectionOptions;

const USMCA_OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80";

export const EXPECTED = {
  invoice_count: 33,
  face_cents: 9507500,
  reserve_cents: 142613,
  fee_cents: 142613,
  wire_cents: 12000,
  wire_fee_invoice_count: 12,
  cash_cents: 9210274,
  ar_cents: 9507500,
  escrow_cents: 142613,
  cash_reserve_cents: 500000,
  nfe_cents: 8864887,
};

function validateExpected(expected) {
  const problems = [];
  if (expected.invoice_count !== 33) problems.push("Faro cohort must contain exactly 33 invoices");
  if (expected.wire_fee_invoice_count !== 12) problems.push("wire fees must cover exactly 12 invoices");
  if (expected.wire_cents !== 12000) problems.push("wire fees must total exactly 12000 cents");
  if (expected.cash_cents + expected.fee_cents + expected.reserve_cents + expected.wire_cents !== expected.face_cents) {
    problems.push("cash + factor fee + reserve + wire fee must equal face");
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    { ...EXPECTED, invoice_count: 32 },
    { ...EXPECTED, wire_fee_invoice_count: 11 },
    { ...EXPECTED, wire_cents: 11999 },
    { ...EXPECTED, cash_cents: EXPECTED.cash_cents + 1 },
  ];
  if (mutations.some((candidate) => validateExpected(candidate).length === 0)) {
    fail("FACT-TIEOUT-01 selftest failed to reject an invalid Faro contract mutation");
  }
  console.log(`FACT-TIEOUT-01 selftest PASS (${mutations.length}/${mutations.length})`);
  process.exit(0);
}

const expectedProblems = validateExpected(EXPECTED);
if (expectedProblems.length) fail(`Faro expected contract invalid: ${expectedProblems.join("; ")}`);

if (process.argv.includes("--expected-only")) {
  console.log(JSON.stringify(EXPECTED));
  process.exit(0);
}

const url = requireDb();
const { default: pg } = await import("pg");
const { Pool } = pg;

async function main() {
  const pool = new Pool(buildPgPoolConfig(url));
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");

    // R1 mandatory discriminator: a live, non-zero, independently-known control value must be
    // reachable in the same connection context, or the bypass/session context is not real.
    const jeControl = await client.query(
      "SELECT count(*)::int AS n FROM accounting.journal_entries"
    );
    if (!jeControl.rows[0] || jeControl.rows[0].n < 2219) {
      await client.query("ROLLBACK");
      unverified(
        `je_control discriminator too low (${jeControl.rows[0]?.n ?? "null"}, expected >= 2219) — session/bypass context not trusted`
      );
    }

    const faceRes = await client.query(
      `SELECT count(*)::int AS invoice_count,
              COALESCE(SUM(total_cents), 0)::bigint AS face_cents,
              COALESCE(SUM(total_cents) FILTER (WHERE status <> 'void'), 0)::bigint AS ar_cents
       FROM accounting.invoices
       WHERE operating_company_id = $1::uuid
         AND internal_notes ILIKE '%TASK6-FARO-33-INVOICES%'`,
      [USMCA_OPCO]
    );
    const { invoice_count, face_cents, ar_cents } = faceRes.rows[0];

    const advRes = await client.query(
      `SELECT
         COALESCE(SUM(fa.reserve_amount_cents), 0)::bigint AS reserve_cents,
         COALESCE(SUM(fa.factor_fee_cents), 0)::bigint AS fee_cents,
         COALESCE(SUM(fa.advance_amount_cents), 0)::bigint AS cash_cents,
         count(*) FILTER (WHERE fa.invoice_total_cents - fa.reserve_amount_cents
                           - fa.factor_fee_cents - fa.advance_amount_cents > 0)::int
           AS wire_fee_invoice_count,
         COALESCE(SUM(fa.invoice_total_cents - fa.reserve_amount_cents
                       - fa.factor_fee_cents - fa.advance_amount_cents), 0)::bigint AS wire_cents
       FROM accounting.factoring_advances fa
       JOIN accounting.invoices i ON i.factoring_advance_id = fa.id
       WHERE i.operating_company_id = $1::uuid
         AND i.internal_notes ILIKE '%TASK6-FARO-33-INVOICES%'
         AND fa.status <> 'voided'`,
      [USMCA_OPCO]
    );
    const { reserve_cents, fee_cents, cash_cents, wire_cents, wire_fee_invoice_count } = advRes.rows[0];

    const glRes = await client.query(
      `SELECT
         COALESCE(SUM(CASE WHEN ca.account_number = '1230'
                            THEN CASE WHEN jep.debit_or_credit = 'debit' THEN jep.amount_cents ELSE -jep.amount_cents END
                            ELSE 0 END), 0)::bigint AS reserve_gl_cents,
         COALESCE(SUM(CASE WHEN ca.account_number = '2150'
                            THEN CASE WHEN jep.debit_or_credit = 'credit' THEN jep.amount_cents ELSE -jep.amount_cents END
                            ELSE 0 END), 0)::bigint AS advance_gl_cents
       FROM accounting.journal_entry_postings jep
       JOIN catalogs.accounts ca ON ca.id = jep.account_id
       WHERE jep.operating_company_id = $1::uuid
         AND ca.account_number IN ('1230', '2150')`,
      [USMCA_OPCO]
    );
    const { reserve_gl_cents, advance_gl_cents } = glRes.rows[0];
    const nfe_cents = Number(advance_gl_cents) - Number(reserve_gl_cents);
    const combined_reserve_expected = EXPECTED.escrow_cents + EXPECTED.cash_reserve_cents;

    await client.query("COMMIT");

    const observed = {
      invoice_count: Number(invoice_count),
      face_cents: Number(face_cents),
      ar_cents: Number(ar_cents),
      reserve_cents: Number(reserve_cents),
      fee_cents: Number(fee_cents),
      cash_cents: Number(cash_cents),
      wire_cents: Number(wire_cents),
      wire_fee_invoice_count: Number(wire_fee_invoice_count),
      factoring_reserve_gl_cents: Number(reserve_gl_cents),
      factoring_advance_gl_cents: Number(advance_gl_cents),
      nfe_cents,
    };

    // R6: record the observed value always, pass or fail. Compare at tolerance 0.
    const diffs = [];
    const checkEq = (label, obs, exp) => {
      if (obs !== exp) diffs.push(`${label}: observed ${obs} vs expected ${exp} (diff ${obs - exp})`);
    };
    checkEq("invoice_count", observed.invoice_count, EXPECTED.invoice_count);
    checkEq("face_cents", observed.face_cents, EXPECTED.face_cents);
    checkEq("ar_cents", observed.ar_cents, EXPECTED.ar_cents);
    checkEq("reserve_cents", observed.reserve_cents, EXPECTED.reserve_cents);
    checkEq("fee_cents", observed.fee_cents, EXPECTED.fee_cents);
    checkEq("wire_cents", observed.wire_cents, EXPECTED.wire_cents);
    checkEq("wire_fee_invoice_count", observed.wire_fee_invoice_count, EXPECTED.wire_fee_invoice_count);
    checkEq("cash_cents", observed.cash_cents, EXPECTED.cash_cents);
    checkEq(
      "factoring_reserve_gl_cents (escrow+cash_reserve combined — not separately split in the GL)",
      observed.factoring_reserve_gl_cents,
      combined_reserve_expected
    );
    checkEq("nfe_cents", observed.nfe_cents, EXPECTED.nfe_cents);

    console.log(`TIEOUT OBSERVED: ${JSON.stringify(observed)}`);

    if (diffs.length) {
      fail(`Faro factoring statement tie-out FAIL (${diffs.length} mismatch(es)):\n  ` + diffs.join("\n  "));
    }

    console.log("TIEOUT PASS: Faro factoring statement ties to TMS at tolerance 0");
    process.exit(0);
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback failure, the connection is being released regardless
    }
    fail(`Faro factoring statement tie-out errored: ${e.message}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main();

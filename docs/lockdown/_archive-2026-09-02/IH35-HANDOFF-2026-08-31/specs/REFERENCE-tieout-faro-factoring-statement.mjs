#!/usr/bin/env node
/**
 * FACT-TIEOUT-01 — Faro Capital statement 2026-08-10..2026-08-28 vs the USMCA books.
 *
 * BAR-2 REFERENCE IMPLEMENTATION. The other five tie-outs follow this shape.
 *
 * Rules this file obeys, and every tie-out must:
 *   R1  tolerance 0. A non-zero tolerance needs an owner-approved note naming why.
 *   R2  an EMPTY RESULT IS NEVER A PASS. No rows => FAIL, never "nothing to check".
 *   R6  record the OBSERVED value ALWAYS, pass or fail.
 *   R7  the outside document is the truth; the system is on trial. NEVER edit EXPECTED
 *       to make this pass. If it fails, report the difference and its cause.
 *   R8  missing DATABASE_URL => exit 2 UNVERIFIED, never exit 0.
 *
 * The numbers come from the Faro statement and are independently reconciled:
 *   face 95,075.00 - reserve 1,426.13 - fee 1,426.13 - wire 120.00 = cash 92,102.74
 *   face 95,075.00 - escrow 1,426.13 - cash reserve 5,000.00       = NFE  88,648.87
 * Reserve and fee are each exactly 1.500000% of face; proceeds pre-wire are 97.000000%.
 *
 * Read from the GL by system_purpose, not by account number and not from typed columns —
 * that is why 1210/1230/2150/6400 were stamped. A rename must not move the money.
 */
import pg from "pg";
import { fail, requireDb, unverified } from "./_lib.mjs";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

export const EXPECTED = {
  face_cents: 9507500,
  reserve_cents: 142613,
  fee_cents: 142613,
  wire_cents: 12000,
  cash_cents: 9210274,
  ar_cents: 9507500,
  escrow_cents: 142613,
  cash_reserve_cents: 500000,
  nfe_cents: 8864887,
};

if (process.argv.includes("--expected-only")) {
  console.log(JSON.stringify(EXPECTED));
  process.exit(0);
}

/** Signed GL balance for one system_purpose. Debit-positive; liabilities read credit-positive. */
const BALANCE_SQL = `
  SELECT COALESCE(SUM(CASE WHEN jep.debit_or_credit = 'debit'
                           THEN jep.amount_cents ELSE -jep.amount_cents END), 0)::bigint AS cents,
         COUNT(*)::int AS lines
    FROM accounting.journal_entry_postings jep
    JOIN accounting.journal_entries je ON je.id = jep.journal_entry_uuid
    JOIN catalogs.accounts a ON a.id = jep.account_id
   WHERE jep.operating_company_id = $1::uuid
     AND je.voided_at IS NULL
     AND a.system_purpose = $2
`;

const client = new pg.Pool({ connectionString: requireDb(), max: 2 });

async function balance(purpose) {
  const r = await client.query(BALANCE_SQL, [USMCA, purpose]);
  return { cents: Number(r.rows[0]?.cents ?? 0), lines: Number(r.rows[0]?.lines ?? 0) };
}

try {
  await client.query("SET LOCAL app.bypass_rls = 'lucia'").catch(() => {});

  const advances = await client.query(
    `SELECT COUNT(*)::int AS n,
            COALESCE(SUM(invoice_total_cents), 0)::bigint AS face,
            COALESCE(SUM(reserve_amount_cents), 0)::bigint AS reserve,
            COALESCE(SUM(factor_fee_cents), 0)::bigint     AS fee
       FROM accounting.factoring_advances
      WHERE operating_company_id = $1::uuid
        AND status = 'advanced'`,
    [USMCA]
  );
  const a = advances.rows[0];
  const observed = {
    live_advances: Number(a.n),
    face_cents: Number(a.face),
    reserve_cents: Number(a.reserve),
    fee_cents: Number(a.fee),
    gl_advance_liability_cents: -(await balance("factoring_advance_liability")).cents,
    gl_reserve_cents: (await balance("factoring_reserves")).cents,
    gl_fee_expense_cents: (await balance("factoring_fees")).cents,
  };
  observed.nfe_cents = observed.gl_advance_liability_cents - observed.gl_reserve_cents;

  // R6 — the observed value is recorded whether this passes or fails.
  console.log("TIEOUT OBSERVED " + JSON.stringify(observed));
  console.log("TIEOUT EXPECTED " + JSON.stringify(EXPECTED));

  // R2 — empty is never a pass.
  if (observed.live_advances === 0) {
    fail(
      "no live factoring advances on the USMCA books (the only advance is voided) — " +
        "empty is never a pass (R2). Expected face " + EXPECTED.face_cents + " cents across " +
        "the Faro 33 cohort. Cause: invoice 016 has not been rebuilt as $4,200 + $400 credit " +
        "memo + factor $3,800, so the cohort was never factored. OBSERVED " + JSON.stringify(observed)
    );
  }

  const diffs = [];
  const cmp = (key, obs, exp) => {
    const d = obs - exp;
    if (d !== 0) diffs.push(`${key}: observed ${obs} expected ${exp} difference ${d > 0 ? "+" : ""}${d} cents`);
  };
  cmp("face", observed.face_cents, EXPECTED.face_cents);
  cmp("reserve", observed.reserve_cents, EXPECTED.reserve_cents);
  cmp("fee", observed.fee_cents, EXPECTED.fee_cents);
  cmp("gl_advance_liability", observed.gl_advance_liability_cents, EXPECTED.face_cents);
  cmp("gl_reserve", observed.gl_reserve_cents, EXPECTED.escrow_cents);
  cmp("gl_fee_expense", observed.gl_fee_expense_cents, EXPECTED.fee_cents);
  cmp("nfe", observed.nfe_cents, EXPECTED.nfe_cents);

  if (diffs.length) {
    // R7 — report the difference and its cause. NEVER move EXPECTED to make this pass.
    fail(
      "Faro statement does not tie at tolerance 0:\n  " + diffs.join("\n  ") +
        "\nThe Faro statement is the outside document and is the truth. Fix the books, " +
        "not the expected value."
    );
  }

  console.log("TIEOUT PASS FACT-TIEOUT-01 — Faro statement ties at tolerance 0");
  process.exit(0);
} catch (err) {
  unverified(`FACT-TIEOUT-01 could not complete: ${err && err.message ? err.message : err}`);
} finally {
  await client.end().catch(() => {});
}

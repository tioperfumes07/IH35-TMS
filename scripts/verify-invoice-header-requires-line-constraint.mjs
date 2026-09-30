#!/usr/bin/env node
// B-26 (CC-2 spec, docs/bus/2026-09-30-CC2-B26-LINELESS-INVOICE-CONSTRAINT-SPEC.md): a lineless
// invoice header must be impossible AT THE TABLE. Asserts the DEFERRABLE constraint trigger from
// migration 202614780000 is live, and (when a DATABASE_URL is available) that it actually refuses
// a zero-line header inside a rolled-back transaction -- never writes anything real.
//
// Usage: node scripts/verify-invoice-header-requires-line-constraint.mjs [--selftest]
import pg from "pg";

const LABEL = "verify-invoice-header-requires-line-constraint";

export function findMissingTrigger(triggers) {
  const has = triggers.some((t) => t.tgname === "invoice_must_have_lines");
  return has ? null : "no constraint trigger named invoice_must_have_lines on accounting.invoices";
}

function selftest() {
  if (findMissingTrigger([{ tgname: "invoice_must_have_lines" }]) !== null) {
    throw new Error("expected PASS when the trigger is present");
  }
  if (findMissingTrigger([]) === null) {
    throw new Error("expected FAIL when the trigger is absent");
  }
  console.log(`${LABEL} --selftest OK`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else if (!process.env.DATABASE_URL) {
  console.log(`${LABEL} (live check): SKIP — no DATABASE_URL (selftest is sufficient offline).`);
} else {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("RESET ROLE");
    const { rows } = await client.query(
      "SELECT tgname FROM pg_trigger WHERE tgrelid = 'accounting.invoices'::regclass"
    );
    const problem = findMissingTrigger(rows);
    if (problem) {
      console.error(`${LABEL} FAIL: ${problem}`);
      process.exit(1);
    }

    // Live behavioural check, fully rolled back — no data written.
    await client.query("BEGIN");
    try {
      const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
      const cust = await client.query(
        "SELECT id FROM mdata.customers WHERE operating_company_id = $1 LIMIT 1",
        [USMCA]
      );
      if (cust.rows.length === 0) {
        console.log(`${LABEL} PASS (trigger exists) — live behavioural check SKIPPED (no USMCA customer to test against)`);
      } else {
        const inv = await client.query(
          `INSERT INTO accounting.invoices
             (operating_company_id, customer_id, status, issue_date, due_date, subtotal_cents, tax_cents, total_cents, display_id)
           VALUES ($1,$2,'draft',now(),now(),0,0,100,'INV-2099-99996')
           RETURNING id`,
          [USMCA, cust.rows[0].id]
        );
        let refused = false;
        try {
          await client.query("SET CONSTRAINTS accounting.invoice_must_have_lines IMMEDIATE");
        } catch (e) {
          refused = /has no invoice_lines rows/.test(e.message);
        }
        if (!refused) {
          console.error(`${LABEL} FAIL: a zero-line header was NOT refused when the constraint was checked immediately`);
          process.exit(1);
        }
        console.log(`${LABEL} PASS — trigger exists and live-refuses a zero-line header (rolled back, no data written)`);
      }
    } finally {
      await client.query("ROLLBACK");
    }
  } finally {
    await client.end();
  }
}

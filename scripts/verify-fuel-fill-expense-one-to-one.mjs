#!/usr/bin/env node
/**
 * ENG-48 (CC-2 Row 48) — fuel fill → expense one-to-one ratchet engine.
 *
 * Every non-voided USMCA fuel fill should produce:
 *   - Exactly one JE posting (source_transaction_type = 'fuel_event')
 *   - Exactly one expense (source_fuel_transaction_id = ft.id)
 *
 * Ratchet ceilings (measured 2026-11-13, voided_at IS NULL OR reinstated_at IS NOT NULL):
 *   NO_JE_CEILING       = 907   (fills with no JE posting)
 *   NO_EXPENSE_CEILING  = 125   (fills with no expense record)
 *   MULTI_EXPENSE_CEIL  = 214   (fills with >1 expense record)
 *   ZERO_JE_CEILING     = 0     (fills with a zero-cent JE posting)
 *
 * Guard fails if any metric EXCEEDS its ceiling. Counts are allowed to shrink.
 */
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-fuel-fill-expense-one-to-one";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

const NO_JE_CEILING      = 907;
const NO_EXPENSE_CEILING = 125;
const MULTI_EXPENSE_CEIL = 214;
const ZERO_JE_CEILING    = 0;

async function measure(client) {
  const res = await client.query(
    `WITH base AS (
       SELECT
         ft.id,
         COUNT(jep.id) FILTER (
           WHERE jep.source_transaction_type = 'fuel_event'
             AND jep.source_transaction_id = ft.id::varchar
             AND jep.operating_company_id = $1::uuid
         ) AS je_count,
         COALESCE(SUM(jep.amount_cents) FILTER (
           WHERE jep.source_transaction_type = 'fuel_event'
             AND jep.source_transaction_id = ft.id::varchar
             AND jep.operating_company_id = $1::uuid
         ), 0) AS je_total_cents,
         COUNT(ex.id) AS expense_count
       FROM fuel.fuel_transactions ft
       LEFT JOIN accounting.journal_entry_postings jep
         ON jep.source_transaction_type = 'fuel_event'
        AND jep.source_transaction_id = ft.id::varchar
        AND jep.operating_company_id = $1::uuid
       LEFT JOIN accounting.expenses ex
         ON ex.source_fuel_transaction_id = ft.id
        AND ex.operating_company_id = $1::uuid
       WHERE ft.operating_company_id = $1::uuid
         AND (ft.voided_at IS NULL OR ft.reinstated_at IS NOT NULL)
       GROUP BY ft.id
     )
     SELECT
       COUNT(*) FILTER (WHERE je_count = 0)   AS no_je_count,
       COUNT(*) FILTER (WHERE expense_count = 0) AS no_expense_count,
       COUNT(*) FILTER (WHERE expense_count > 1)  AS multi_expense_count,
       COUNT(*) FILTER (WHERE je_count > 0 AND je_total_cents = 0) AS zero_je_count,
       COUNT(*) AS total_fills
     FROM base`,
    [USMCA]
  );
  return res.rows[0];
}

function check(row) {
  const fails = [];
  const noJe      = parseInt(row.no_je_count      ?? "0");
  const noExp     = parseInt(row.no_expense_count  ?? "0");
  const multiExp  = parseInt(row.multi_expense_count ?? "0");
  const zeroJe    = parseInt(row.zero_je_count     ?? "0");

  if (noJe > NO_JE_CEILING)
    fails.push(`no_je_count ${noJe} exceeds ceiling ${NO_JE_CEILING}`);
  if (noExp > NO_EXPENSE_CEILING)
    fails.push(`no_expense_count ${noExp} exceeds ceiling ${NO_EXPENSE_CEILING}`);
  if (multiExp > MULTI_EXPENSE_CEIL)
    fails.push(`multi_expense_count ${multiExp} exceeds ceiling ${MULTI_EXPENSE_CEIL}`);
  if (zeroJe > ZERO_JE_CEILING)
    fails.push(`zero_je_count ${zeroJe} exceeds ceiling ${ZERO_JE_CEILING}`);

  return fails;
}

async function run() {
  if (process.argv.includes("--selftest")) {
    // Mutation 1: no_je_count exceeds ceiling
    const fake1 = { no_je_count: String(NO_JE_CEILING + 1), no_expense_count: "0", multi_expense_count: "0", zero_je_count: "0", total_fills: "1088" };
    if (check(fake1).length === 0) {
      process.stderr.write(`${LABEL} SELFTEST FAIL — mutation 1 (no_je exceeds) not caught\n`);
      process.exit(1);
    }
    // Mutation 2: multi_expense_count exceeds ceiling
    const fake2 = { no_je_count: "0", no_expense_count: "0", multi_expense_count: String(MULTI_EXPENSE_CEIL + 1), zero_je_count: "0", total_fills: "1088" };
    if (check(fake2).length === 0) {
      process.stderr.write(`${LABEL} SELFTEST FAIL — mutation 2 (multi_expense exceeds) not caught\n`);
      process.exit(1);
    }
    process.stdout.write(`${LABEL} --selftest PASS 2/2 mutations caught\n`);
    process.exit(0);
  }

  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL app.bypass_rls = 'on'");
    await client.query(`SET LOCAL app.operating_company_id = '${USMCA}'`);

    const row = await measure(client);
    const fails = check(row);

    if (fails.length > 0) {
      process.stderr.write(`${LABEL} FAIL (${fails.length}):\n`);
      for (const f of fails) process.stderr.write(`  - ${f}\n`);
      process.exitCode = 1;
    } else {
      process.stdout.write(
        `${LABEL}: PASS — total_fills=${row.total_fills}` +
        ` no_je=${row.no_je_count}/${NO_JE_CEILING}` +
        ` no_expense=${row.no_expense_count}/${NO_EXPENSE_CEILING}` +
        ` multi_expense=${row.multi_expense_count}/${MULTI_EXPENSE_CEIL}` +
        ` zero_je=${row.zero_je_count}/${ZERO_JE_CEILING}\n`
      );
    }

    await client.query("ROLLBACK");
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  process.stderr.write(`${LABEL} ERROR: ${err.message}\n`);
  process.exit(1);
});

#!/usr/bin/env node
// verify-expense-line-item-and-account-required.mjs — DOCUMENT INTEGRITY engine fix (CC-1).
//
// THE RULE: accounting.expense_lines rows must always carry a real item_id AND a real
// expense_account_uuid. A line with either missing is exactly how the 639-row DOCUMENT INTEGRITY
// gap (2026-09-30) got created in the first place -- a historical AlwaysTrack-feed/fuel-card
// import materialized lines without resolving their real category. The DB-level check constraints
// `expense_lines_item_id_required` / `expense_lines_expense_account_required` (both NOT VALID --
// enforced for every new write, not retroactive) are the actual enforcement; this guard verifies
// both constraints exist and are doing their job, plus asserts the legacy-row counts never grow
// past their known, grandfathered baselines.
//
// SHRINK-ONLY RATCHET, same discipline as every other live-data guard in this repo (see
// verify-g2-extra-pay-requires-item.mjs, verify-fuel-cost-posts-exactly-once.mjs check D): the 120
// item_id-NULL rows (and 0 expense_account_uuid-NULL rows -- that population was fully resolved)
// left as a real, named gap deliberately -- no confirmed source names their real category, listed
// in docs/bus/2026-09-30-CC1-DOCUMENT-INTEGRITY-EXPENSE-LINES-639.md, never guessed. This can only
// shrink (if a future source lookup resolves one) and must never grow.
import pg from "pg";

const LABEL = "verify-expense-line-item-and-account-required";
const USMCA_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const KNOWN_LEGACY_NULL_ITEM_COUNT = 120;
const KNOWN_LEGACY_NULL_ACCOUNT_COUNT = 0;

export function classify(input) {
  const {
    itemConstraintExists,
    accountConstraintExists,
    liveNullItemCount,
    liveNullAccountCount,
  } = input;
  const problems = [];
  if (!itemConstraintExists) {
    problems.push("ITEM_CONSTRAINT_MISSING: expense_lines_item_id_required does not exist on accounting.expense_lines.");
  }
  if (!accountConstraintExists) {
    problems.push("ACCOUNT_CONSTRAINT_MISSING: expense_lines_expense_account_required does not exist on accounting.expense_lines.");
  }
  if (liveNullItemCount > KNOWN_LEGACY_NULL_ITEM_COUNT) {
    problems.push(`ITEM_GREW: ${liveNullItemCount} live expense_lines rows have item_id NULL, exceeding the known legacy baseline of ${KNOWN_LEGACY_NULL_ITEM_COUNT}. The constraint should have refused this -- investigate immediately, do not just raise the baseline.`);
  }
  if (liveNullAccountCount > KNOWN_LEGACY_NULL_ACCOUNT_COUNT) {
    problems.push(`ACCOUNT_GREW: ${liveNullAccountCount} live expense_lines rows have expense_account_uuid NULL, exceeding the known legacy baseline of ${KNOWN_LEGACY_NULL_ACCOUNT_COUNT}. The constraint should have refused this -- investigate immediately, do not just raise the baseline.`);
  }
  return { pass: problems.length === 0, problems };
}

function selftest() {
  let pass = 0, fail = 0;
  const base = {
    itemConstraintExists: true,
    accountConstraintExists: true,
    liveNullItemCount: KNOWN_LEGACY_NULL_ITEM_COUNT,
    liveNullAccountCount: KNOWN_LEGACY_NULL_ACCOUNT_COUNT,
  };

  const green = classify(base);
  if (!green.pass) { console.error(`${LABEL} --selftest FAIL — GREEN: expected pass at baseline`); fail++; } else pass++;

  const redItemGrew = classify({ ...base, liveNullItemCount: KNOWN_LEGACY_NULL_ITEM_COUNT + 1 });
  if (redItemGrew.pass) { console.error(`${LABEL} --selftest FAIL — RED ITEM GREW: expected fail`); fail++; } else pass++;

  const redAccountGrew = classify({ ...base, liveNullAccountCount: KNOWN_LEGACY_NULL_ACCOUNT_COUNT + 1 });
  if (redAccountGrew.pass) { console.error(`${LABEL} --selftest FAIL — RED ACCOUNT GREW: expected fail`); fail++; } else pass++;

  const redItemMissing = classify({ ...base, itemConstraintExists: false });
  if (redItemMissing.pass) { console.error(`${LABEL} --selftest FAIL — RED ITEM CONSTRAINT MISSING: expected fail`); fail++; } else pass++;

  const redAccountMissing = classify({ ...base, accountConstraintExists: false });
  if (redAccountMissing.pass) { console.error(`${LABEL} --selftest FAIL — RED ACCOUNT CONSTRAINT MISSING: expected fail`); fail++; } else pass++;

  const shrunk = classify({ ...base, liveNullItemCount: KNOWN_LEGACY_NULL_ITEM_COUNT - 1 });
  if (!shrunk.pass) { console.error(`${LABEL} --selftest FAIL — SHRUNK: expected pass below baseline`); fail++; } else pass++;

  if (fail > 0) { process.exitCode = 1; } else { console.log(`${LABEL} --selftest PASS — ${pass} classifier fixtures all correct`); }
}

async function main() {
  if (process.argv.includes("--selftest")) { selftest(); return; }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("RESET ROLE");
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);

    const conRes = await client.query(
      `SELECT conname FROM pg_constraint
        WHERE conname IN ('expense_lines_item_id_required', 'expense_lines_expense_account_required')`
    );
    const found = new Set(conRes.rows.map((r) => r.conname));
    const itemConstraintExists = found.has("expense_lines_item_id_required");
    const accountConstraintExists = found.has("expense_lines_expense_account_required");

    const cntRes = await client.query(
      `SELECT
         count(*) FILTER (WHERE item_id IS NULL)::int AS null_item,
         count(*) FILTER (WHERE expense_account_uuid IS NULL)::int AS null_account
       FROM accounting.expense_lines
      WHERE operating_company_id = $1::uuid`,
      [USMCA_ID]
    );
    const liveNullItemCount = cntRes.rows[0].null_item;
    const liveNullAccountCount = cntRes.rows[0].null_account;

    await client.query("ROLLBACK");

    const result = classify({ itemConstraintExists, accountConstraintExists, liveNullItemCount, liveNullAccountCount });
    console.log(
      `${LABEL}: item constraint ${itemConstraintExists ? "present" : "MISSING"}, ` +
      `account constraint ${accountConstraintExists ? "present" : "MISSING"}, ` +
      `null item_id rows: ${liveNullItemCount} (baseline ${KNOWN_LEGACY_NULL_ITEM_COUNT}), ` +
      `null expense_account_uuid rows: ${liveNullAccountCount} (baseline ${KNOWN_LEGACY_NULL_ACCOUNT_COUNT})`
    );
    if (!result.pass) {
      console.error(`${LABEL}: FAIL —`, result.problems.join(" "));
      process.exitCode = 1;
    } else {
      console.log(`${LABEL}: PASS`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

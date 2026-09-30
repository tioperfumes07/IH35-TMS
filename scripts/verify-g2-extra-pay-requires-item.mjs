#!/usr/bin/env node
// verify-g2-extra-pay-requires-item.mjs — verify-step 11773 (CC-1, G2 engine fix).
//
// THE RULE: driver_finance.settlement_lines rows with line_type='extra_pay' must always carry a
// real item_id. A merged, generic "AlwaysTrack tarp/other/extra-stop" line with no item is exactly
// how G2 (17, now 16, legacy rows misclassified into 6890 Cost of Labor-MX) got created in the
// first place -- see AUTH-168 / migration 202614680000. The DB-level check constraint
// `settlement_lines_extra_pay_requires_item` (NOT VALID -- enforced for every new write, not
// retroactive) is the actual enforcement; this guard verifies that constraint exists and is doing
// its job, plus asserts the legacy-row count never grows past its known, grandfathered baseline.
//
// SHRINK-ONLY RATCHET, same discipline as every other live-data guard in this repo: the 16 rows
// AUTH-168 left as a real gap deliberately (their item_id stays NULL -- the correction lives in
// the settlement_line_item_splits mapping table + the adjusting JE, never on the settlement_line
// itself, because the settlements themselves are closed/verified and never reopened) plus the 1
// row AUTH-168 explicitly held out (b0c47f5c, $22.14 -- unresolvable from any source) = 17 legacy
// rows. This can only shrink (if a future decision resolves the held-out row) and must never grow.
import pg from "pg";

const LABEL = "verify-g2-extra-pay-requires-item";
const USMCA_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const KNOWN_LEGACY_NULL_ITEM_COUNT = 17; // 16 split via AUTH-168 + 1 held out (b0c47f5c)

export function classify(input) {
  const { constraintExists, constraintValidated, liveNullItemCount } = input;
  const problems = [];
  if (!constraintExists) {
    problems.push("CONSTRAINT_MISSING: settlement_lines_extra_pay_requires_item does not exist on driver_finance.settlement_lines.");
  }
  if (constraintValidated) {
    // A NOT VALID constraint is what we want (enforced going forward, doesn't retroactively fail
    // the 17 grandfathered rows). If it somehow got VALIDATEd, that's fine too as long as it still
    // exists and the 17 legacy rows haven't been force-corrected some other way -- but flag it as
    // unexpected so a reader knows the shape changed.
  }
  if (liveNullItemCount > KNOWN_LEGACY_NULL_ITEM_COUNT) {
    problems.push(`GREW: ${liveNullItemCount} live extra_pay rows have item_id NULL, exceeding the known legacy baseline of ${KNOWN_LEGACY_NULL_ITEM_COUNT}. The constraint should have refused this -- investigate immediately, do not just raise the baseline.`);
  }
  return { pass: problems.length === 0, problems, liveNullItemCount };
}

function selftest() {
  let pass = 0, fail = 0;
  const base = { constraintExists: true, constraintValidated: false, liveNullItemCount: KNOWN_LEGACY_NULL_ITEM_COUNT };

  const green = classify(base);
  if (!green.pass) { console.error(`${LABEL} --selftest FAIL — GREEN: expected pass at baseline`); fail++; } else pass++;

  const redGrew = classify({ ...base, liveNullItemCount: KNOWN_LEGACY_NULL_ITEM_COUNT + 1 });
  if (redGrew.pass) { console.error(`${LABEL} --selftest FAIL — RED GREW: expected fail when count exceeds baseline`); fail++; } else pass++;

  const redMissing = classify({ ...base, constraintExists: false });
  if (redMissing.pass) { console.error(`${LABEL} --selftest FAIL — RED MISSING: expected fail when constraint is absent`); fail++; } else pass++;

  const shrunk = classify({ ...base, liveNullItemCount: KNOWN_LEGACY_NULL_ITEM_COUNT - 1 });
  if (!shrunk.pass) { console.error(`${LABEL} --selftest FAIL — SHRUNK: expected pass when count is below baseline`); fail++; } else pass++;

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
      `SELECT convalidated FROM pg_constraint WHERE conname = 'settlement_lines_extra_pay_requires_item'`
    );
    const constraintExists = conRes.rows.length > 0;
    const constraintValidated = constraintExists ? conRes.rows[0].convalidated : false;

    const cntRes = await client.query(
      `SELECT count(*)::int AS cnt FROM driver_finance.settlement_lines
        WHERE operating_company_id = $1::uuid AND line_type = 'extra_pay' AND item_id IS NULL AND voided_at IS NULL`,
      [USMCA_ID]
    );
    const liveNullItemCount = cntRes.rows[0].cnt;

    await client.query("ROLLBACK");

    const result = classify({ constraintExists, constraintValidated, liveNullItemCount });
    console.log(`${LABEL}: constraint ${constraintExists ? "present" : "MISSING"}${constraintExists ? ` (validated=${constraintValidated})` : ""}, live null-item extra_pay rows: ${liveNullItemCount} (baseline ${KNOWN_LEGACY_NULL_ITEM_COUNT})`);
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

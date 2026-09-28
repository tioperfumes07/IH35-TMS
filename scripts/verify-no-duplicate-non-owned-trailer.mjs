#!/usr/bin/env node
// GUARD — ROUND 155.2c: dispatch.non_owned_trailers had TWO identical rows for trailer 538306
// (same operating_company_id, same counterparty, same day) live on prod. The table's only
// existing uniqueness lived on active dispatch.trailer_interchanges rows; nothing stopped a
// duplicate non_owned_trailers row itself. Migration 202614440000 added
// UNIQUE (operating_company_id, counterparty_id, trailer_number) WHERE voided_at IS NULL — this
// guard is the live, independent proof that invariant actually holds in prod, the same way
// verify-no-driver-merge-without-hard-identifier checks its own invariant live.
//
// Deliberately does NOT use a bare session-scoped set_config('app.bypass_rls', ..., false) —
// scripts/verify-no-session-scoped-rls-bypass.mjs (ACCT-F155.3/155.4, this same round) exists
// precisely to catch that anti-pattern, and this guard would be exactly the kind of new file it
// is meant to fail on. Uses SET LOCAL inside one explicit transaction instead.
import pg from "pg";

const LABEL = "verify-no-duplicate-non-owned-trailer";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

export function findDuplicates(rows) {
  const seen = new Map();
  for (const r of rows) {
    const key = `${r.operating_company_id}::${r.counterparty_id}::${r.trailer_number}`;
    if (!seen.has(key)) seen.set(key, []);
    seen.get(key).push(r.id);
  }
  const problems = [];
  for (const [key, ids] of seen) {
    if (ids.length > 1) problems.push({ key, ids });
  }
  return problems;
}

function selftest() {
  const failures = [];
  const t = (l, c) => { if (!c) failures.push(l); };

  const clean = [
    { id: "a", operating_company_id: "co1", counterparty_id: "cp1", trailer_number: "111" },
    { id: "b", operating_company_id: "co1", counterparty_id: "cp2", trailer_number: "111" },
  ];
  const dup = [
    { id: "a", operating_company_id: "co1", counterparty_id: "cp1", trailer_number: "538306" },
    { id: "b", operating_company_id: "co1", counterparty_id: "cp1", trailer_number: "538306" },
  ];

  t("no duplicates on distinct counterparties for the same trailer number", findDuplicates(clean).length === 0);
  t("the real 538306 shape is caught", findDuplicates(dup).length === 1 && findDuplicates(dup)[0].ids.length === 2);
  t("empty input is clean", findDuplicates([]).length === 0);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} selftest OK — 3 cases`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log(`${LABEL}: SKIP — no DATABASE_URL (static-only check would be a false pass on a live-data invariant; this is a live check by design).`);
    process.exit(0);
  }
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL app.bypass_rls = 'lucia'`);
    const res = await client.query(
      `SELECT id::text, operating_company_id::text, counterparty_id::text, trailer_number
       FROM dispatch.non_owned_trailers WHERE voided_at IS NULL`,
    );
    await client.query("ROLLBACK");
    const problems = findDuplicates(res.rows);
    if (problems.length > 0) {
      console.error(`${LABEL}: FAIL — ${problems.length} duplicate (operating_company_id, counterparty_id, trailer_number) group(s):`);
      for (const p of problems) console.error(`  - ${p.key}: ids ${p.ids.join(", ")}`);
      process.exit(1);
    }
    console.log(`${LABEL}: OK — ${res.rows.length} active non_owned_trailers row(s), 0 duplicates.`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`${LABEL}: FAIL — ${err.message}`);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();

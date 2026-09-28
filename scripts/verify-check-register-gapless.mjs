#!/usr/bin/env node
// ROUND 154.1 (Lead order): the check register (banking.check_number_registry) must be GAPLESS per
// bank account -- every integer check_number between the lowest and highest issued number for that
// bank account must have EXACTLY ONE registry row (any status: issued/printed/voided/spoiled all
// count as "accounted for" -- void BURNS the number, it never frees it, so a voided/spoiled row
// closes a gap the same as an issued/printed one). A hole between the min and max is a real missing
// check -- either never entered into the system, or entered and then deleted (forbidden, void-not-
// delete). Duplicate check numbers on the same bank account are a harder violation than a gap.
//
// USMCA only. Read-only: BEGIN READ ONLY, always ROLLBACK. No DATABASE_URL is a FAIL, never a skip
// (ROUND 29.9-B).
export const REQUIRES_LIVE_DB =
  "live money guard; reads banking.check_number_registry and fails closed with no DATABASE_URL";

const LABEL = "verify-check-register-gapless";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

export function findGapsAndDuplicates(rows) {
  // rows: [{ bank_account_id, check_number }]
  const byBank = new Map();
  for (const r of rows) {
    const n = Number(r.check_number);
    if (!Number.isInteger(n)) continue; // non-numeric check numbers (manual/legacy) are out of scope
    if (!byBank.has(r.bank_account_id)) byBank.set(r.bank_account_id, []);
    byBank.get(r.bank_account_id).push(n);
  }
  const gaps = [];
  const duplicates = [];
  for (const [bankAccountId, numbers] of byBank) {
    const counts = new Map();
    for (const n of numbers) counts.set(n, (counts.get(n) ?? 0) + 1);
    for (const [n, c] of counts) {
      if (c > 1) duplicates.push({ bank_account_id: bankAccountId, check_number: n, count: c });
    }
    const uniqueSorted = [...new Set(numbers)].sort((a, b) => a - b);
    if (uniqueSorted.length === 0) continue;
    const min = uniqueSorted[0];
    const max = uniqueSorted[uniqueSorted.length - 1];
    const present = new Set(uniqueSorted);
    for (let n = min; n <= max; n++) {
      if (!present.has(n)) gaps.push({ bank_account_id: bankAccountId, missing_check_number: n });
    }
  }
  return { gaps, duplicates };
}

if (process.argv.includes("--selftest")) {
  const { gaps, duplicates } = findGapsAndDuplicates([
    { bank_account_id: "b1", check_number: "1003" },
    { bank_account_id: "b1", check_number: "1005" }, // gap at 1004
    { bank_account_id: "b1", check_number: "1005" }, // duplicate
    { bank_account_id: "b2", check_number: "2001" },
    { bank_account_id: "b2", check_number: "2002" },
  ]);
  const ok =
    gaps.length === 1 &&
    gaps[0].missing_check_number === 1004 &&
    duplicates.length === 1 &&
    duplicates[0].check_number === 1005 &&
    duplicates[0].count === 2;
  if (!ok) {
    console.error(`${LABEL} --selftest FAIL`, { gaps, duplicates });
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

const url = process.env.DATABASE_URL || process.env.DATABASE_DIRECT_URL;
if (!url) {
  console.error(`${LABEL}: FAIL — DATABASE_URL not set or the database is unreachable. A live money guard that cannot connect is a FAIL, never a pass (ROUND 29.9-B).`);
  process.exit(1);
}
const { default: pg } = await import("pg");
const client = new pg.Client({ connectionString: url });
try {
  await client.connect();
} catch (e) {
  console.error(`${LABEL}: FAIL — database unreachable (${String(e.message).split("\n")[0]}). A live money guard that cannot connect is a FAIL (ROUND 29.9-B).`);
  process.exit(1);
}
let rows;
try {
  await client.query("BEGIN READ ONLY");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");
  const res = await client.query(
    `SELECT bank_account_id::text AS bank_account_id, check_number
       FROM banking.check_number_registry
      WHERE operating_company_id = $1::uuid`,
    [USMCA]
  );
  rows = res.rows;
} finally {
  await client.query("ROLLBACK").catch(() => {});
  await client.end().catch(() => {});
}

const { gaps, duplicates } = findGapsAndDuplicates(rows);
console.log(`${LABEL}: USMCA, ${rows.length} registry row(s) scanned.`);
if (duplicates.length || gaps.length) {
  if (duplicates.length) {
    console.error(`${LABEL}: FAIL — ${duplicates.length} duplicate check number(s):`);
    for (const d of duplicates) console.error(`  ✗ bank ${d.bank_account_id} check ${d.check_number} appears ${d.count} times`);
  }
  if (gaps.length) {
    console.error(`${LABEL}: FAIL — ${gaps.length} gap(s) in the register:`);
    for (const g of gaps.slice(0, 50)) console.error(`  ✗ bank ${g.bank_account_id} missing check_number ${g.missing_check_number}`);
    if (gaps.length > 50) console.error(`  ... and ${gaps.length - 50} more`);
  }
  process.exit(1);
}
console.log(`${LABEL}: PASS — 0 gaps, 0 duplicates across ${rows.length} registry row(s).`);

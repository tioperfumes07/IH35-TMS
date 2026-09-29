#!/usr/bin/env node
/**
 * ROUND 222 — every banking.check_number_registry row with source_kind='check' MUST
 * point at an accounting.expenses row with payment_type='check' (live OR void).
 * Voided checks keep their registry number (QBO parity); orphan registry rows
 * (allocation without a document) are the audit defect the owner named.
 *
 * Live money guard: FAIL closed with no DATABASE_URL (ROUND 29.9-B).
 */
export const REQUIRES_LIVE_DB =
  "live money guard; registry must join check expenses; FAIL closed with no DATABASE_URL";

const LABEL = "verify-check-registry-has-expense-document";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

export function findOrphanRegistryRows(rows) {
  // rows: [{ check_number, source_id, expense_id, payment_type, expense_status }]
  const orphans = [];
  for (const r of rows) {
    if (!r.source_id) {
      orphans.push({ check_number: r.check_number, why: "source_id_null" });
      continue;
    }
    if (!r.expense_id) {
      orphans.push({ check_number: r.check_number, why: "expense_row_missing", source_id: r.source_id });
      continue;
    }
    if (r.payment_type !== "check") {
      orphans.push({
        check_number: r.check_number,
        why: "expense_not_payment_type_check",
        source_id: r.source_id,
        payment_type: r.payment_type,
      });
    }
  }
  return orphans;
}

if (process.argv.includes("--selftest")) {
  const orphans = findOrphanRegistryRows([
    { check_number: "1001", source_id: "a", expense_id: "a", payment_type: "check", expense_status: "void" },
    { check_number: "1002", source_id: null, expense_id: null, payment_type: null, expense_status: null },
    { check_number: "1003", source_id: "c", expense_id: null, payment_type: null, expense_status: null },
    { check_number: "1004", source_id: "d", expense_id: "d", payment_type: "ach", expense_status: "posted" },
  ]);
  const ok =
    orphans.length === 3 &&
    orphans[0].why === "source_id_null" &&
    orphans[1].why === "expense_row_missing" &&
    orphans[2].why === "expense_not_payment_type_check";
  if (!ok) {
    console.error(`${LABEL} --selftest FAIL`, orphans);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

const url = process.env.DATABASE_URL || process.env.DATABASE_DIRECT_URL;
if (!url) {
  console.error(
    `${LABEL}: FAIL — DATABASE_URL not set. A live money guard that cannot connect is a FAIL, never a pass (ROUND 29.9-B).`
  );
  process.exit(1);
}

const { default: pg } = await import("pg");
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
try {
  await client.connect();
} catch (e) {
  console.error(
    `${LABEL}: FAIL — database unreachable (${String(e.message).split("\n")[0]}). ROUND 29.9-B.`
  );
  process.exit(1);
}

let rows;
try {
  await client.query("BEGIN READ ONLY");
  await client.query("SET LOCAL ROLE neondb_owner");
  await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
  const res = await client.query(
    `SELECT r.check_number,
            r.source_id::text AS source_id,
            e.id::text AS expense_id,
            e.payment_type,
            e.status AS expense_status
       FROM banking.check_number_registry r
       LEFT JOIN accounting.expenses e ON e.id = r.source_id
      WHERE r.operating_company_id = $1::uuid
        AND r.source_kind = 'check'
      ORDER BY r.check_number`,
    [USMCA]
  );
  rows = res.rows;
} finally {
  await client.query("ROLLBACK").catch(() => {});
  await client.end().catch(() => {});
}

const orphans = findOrphanRegistryRows(rows);
console.log(`${LABEL}: USMCA, ${rows.length} check registry row(s) scanned.`);
if (orphans.length) {
  console.error(`${LABEL}: FAIL — ${orphans.length} orphan registry row(s):`);
  for (const o of orphans) console.error(" ", o);
  process.exit(1);
}
console.log(
  `${LABEL}: PASS — every check registry row joins an expense with payment_type='check' (void allowed).`
);
process.exit(0);

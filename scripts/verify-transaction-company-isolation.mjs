#!/usr/bin/env node
// ITEM-14 (owner ruling 2026-07-11) — TRANSACTION isolation must never regress.
//
// Owner ruling: master data (mdata.customers/vendors/units/equipment + global reference catalogs) is SHARED
// across TRANSP/TRK/USMCA by design — that is intended, NOT a leak. But NO transaction/posting record may ever
// be created in or read under the wrong company. Every money/ledger table hard-scopes to the ACTIVE company via
//   identity.is_lucia_bypass() OR operating_company_id = current_setting('app.operating_company_id')::uuid
// (verified live on prod, 2026-07-11; the standard tenant policy, incl. the 0385 dynamic fallback applier).
//
// This STATIC guard locks that invariant: it FAILS if any RLS policy on a transaction table in
// accounting.* / banking.* / driver_finance.* is scoped by org.user_accessible_company_ids() (the USER's
// companies — correct for SHARED master data, a LEAK for a transaction) or by bare `true`. Master-data /
// reference tables live in mdata.* / catalogs.* / reference.* — OUTSIDE these schemas — so they are naturally
// exempt and never flagged. Reads the .sql only (no DB, no creds) — non-financial.
// Self-test: node scripts/verify-transaction-company-isolation.mjs --selftest
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const LABEL = "verify-transaction-company-isolation";
// Transaction / posting / ledger schemas. Every table here is money/ledger — none is shared master data.
const TXN_SCHEMAS = ["accounting", "banking", "driver_finance"];

/** Extract every `CREATE POLICY <name> ON <schema>.<table> ... ;` statement whose target schema is a txn schema. */
function txnPolicyStatements(sql) {
  const out = [];
  // Match from CREATE POLICY through the terminating semicolon that closes the statement.
  const re = /CREATE\s+POLICY\s+([a-z0-9_]+)\s+ON\s+(accounting|banking|driver_finance)\.([a-z0-9_]+)([\s\S]*?);/gi;
  let m;
  while ((m = re.exec(sql)) !== null) {
    out.push({ name: m[1], schema: m[2], table: m[3], body: m[0] });
  }
  return out;
}

/** Assert one migration file's txn-table policies keep active-company isolation. Returns failures. */
export function checkSql(sql, file = "<input>") {
  const failures = [];
  for (const p of txnPolicyStatements(sql)) {
    const where = `${file}: policy ${p.name} ON ${p.schema}.${p.table}`;
    // LEAK 1 — a transaction table scoped by the USER's accessible companies instead of the active company.
    if (/user_accessible_company_ids/i.test(p.body)) {
      failures.push(`${where} is scoped by org.user_accessible_company_ids() — that is a TRANSACTION LEAK (use current_setting('app.operating_company_id'))`);
    }
    // LEAK 2 — a bare `true` predicate (no company scope at all). The lucia-bypass policy uses
    // identity.is_lucia_bypass(), never bare `true`, so this does not flag it.
    if (/(USING|WITH\s+CHECK)\s*\(\s*true\s*\)/i.test(p.body)) {
      failures.push(`${where} has a bare (true) predicate — a transaction table must scope to app.operating_company_id`);
    }
    // Positive floor: a txn policy must reference EITHER the active-company setting OR the lucia bypass
    // (child tables may scope via a subquery that still names app.operating_company_id). A policy that
    // references neither is scoping by something unverified — flag it for review.
    if (!/app\.operating_company_id/i.test(p.body) && !/is_lucia_bypass/i.test(p.body)) {
      failures.push(`${where} references neither app.operating_company_id nor is_lucia_bypass() — cannot confirm active-company isolation`);
    }
  }
  return failures;
}

function scanAll() {
  const dir = path.join(ROOT, "db/migrations");
  const failures = [];
  let policyCount = 0;
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".sql"))) {
    const sql = fs.readFileSync(path.join(dir, f), "utf8");
    policyCount += txnPolicyStatements(sql).length;
    failures.push(...checkSql(sql, f));
  }

  // Lock the 0385 dynamic fallback applier: it force-applies the standard tenant policy to any carrier-scoped
  // table missing one — it MUST use app.operating_company_id and MUST NOT use user_accessible_company_ids.
  const dynFile = path.join(dir, "0385_rls_audit_all_tables.sql");
  if (fs.existsSync(dynFile)) {
    const dyn = fs.readFileSync(dynFile, "utf8");
    if (!/app\.operating_company_id/i.test(dyn)) failures.push("0385 dynamic RLS applier must scope by app.operating_company_id");
    if (/user_accessible_company_ids/i.test(dyn)) failures.push("0385 dynamic RLS applier must NOT use user_accessible_company_ids (that would leak transactions)");
  }
  return { failures, policyCount };
}

function selftest() {
  const good = `
    CREATE POLICY bills_scope ON accounting.bills FOR ALL TO ih35_app
      USING (identity.is_lucia_bypass() OR operating_company_id = current_setting('app.operating_company_id', true)::uuid)
      WITH CHECK (identity.is_lucia_bypass() OR operating_company_id = current_setting('app.operating_company_id', true)::uuid);
  `;
  if (checkSql(good).length) {
    console.error(`${LABEL} --selftest FAILED: the canonical active-company policy should pass`, checkSql(good));
    process.exit(1);
  }
  const leakUser = `CREATE POLICY x ON accounting.bills FOR ALL TO ih35_app
      USING (operating_company_id IN (SELECT org.user_accessible_company_ids()));`;
  const leakTrue = `CREATE POLICY y ON banking.bank_transactions FOR SELECT TO ih35_app USING (true);`;
  const mdataShared = `CREATE POLICY c ON mdata.customers FOR ALL TO ih35_app
      USING (operating_company_id IN (SELECT org.user_accessible_company_ids()));`;
  if (checkSql(leakUser).length === 0) { console.error(`${LABEL} --selftest FAILED: user_accessible leak on a txn table must be caught`); process.exit(1); }
  if (checkSql(leakTrue).length === 0) { console.error(`${LABEL} --selftest FAILED: bare (true) on a txn table must be caught`); process.exit(1); }
  if (checkSql(mdataShared).length !== 0) { console.error(`${LABEL} --selftest FAILED: mdata.* shared master data must NOT be flagged (it is exempt)`); process.exit(1); }
  console.log(`${LABEL} --selftest — OK (accepts active-company policy; catches user_accessible & bare-true on txn tables; exempts mdata.*)`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const { failures, policyCount } = scanAll();
  if (failures.length) {
    console.error(`${LABEL} — FAILED`);
    for (const m of failures) console.error(`- ${m}`);
    process.exit(1);
  }
  console.log(`${LABEL} — OK (${policyCount} txn-table policies in ${TXN_SCHEMAS.join("/")} all scope to app.operating_company_id or lucia-bypass; master data exempt)`);
}

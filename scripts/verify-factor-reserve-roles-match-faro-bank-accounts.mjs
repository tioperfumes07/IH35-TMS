#!/usr/bin/env node
// Owner-approved Faro lifecycle 2026-10-02 (docs/bus/00-OWNER-ORDER-2026-10-02-ALL-CODERS-BUILD-100-PERCENT-NO-HANDOFF.md §3,
// migration 202615220800): ONE Faro Security Reserve = 1230 Factoring Reserves. Both reserve ROLES (factor_reserve_held and
// factor_cash_reserve_held — Faro's Escrow Rsv / Cash Rsv are two columns of one reserve) must resolve to that ONE account,
// it must be 1230, and the active Faro reserve bank account (the register Faro's reserve rows feed) must sit on it — so
// posting (role) and the Banking register read the same account. Also: accrued default interest has its own liability role
// (factor_default_interest_payable, 2155) and Transaction Fees their own role (factor_transaction_fee).
// Reads chart-of-accounts configuration only, never balances. Live-only: fails closed without DATABASE_URL.
import pg from "pg";

const LABEL = "verify-factor-reserve-roles-match-faro-bank-accounts";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

export function compare({ roles, banks }) {
  const problems = [];
  const r = (role) => roles.find((x) => x.role === role);
  const held = r("factor_reserve_held");
  const cash = r("factor_cash_reserve_held");
  if (!held) problems.push("role factor_reserve_held is unbound");
  else if (held.account_number !== "1230") problems.push(`role factor_reserve_held -> ${held.account_number}; the one Faro Security Reserve is 1230`);
  if (cash && held && cash.account_id !== held.account_id) problems.push(`role factor_cash_reserve_held -> ${cash.account_number}, not the one reserve ${held.account_number} (a second reserve account)`);
  for (const role of ["factor_default_interest_payable", "factor_transaction_fee"]) if (!r(role)) problems.push(`role ${role} is unbound`);
  const active = banks.filter((b) => b.is_active);
  if (held && !active.some((b) => b.ledger_account_id === held.account_id)) problems.push("no active Faro reserve bank account sits on the reserve account");
  for (const b of active) if (held && b.ledger_account_id !== held.account_id) problems.push(`active Faro reserve bank account "${b.name}" sits on ${b.account_number}, not ${held.account_number}`);
  return problems;
}

if (process.argv.includes("--selftest")) {
  const ok = {
    roles: [
      { role: "factor_reserve_held", account_id: "a1230", account_number: "1230" },
      { role: "factor_cash_reserve_held", account_id: "a1230", account_number: "1230" },
      { role: "factor_default_interest_payable", account_id: "a2155", account_number: "2155" },
      { role: "factor_transaction_fee", account_id: "a6405", account_number: "6405" },
    ],
    banks: [{ name: "Faro Reserve", ledger_account_id: "a1230", account_number: "1230", is_active: true }, { name: "Faro Cash Reserve", ledger_account_id: "a1235", account_number: "1235", is_active: false }],
  };
  const cases = [
    [compare(ok).length === 0, "one reserve passes"],
    [compare({ ...ok, roles: ok.roles.map((x) => (x.role === "factor_reserve_held" ? { ...x, account_id: "a1236", account_number: "1236" } : x)) }).length > 0, "reserve role on 1236 fails"],
    [compare({ ...ok, roles: ok.roles.map((x) => (x.role === "factor_cash_reserve_held" ? { ...x, account_id: "a1235", account_number: "1235" } : x)) }).length > 0, "second reserve account fails"],
    [compare({ ...ok, banks: ok.banks.map((b) => ({ ...b, is_active: true })) }).length > 0, "active bank account on another reserve account fails"],
    [compare({ ...ok, roles: ok.roles.filter((x) => x.role !== "factor_default_interest_payable") }).length > 0, "missing 2155 role fails"],
  ];
  const bad = cases.filter(([pass]) => !pass).map(([, n]) => n);
  if (bad.length) { console.error(`${LABEL} --selftest FAIL: ${bad.join("; ")}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS ${cases.length}/${cases.length}`);
  process.exit(0);
}

const url = process.env.DATABASE_URL;
if (!url) { console.error(`${LABEL}: FAIL — DATABASE_URL not set (live guard fails closed).`); process.exit(1); }
const c = new pg.Client({ connectionString: url, statement_timeout: 30000 });
await c.connect();
let roles = [], banks = [];
try {
  await c.query("BEGIN READ ONLY");
  await c.query("SET LOCAL app.bypass_rls = 'lucia'");
  roles = (await c.query(
    `SELECT r.role, r.account_id::text, a.account_number FROM accounting.chart_of_accounts_roles r JOIN catalogs.accounts a ON a.id = r.account_id
      WHERE r.operating_company_id = $1::uuid AND r.role = ANY($2::text[])`,
    [USMCA, ["factor_reserve_held", "factor_cash_reserve_held", "factor_default_interest_payable", "factor_transaction_fee"]])).rows;
  banks = (await c.query(
    `SELECT COALESCE(b.display_name, b.account_name) AS name, b.ledger_account_id::text, a.account_number, b.is_active
       FROM banking.bank_accounts b LEFT JOIN catalogs.accounts a ON a.id = b.ledger_account_id
      WHERE b.operating_company_id = $1::uuid AND b.account_name IN ('Faro Escrow Reserve', 'Faro Cash Reserve')`, [USMCA])).rows;
  await c.query("ROLLBACK");
} finally {
  await c.end();
}
const problems = compare({ roles, banks });
if (problems.length) { console.error(`${LABEL}: FAIL — ${problems.join("; ")}`); process.exit(1); }
console.log(`${LABEL}: PASS — one Faro Security Reserve (1230): both reserve roles and the active Faro reserve register on it; 2155 interest payable and transaction-fee roles bound`);
